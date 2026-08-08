# Demo runbook

Tonight's pitch, 3 minutes on the clock. Script is in `pitch-script.md`. This is the click path, the fallbacks, and the pre-flight checklist.

## The 3-minute click path

Use a signed-out browser profile so the guest flow shows for real. Have a second tab signed in as @suprapan07 for the remix step.

1. 0:00 Land on playgrokgames.vercel.app. Let the black hole O hit. Click Arcade.
2. 0:15 Shelf. Point at the Breakout family stack, the Top and New chips, and the creator handles on the cards. Ten seconds, don't linger.
3. 0:30 Open Breakout. Play a run and lose on purpose. Losing is the point, the end screen is the pitch.
4. 1:00 End screen. Score saved as a guest, sign-in-to-claim CTA, remix box right there. Say the leaderboard line here.
5. 1:15 Remix from the end screen (signed-in tab). Type one short sentence. Suggested: "make the ball leave a rainbow trail".
6. 1:30 Waiting room. The build log runs live: queued, patching source, compiling, verifying, publishing, each stage timed. Talk over it, this is the harness beat. Builds run about 90 seconds, which is exactly the length of the moat speech.
7. 2:45 New game flips live. Play 5 seconds of it.
8. 2:55 Open /leaderboard. Guests and handles on one global board. Done.

## Pre-warmed remixes

Two remixes are already built and live. If the live build runs long or the runner dies, open one of these and say "here's one we built earlier tonight from one sentence":

- https://playgrokgames.vercel.app/g/two-balls-at-once-144059 (Double Trouble)
- https://playgrokgames.vercel.app/g/invisible-bricks-that-only-f8ff0d

Both verified live over curl before writing this. Re-check them in the 30-minute pass.

## Fallbacks

X bot is DOWN pending re-auth. Do not demo anything that touches live X.

- X dead (current state): skip the live-post beat. Use the fallback line from the script. Don't open x.com on the projector. The game pages carry "reply to this game's post" copy, so don't zoom in on that panel.
- Wifi dies: the game already loaded keeps running, the emulator is client-side. Finish the Breakout run, talk the pipeline over the waiting-room screenshot on your phone, and show the pre-warmed remix from the phone's hotspot if it comes back.
- Runner dies mid-build: waiting room stalls at a stage. Say "build's queued behind demo wifi" and pivot to a pre-warmed remix. Delete the stuck job from pipeline/jobs/ after, don't debug on stage.
- Projector or laptop dies: QR code on the Breakout page, the room plays on phones. That path needs nothing from you.

## 30 minutes before: checklist

Run from ~/grokathon/grokathon with sutrix env loaded (XAI_API_KEY and NOVA_X_SYNC_SECRET come from ~/sutrix/config/env/api-keys.env).

- [ ] Runner alive: `pgrep -f nova_runner.py`. If empty, start it: `python3 pipeline/runner/nova_runner.py`. It must run locally, there's no hosted runner.
- [ ] Job queue empty: `ls pipeline/jobs/` shows nothing. A leftover job builds the wrong game first.
- [ ] X sync clean: `curl -s -X POST https://playgrokgames.vercel.app/api/x/sync -H "x-sync-secret: $NOVA_X_SYNC_SECRET"` returns `"errors":[]`. Errors here mean the bot auth is still dead, stay on the fallback line.
- [ ] Site up: /arcade, /g/breakout, /leaderboard all 200.
- [ ] Card image up: `curl -sI https://playgrokgames.vercel.app/games/breakout/cover.png` returns 200. og:image and twitter:card metas verified on /g/breakout today.
- [ ] Pre-warmed remixes load and play (both links above).
- [ ] Test run: lose a Breakout run, confirm the end screen shows score, sign-in CTA, and the remix box.
- [ ] Browser: signed-out profile for the demo, signed-in tab ready for the remix step, both tabs preloaded.
- [ ] Phone hotspot on and paired to the laptop as backup wifi.
