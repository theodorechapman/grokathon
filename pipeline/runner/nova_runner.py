"""Nova bridge runner: consumes pipeline/jobs/*.json and ships remix bundles.

V1 scope: every job becomes a remix of the reconstructed Breakout (jobs with no
parent are treated as reshaping the breakout template per the prompt). Grok
patches the C source, GBDK builds it, the bundle publishes to the arcade, and
the job file is deleted in the same commit. The pipeline team's harness can
replace this wholesale; the contract is the only interface.

Run: python3 pipeline/runner/nova_runner.py [--once]
Env: XAI_API_KEY (sourced from ~/sutrix/config/env/api-keys.env normally).
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
JOBS = REPO / "pipeline" / "jobs"
BASE_SRC = REPO / "pipeline" / "gbdk-reconstruction" / "breakout"
GAMES = REPO / "arcade" / "public" / "games"
GBDK = Path.home() / "grokathon" / "gbdk"
XAI_KEY = os.environ["XAI_API_KEY"]
MODEL = "grok-4.5"
STATUS_URL = "https://playgrokgames.vercel.app/api/job-status"
SYNC_SECRET = os.environ.get("NOVA_X_SYNC_SECRET", "")


def report(slug: str, stage: str, detail: str = "") -> None:
    try:
        body = json.dumps({"slug": slug, "stage": stage, "detail": detail}).encode()
        req = urllib.request.Request(STATUS_URL, body, {
            "Content-Type": "application/json", "x-runner-secret": SYNC_SECRET,
        })
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        log(f"status report failed ({stage}): {e}")


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def grok(messages: list[dict], timeout: int = 240) -> str:
    body = json.dumps({"model": MODEL, "messages": messages}).encode()
    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {XAI_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)["choices"][0]["message"]["content"]


def extract_c(text: str) -> str:
    m = re.search(r"```(?:c)?\n(.*?)```", text, re.S)
    return (m.group(1) if m else text).strip() + "\n"


def patch_source(prompt: str, error: str | None = None, parent: str | None = None) -> str:
    # Remix lineage: start from the parent's shipped source when it exists so a
    # remix of a remix keeps its parent's changes instead of resetting to base.
    main_c = (BASE_SRC / "main.c").read_text()
    if parent and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", parent):
        parent_src = GAMES / parent / "source.c"
        if parent_src.exists():
            main_c = parent_src.read_text()
    assets_h = (BASE_SRC / "assets.h").read_text()
    system = (
        "You modify a GBDK-2020 Game Boy breakout game written in C. Apply the "
        "player's remix request faithfully but keep the game a winnable brick "
        "breaker: the run must still end in a win or a loss. CRITICAL: the "
        "NOVA_STATE protocol must stay intact exactly — the #define at 0xCF00 "
        "and the writes NOVA_STATE = 1 when play begins, 2 on win, 3 on loss. "
        "The arcade polls that byte to detect the end of a run; a game that "
        "drops those writes never shows an end screen and never gets scores. "
        "Only standard GBDK headers available. Output the "
        "COMPLETE modified main.c and nothing else, in a single ```c code block. "
        "The very first two lines of the code block must be comments naming the "
        "remix: '// TITLE: <punchy 2-4 word game name, max 40 chars, no "
        "Breakout prefix>' then '// DESC: <one short sentence>'."
    )
    user = f"Remix request: {prompt}\n\nassets.h for reference:\n```c\n{assets_h}\n```\n\nCurrent main.c:\n```c\n{main_c}\n```"
    if error:
        user += f"\n\nYour previous attempt failed to compile:\n{error}\nFix it and output the complete corrected main.c."
    return extract_c(grok([{"role": "system", "content": system}, {"role": "user", "content": user}]))


def build_rom(main_c: str, slug: str) -> tuple[Path | None, str]:
    work = Path(tempfile.mkdtemp(prefix=f"nova-{slug}-"))
    for f in ("assets.c", "assets.h"):
        shutil.copy(BASE_SRC / f, work / f)
    (work / "main.c").write_text(main_c)
    rom = work / f"{slug}.gb"
    proc = subprocess.run(
        [str(GBDK / "bin" / "lcc"), "-o", str(rom), "main.c", "assets.c"],
        cwd=work, capture_output=True, text=True, timeout=120,
    )
    if proc.returncode != 0 or not rom.exists():
        return None, (proc.stderr + proc.stdout)[-1500:]
    if rom.stat().st_size != 32768:
        return None, f"unexpected ROM size {rom.stat().st_size}"
    return rom, ""


def make_cover(prompt: str, dest: Path) -> None:
    try:
        body = json.dumps({
            "model": "grok-imagine-image",
            "prompt": f"Retro Game Boy game cover art for a breakout remix: {prompt}. Chunky pixels, teal and violet neon on deep navy, no text, no watermark",
            "n": 1, "aspect_ratio": "16:9",
        }).encode()
        req = urllib.request.Request(
            "https://api.x.ai/v1/images/generations", body,
            {"Content-Type": "application/json", "Authorization": f"Bearer {XAI_KEY}"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            url = json.load(r)["data"][0]["url"]
        urllib.request.urlretrieve(url, dest)
    except Exception as e:  # cover is optional, parent cover is the fallback
        log(f"cover failed ({e}); using parent cover")
        parent_cover = GAMES / "breakout" / "cover.png"
        if parent_cover.exists():
            shutil.copy(parent_cover, dest)


def title_for(prompt: str, main_c: str) -> tuple[str, str]:
    # Grok names the remix in // TITLE: / // DESC: header comments of the C it
    # returns (same call that patches the source). Raw prompt is the fallback.
    def header(tag: str) -> str:
        m = re.search(rf"^\s*//\s*{tag}:\s*(.+)$", main_c[:600], re.M)
        return re.sub(r"\s+", " ", m.group(1)).strip().strip("\"'") if m else ""

    title = header("TITLE")[:40].rstrip(".") or re.sub(r"\s+", " ", prompt).strip().rstrip(".")[:40] or "Remix"
    return title, (header("DESC")[:120] or prompt[:120])


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")


def process_job(job: dict) -> Path | None:
    slug = job["slug"]
    if not SLUG_RE.match(slug):
        log(f"job rejected: unsafe slug {slug!r}")
        return None
    # Draft iteration: target is an existing draft bundle to rebuild in place.
    # Its shipped source.c is the base the prompt edits.
    target = job.get("target")
    if target:
        if not SLUG_RE.match(target):
            log(f"job {slug} rejected: unsafe target {target!r}")
            return None
        slug = target
    log(f"job {slug}: '{job['prompt'][:60]}'")
    report(slug, "queued")
    main_c, rom, err = None, None, None
    for attempt in range(3):
        report(slug, "patching source", f"attempt {attempt + 1}, grok is rewriting the C")
        main_c = patch_source(job["prompt"], err, target or job.get("parent"))
        report(slug, "compiling", "gbdk building the rom")
        rom, err = build_rom(main_c, slug)
        if rom:
            report(slug, "verifying", "rom checks")
            break
        log(f"job {slug}: build failed (attempt {attempt + 1}): {err.splitlines()[-1] if err else '?'}")
    if not rom:
        log(f"job {slug}: giving up after 3 attempts")
        return None

    title, desc = title_for(job["prompt"], main_c)
    bundle = GAMES / slug
    bundle.mkdir(parents=True, exist_ok=True)
    shutil.copy(rom, bundle / f"{slug}.gb")
    make_cover(job["prompt"], bundle / "cover.png")
    manifest = {
        "slug": slug,
        "title": title,
        "description": desc,
        "controls": "left and right arrows to move the paddle",
        "source": "remix" if job.get("parent") else job.get("source", "prompt-gen"),
        "parent": job.get("parent") or "breakout",
        "creator": job.get("creator"),
        "rom": f"{slug}.gb",
        "scoring": "time",
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    if job.get("draft"):
        manifest["draft"] = True
    if target:
        # Rebuild in place: keep the original identity fields so iteration
        # never changes who made it, when, its lineage, or its draft state.
        prev_path = bundle / "manifest.json"
        if prev_path.exists():
            prev = json.loads(prev_path.read_text())
            for key in ("createdAt", "creator", "parent", "source"):
                if key in prev:
                    manifest[key] = prev[key]
            if prev.get("draft"):
                manifest["draft"] = True
    (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (bundle / "source.c").write_text(main_c)
    report(slug, "publishing", "pushing to the arcade")
    log(f"job {slug}: built and bundled")
    return bundle


def cycle() -> int:
    subprocess.run(["git", "pull", "-q", "--no-rebase"], cwd=REPO, check=True)
    job_files = sorted(JOBS.glob("*.json"))[:3]
    if not job_files:
        return 0
    jobs = [json.loads(f.read_text()) for f in job_files]
    with ThreadPoolExecutor(3) as pool:
        bundles = list(pool.map(process_job, jobs))

    shipped = []
    for f, bundle in zip(job_files, bundles):
        if bundle:
            subprocess.run(["git", "add", str(bundle)], cwd=REPO, check=True)
            subprocess.run(["git", "rm", "-q", str(f)], cwd=REPO, check=True)
            shipped.append(bundle.name)
        else:
            f.rename(f.with_suffix(".failed"))
            subprocess.run(["git", "add", "-A", str(JOBS)], cwd=REPO, check=True)
    if shipped or any(b is None for b in bundles):
        msg = f"runner: ship {', '.join(shipped) if shipped else 'nothing'} ({len(job_files)} jobs)"
        subprocess.run(["git", "commit", "-q", "-m", msg], cwd=REPO, check=True)
        for attempt in range(4):
            pushed = subprocess.run(["git", "push", "-q"], cwd=REPO).returncode == 0
            if pushed:
                break
            subprocess.run(["git", "pull", "-q", "--no-rebase"], cwd=REPO, check=True)
        else:
            raise RuntimeError("push failed after retries")
        log(f"pushed: {msg}")
        for name in shipped:
            report(name, "published")
    return len(shipped)


def main() -> None:
    once = "--once" in sys.argv
    log(f"nova runner up (base={BASE_SRC.name}, model={MODEL})")
    while True:
        try:
            cycle()
        except Exception as e:
            log(f"cycle error: {e}")
        if once:
            break
        time.sleep(45)


if __name__ == "__main__":
    main()
