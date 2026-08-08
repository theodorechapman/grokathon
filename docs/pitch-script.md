# Pitch script

60 to 90 seconds spoken. If you're over, cut lines, don't talk faster. Demo beat in brackets.

---

Everyone's said "someone should make a game where you..." and then nothing happens. Building is hard and the idea dies in the 5 minutes it's alive.

AI game gen doesn't fix it. You prompt a model, you get a blob of code that half runs, and you can't change it without starting over. No play button, no way to hand it to a friend.

This is Nova. Every game starts as a sentence. Built on Grok, live right now at playgrokgames.vercel.app.

[Open the site. Landing hits with the black hole O. Click into the arcade.]

[Sign in with X in the popup. Type a sentence on the create page. The waiting room appears while the pipeline builds.]

[QR goes up for Breakout. The room plays on their phones. Scores land on the leaderboard live.]

That Breakout isn't generated from a prompt. We reverse-engineered it from a Game Boy ROM and it runs in your browser on a JS emulator. Same pipeline, harder input.

Here's the part that's actually hard. It's not generation, any strong model writes game code. It's the harness. A bot plays every game before it ships. Does it boot, does input work, can you reach a win, does it crash. If it fails, the agent repairs it and the bot plays again. Nothing ships unverified. That's RL environment work, not prompt work.

And it spreads. Every shipped game auto-posts to X. Reply to the post and your reply becomes a remix, credited to you. The arcade ranks by votes and plays, so the crowd sorts fun from slop.

[If time: tap remix on a game card, show the lineage.]

---

## Likely questions, one-line answers

"Doesn't Grok already do this?" Grok hands you code that often doesn't run. We guarantee it runs, and you reshape it in words instead of re-prompting from scratch.

"How do you know it's fun?" We don't, the machine only grades playable. The crowd grades fun through votes and plays, and we say that out loud.

"What's the moat?" The verification gate. Defining "playable" as machine-checkable signals is the hard part, not the codegen. The reverse-engineered Breakout proves the harness handles code nobody wrote for it.

"What's the X loop?" Each shipped game auto-posts. Replies become remix jobs credited to the replier, and mentioning the account creates a game. Every post is a door back into Nova.

"Why gate create but not play?" Create needs a handle so games and scores have an owner. Play is the growth surface and judges count users, so it never sees a login wall.

"How do you count users?" Vercel Analytics on the site plus Redis play counts per game, attributed to handles when signed in.
