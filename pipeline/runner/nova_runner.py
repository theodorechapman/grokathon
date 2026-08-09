"""Nova bridge runner: consumes pipeline/jobs/*.json and ships remix bundles.

Two paths, GBDK first. Jobs with a parent are remixes: Grok patches the
parent's GBDK C source, GBDK builds it. From-scratch jobs (parent null,
source site or x) transform the reverse-engineered breakout C skeleton into
the asked game — same toolchain, real 32KB ROM, one readable source.c. If
three C attempts fail to compile, the job falls back to a self-contained
index.html browser game so an ask never dead-ends. Either way the bundle
publishes to the arcade and the job file is deleted in the same commit. The pipeline team's harness can
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


def extract_html(text: str) -> str:
    m = re.search(r"```(?:html)?\n(.*?)```", text, re.S)
    return (m.group(1) if m else text).strip() + "\n"


def header_tag(src: str, tag: str) -> str:
    """Read a '// TAG: value' or '<!-- TAG: value -->' header comment near the
    top of generated source. Both pipelines name their games this way."""
    m = re.search(rf"^\s*(?://|<!--)\s*{tag}:\s*(.+?)\s*(?:-->\s*)?$", src[:600], re.M)
    return re.sub(r"\s+", " ", m.group(1)).strip().strip("\"'") if m else ""


TRANSFORM_SYSTEM = (
    "You write GBDK-2020 Game Boy games in C. You are given the C source of a "
    "working breakout game as a skeleton: keep its structure (init, main loop, "
    "vblank timing, joypad reads) but transform it into the game the player "
    "asked for. It does NOT have to stay a brick breaker — rewrite sprites, "
    "logic, and rules freely. You may define new tile data in main.c; the "
    "skeleton's assets.h tiles are available but optional. "
    "The game must be winnable and losable, with a clear win players can reach "
    "in one sitting: the board ranks fastest win, so an unwinnable game never "
    "scores. CRITICAL: the NOVA_STATE protocol must stay intact exactly — the "
    "#define at 0xCF00 and the writes NOVA_STATE = 1 when play begins, 2 on "
    "win, 3 on loss. The arcade polls that byte for the end screen and run "
    "timing. The skeleton ships APU sound helpers — sound_init(), sfx_beep(), "
    "sfx_boom(), sfx_jingle() — reuse or retune them instead of raw NRxx code. "
    "Runs must not be deterministic: seed variation from DIV_REG on the first "
    "input so spawns or angles differ run to run. "
    "Only standard GBDK headers available. Output the COMPLETE main.c and "
    "nothing else, in a single ```c code block. The very first three lines of "
    "the code block must be comments: '// TITLE: <2-4 word game name, max 40 "
    "chars; if the ask names a known game like snake or pong, keep that name>' "
    "then '// DESC: <one short sentence>' then '// CONTROLS: <one short line, "
    "d-pad and A on a Game Boy>'."
)


def patch_source(
    prompt: str,
    error: str | None = None,
    parent: str | None = None,
    transform: bool = False,
) -> str:
    # Remix lineage: start from the parent's shipped source when it exists so a
    # remix of a remix keeps its parent's changes instead of resetting to base.
    main_c = (BASE_SRC / "main.c").read_text()
    if parent and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", parent):
        parent_src = GAMES / parent / "source.c"
        if parent_src.exists():
            main_c = parent_src.read_text()
    assets_h = (BASE_SRC / "assets.h").read_text()
    if transform:
        user = (
            f"Game to build: {prompt}\n\nassets.h for reference:\n```c\n{assets_h}\n```"
            f"\n\nBreakout skeleton main.c:\n```c\n{main_c}\n```"
        )
        if error:
            user += (
                f"\n\nYour previous attempt failed to compile:\n{error}\n"
                "Fix it and output the complete corrected main.c."
            )
        return extract_c(grok([{"role": "system", "content": TRANSFORM_SYSTEM}, {"role": "user", "content": user}]))
    system = (
        "You modify a GBDK-2020 Game Boy breakout game written in C. Apply the "
        "player's remix request faithfully but keep the game a winnable brick "
        "breaker: the run must still end in a win or a loss. CRITICAL: the "
        "NOVA_STATE protocol must stay intact exactly — the #define at 0xCF00 "
        "and the writes NOVA_STATE = 1 when play begins, 2 on win, 3 on loss. "
        "The arcade polls that byte to detect the end of a run; a game that "
        "drops those writes never shows an end screen and never gets scores. "
        "The base source ships APU sound helpers — sound_init() (called once "
        "at boot), sfx_beep() (square blip), sfx_boom() (noise burst), "
        "sfx_jingle() (win arpeggio) — reuse or retune them for any new sound "
        "moment instead of writing raw NRxx register code. "
        "Runs must not be deterministic: seed variation from DIV_REG (e.g. on "
        "the first paddle input) so ball angles or spawns differ run to run "
        "and a memorized perfect run doesn't exist. "
        "Only standard GBDK headers available. Output the "
        "COMPLETE modified main.c and nothing else, in a single ```c code block. "
        "The very first two lines of the code block must be comments naming the "
        "remix: '// TITLE: <2-4 word game name, max 40 chars>' then "
        "'// DESC: <one short sentence>'. If the ask names a known game or "
        "mechanic, keep that name recognizable in the title (Wide Paddle "
        "Breakout, not an invented fantasy name)."
    )
    user = f"Remix request: {prompt}\n\nassets.h for reference:\n```c\n{assets_h}\n```\n\nCurrent main.c:\n```c\n{main_c}\n```"
    if error:
        user += f"\n\nYour previous attempt failed to compile:\n{error}\nFix it and output the complete corrected main.c."
    return extract_c(grok([{"role": "system", "content": system}, {"role": "user", "content": user}]))


HTML_SYSTEM = (
    "You write complete browser games as a single self-contained index.html "
    "file. Implement the player's game idea faithfully as a small, fun, "
    "finishable arcade game: every run must end in a win or a loss.\n"
    "Hard rules:\n"
    "- Everything inline: all JS and CSS live in the file. No CDN, no external "
    "URLs, no fetch/XHR, no imports, no web fonts. data: URIs are fine.\n"
    "- Keyboard AND touch controls must both work.\n"
    "- The game sizes itself to its viewport at any frame size from a phone to "
    "a desktop: scale to fit, no scrolling, no overflow, nothing cut off. It "
    "runs in an iframe with scrolling disabled.\n"
    "- No console errors on boot or during play.\n"
    "- Runs must not be deterministic: use Math.random() so spawns, angles, "
    "or layouts differ run to run and a memorized perfect run doesn't exist.\n"
    "- REQUIRED: the moment a run ends (win, lose, or game over), post the "
    'score: window.parent.postMessage({type:"nova:score", score:<number>, '
    'outcome:"win"|"loss", message:"<short line in the game\'s voice, max 120 '
    'chars>"}, "*"). score is required (0 is fine). Then freeze play. Do NOT '
    "draw your own sign-in, claim, retry, or share UI — the arcade renders "
    "the end screen over the frozen game.\n"
    "Output ONLY the html in a single ```html code block. The very first "
    "lines of the file must be these header comments:\n"
    "<!-- TITLE: <2-4 word game name, max 40 chars; if the ask names a known "
    "game like snake or pong, keep that name in the title instead of "
    "inventing one> -->\n"
    "<!-- DESC: <one short sentence> -->\n"
    "<!-- CONTROLS: <one short line saying how to play> -->\n"
    '<!-- SCORING: points -->  (write "time" instead ONLY for a race-to-finish '
    "where faster is better; then score is elapsed milliseconds)"
)


def generate_html(prompt: str, error: str | None = None, base_html: str | None = None) -> str:
    if base_html:
        user = (
            f"Edit request: {prompt}\n\nApply it to this existing game and "
            f"output the complete updated index.html:\n```html\n{base_html}\n```"
        )
    else:
        user = f"Game idea: {prompt}"
    if error:
        user += f"\n\nYour previous attempt was rejected:\n{error}\nFix it and output the complete corrected index.html."
    return extract_html(grok([{"role": "system", "content": HTML_SYSTEM}, {"role": "user", "content": user}]))


def validate_html(html: str) -> str:
    """Cheap pre-ship checks against the bundle contract. Empty string = pass."""
    if not html.strip():
        return "output was empty"
    if "nova:score" not in html:
        return 'missing the required window.parent.postMessage({type:"nova:score",...}) call'
    lower = html.lower()
    if "<canvas" not in lower and "<body" not in lower:
        return "no <canvas> or <body> element; this does not look like a complete html page"
    # Self-contained: no external resource references. xmlns namespace URIs
    # are inert identifiers, so strip them before scanning; data: URIs never
    # match the scheme pattern.
    stripped = re.sub(r"xmlns(?::[\w-]+)?\s*=\s*([\"'])https?://[^\"']*\1", "", html)
    if re.search(r"https?://", stripped):
        return "references an external http(s) URL; the file must be fully self-contained"
    return ""


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


def make_cover(prompt: str, dest: Path, art: str = "Retro Game Boy game cover art for a breakout remix") -> None:
    try:
        body = json.dumps({
            "model": "grok-imagine-image",
            "prompt": f"{art}: {prompt}. Chunky pixels, teal and violet neon on deep navy, no text, no watermark",
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


def title_for(prompt: str, src: str) -> tuple[str, str]:
    # Grok names the game in TITLE / DESC header comments of the source it
    # returns (same call that writes the code). Raw prompt is the fallback.
    title = header_tag(src, "TITLE")[:40].rstrip(".") or re.sub(r"\s+", " ", prompt).strip().rstrip(".")[:40] or "Remix"
    return title, (header_tag(src, "DESC")[:120] or prompt[:120])


SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")


def wants_browser_game(job: dict, target: str | None) -> bool:
    """Everything takes the GBDK path first — creations transform the breakout
    C skeleton, remixes patch their parent's source. The only jobs that start
    on the html path are iterations of drafts that already shipped as html."""
    if job.get("parent") or job.get("source") not in ("site", "x"):
        return False
    return bool(target) and (GAMES / target / "index.html").exists()


def process_browser_job(job: dict, slug: str, target: str | None) -> Path | None:
    base_html = None
    if target and (GAMES / target / "index.html").exists():
        base_html = (GAMES / target / "index.html").read_text()
    html, err = None, None
    for attempt in range(3):
        report(slug, "writing the game", f"attempt {attempt + 1}, {MODEL} writing a self-contained index.html")
        try:
            html = generate_html(job["prompt"], err, base_html)
        except Exception as e:
            err = f"generation call failed: {e}"
            log(f"job {slug}: {err} (attempt {attempt + 1})")
            continue
        report(slug, "verifying", "contract checks: self-contained, nova:score wired, fits any viewport")
        err = validate_html(html)
        if not err:
            break
        log(f"job {slug}: html rejected (attempt {attempt + 1}): {err}")
    if html is None or err:
        log(f"job {slug}: giving up after 3 attempts")
        return None

    title, desc = title_for(job["prompt"], html)
    bundle = GAMES / slug
    bundle.mkdir(parents=True, exist_ok=True)
    (bundle / "index.html").write_text(html)
    report(slug, "cover art", "grok-imagine drawing the cover")
    make_cover(job["prompt"], bundle / "cover.png", art="Retro arcade cover art for a browser game")
    manifest = {
        "slug": slug,
        "title": title,
        "description": desc,
        "controls": header_tag(html, "CONTROLS")[:120] or "arrows or touch to play",
        "source": job.get("source", "site"),
        "parent": None,
        "creator": job.get("creator"),
        "scoring": "time" if header_tag(html, "SCORING").lower() == "time" else "points",
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
    report(slug, "publishing", "pushing to the arcade")
    log(f"job {slug}: browser game bundled")
    return bundle


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
    # From-scratch prompts (no parent) from the site or X build browser games;
    # remixes and GBDK draft iterations keep the breakout patch path below.
    if wants_browser_game(job, target):
        return process_browser_job(job, slug, target)
    lineage = target or job.get("parent")
    # A from-scratch creation: no lineage to patch, so the skeleton transforms.
    creating = lineage is None
    report(
        slug,
        "forking source",
        f"starting from {lineage}'s shipped source.c" if lineage
        else "transforming the C reverse-engineered out of the original Breakout rom",
    )
    main_c, rom, err = None, None, None
    for attempt in range(3):
        report(slug, "patching source", f"attempt {attempt + 1}, {MODEL} rewriting the C")
        main_c = patch_source(job["prompt"], err, lineage, transform=creating)
        report(slug, "compiling", "gbdk lcc building a real 32KB .gb rom")
        rom, err = build_rom(main_c, slug)
        if rom:
            report(slug, "verifying", f"NOVA_STATE protocol at WRAM 0xCF00, rom is {rom.stat().st_size} bytes")
            break
        log(f"job {slug}: build failed (attempt {attempt + 1}): {err.splitlines()[-1] if err else '?'}")
    if not rom:
        if creating and job.get("source") in ("site", "x"):
            log(f"job {slug}: C path failed 3 attempts, falling back to a browser game")
            return process_browser_job(job, slug, target)
        log(f"job {slug}: giving up after 3 attempts")
        return None

    title, desc = title_for(job["prompt"], main_c)
    bundle = GAMES / slug
    bundle.mkdir(parents=True, exist_ok=True)
    shutil.copy(rom, bundle / f"{slug}.gb")
    report(slug, "cover art", "grok-imagine drawing the cover")
    make_cover(
        job["prompt"], bundle / "cover.png",
        art="Retro Game Boy game cover art" if creating
        else "Retro Game Boy game cover art for a breakout remix",
    )
    manifest = {
        "slug": slug,
        "title": title,
        "description": desc,
        "controls": header_tag(main_c, "CONTROLS")[:120]
        or ("d-pad and A, arrows on desktop" if creating else "left and right arrows to move the paddle"),
        "source": "remix" if job.get("parent") else job.get("source", "prompt-gen"),
        "parent": job.get("parent") or (None if creating else "breakout"),
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


def poke_sync() -> None:
    """Kick the arcade's X sync. GitHub's cron is best-effort and stalls for
    an hour at a time; the runner loop is always alive, so it drives the
    cadence and the cron is just backup."""
    if not SYNC_SECRET:
        return
    try:
        req = urllib.request.Request(
            "https://playgrokgames.vercel.app/api/x/sync",
            b"{}",
            {"Content-Type": "application/json", "x-sync-secret": SYNC_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        log(f"sync poke failed: {e}")


def main() -> None:
    once = "--once" in sys.argv
    log(f"nova runner up (base={BASE_SRC.name}, model={MODEL})")
    last_sync = 0.0
    while True:
        try:
            cycle()
        except Exception as e:
            log(f"cycle error: {e}")
        if once:
            break
        if time.time() - last_sync >= 120:
            poke_sync()
            last_sync = time.time()
        time.sleep(45)


if __name__ == "__main__":
    main()
