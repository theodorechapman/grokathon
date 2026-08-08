# Pitch script

60 to 90 seconds spoken. If you're over, cut lines, don't talk faster. Demo beat in brackets.

---

Everyone's said "someone should make a game where you..." and then nothing happens. Building is hard and the idea dies in the 5 minutes it's alive.

AI game gen doesn't fix it. You prompt a model, you get a blob of code that half runs, and you can't change it without starting over. No play button, no way to hand it to a friend.

Grok Games. Ask Grok for a game, play it in your browser in about a minute, reshape it live in plain words.

[Demo: someone shouts an idea. Type it into Grok. QR goes up. Everyone plays on their phone. Someone shouts a change. It updates live.]

Here's the part that's actually hard. It's not generation, any strong model writes game code. It's the harness. A bot plays every game before it ships. Does it boot, does input work, can you reach a win, does it crash. If it fails, the agent repairs it and the bot plays again. Nothing ships unverified. That's RL environment work, not prompt work.

Why xAI ships this: every game is a playable card on X that pulls people back to Grok. Sign in with Grok owns the account. That's a growth loop, not a feature.

And the arcade ranks. Upvotes, completions, remixes with credit to the original. Verification keeps broken games out, the crowd ranks fun, so the shelf doesn't fill with slop.

The whole stack is Grok. Grok CLI runs the pipeline, Grok 4.5 writes and repairs, Grok Imagine draws the art.

---

## Likely questions, one-line answers

**"Doesn't Grok already do this?"** Grok hands you code that often doesn't run. We guarantee it runs, and you reshape it in words instead of re-prompting from scratch.

**"How do you know it's fun?"** We don't, the machine only grades playable. The crowd grades fun through ranking and live remix, and we say that out loud.

**"What's the moat?"** The verification gate and the live patch loop. Defining "playable" as machine-checkable signals is the hard part, not the codegen.

**"What ships in 12 hours?"** One 2D arcade template family, verify plus repair, playable link, one live customization path. Everything else is stretch.
