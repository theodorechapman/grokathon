# Pitch script

60 to 90 seconds spoken. If you're over, cut lines, don't talk faster. Demo beat in brackets. Click path with exact timings lives in `runbook.md`.

---

Everyone's said "someone should make a game where you..." and then nothing happens. Building is hard and the idea dies in the 5 minutes it's alive.

AI game gen doesn't fix it. You prompt a model, you get a blob of code that half runs, and you can't change it without starting over. No play button, no way to hand it to a friend.

This is Nova. Every game starts as a sentence. Built on Grok, live right now at playgrokgames.vercel.app.

[Open the site. Landing hits with the black hole O. Click into the arcade.]

The shelf stacks by family. Breakout sits up top with its remixes under it, Top and New sort the rest. Every card carries its creator's handle. It's a community arcade, not a demo reel.

[Open Breakout. Play a run and lose on purpose.]

That Breakout isn't generated from a prompt. We reverse-engineered it from a Game Boy ROM and it runs in your browser on a JS emulator. Same pipeline, harder input.

[End screen: score saved, sign-in-to-claim, remix box right there.]

The end screen does the selling. Your score lands on the global leaderboard even as a guest. Sign in with X and your guest plays merge under your handle. And remix is one sentence away, right where you just lost.

[Type a remix sentence. Waiting room shows the live build log: patching source, compiling, verifying, publishing, each stage timed.]

Here's the part that's actually hard. It's not generation, any strong model writes game code. It's the harness. A bot plays every game before it ships. Does it boot, does input work, can you reach a win, does it crash. If it fails, the agent repairs it and the bot plays again. Nothing ships unverified. And you watch it happen: every game page shows the build log with stage timings. Glass box, not magic.

[New game goes live. Open the leaderboard, show guests and handles on one board.]

AT RISK, X bot down pending re-auth. If it's back: "And it spreads. Every ship announces as a reply in its parent game's X thread, and replying to a post becomes a remix credited to you." If it's not, use the fallback: "The X loop is wired end to end. Ships announce into the parent's thread and replies come back as remix jobs credited to the replier. Tonight we drove it from the arcade because that's the fastest door in."

The arcade ranks by votes and plays, so the crowd sorts fun from slop.

---

## Likely questions, one-line answers

"Doesn't Grok already do this?" Grok hands you code that often doesn't run. We guarantee it runs, and you reshape it in words instead of re-prompting from scratch.

"How do you know it's fun?" We don't, the machine only grades playable. The crowd grades fun through votes and plays, and we say that out loud.

"What's the moat?" The verification gate. Defining "playable" as machine-checkable signals is the hard part, not the codegen. The reverse-engineered Breakout proves the harness handles code nobody wrote for it.

"What's the X loop?" Each ship announces as a reply in its parent game's thread. Replies become remix jobs credited to the replier, and mentioning the account creates a game. (AT RISK: bot is down pending re-auth. If asked while it's down, say the loop is built and wired through the sync endpoint, and we're re-authing the bot account.)

"Why gate create but not play?" Create needs a handle so games and scores have an owner. Play and the leaderboard never see a login wall. Guests are on the global board and sign-in merges their plays under their handle.

"How do you count users?" Vercel Analytics on the site plus Redis play counts per game, attributed to handles when signed in.
