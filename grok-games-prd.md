# Grok Games — spec

Draft. Grokathon, Aug 8. Team: Supratik, Theo, Henry.

## One-liner

Ask Grok for a game, play it in seconds, reshape it live with the room. It proves the game works before you play.

## The problem

Everyone has said "someone should make a game where you..." and nothing happens. The idea dies because building is hard. You can't code, or you can but not in the 5 minutes the idea is alive.

AI game-gen doesn't fix this yet. You prompt a model, you get a blob of code that half-runs, and you can't change it without starting over. There's no play button, no way to tweak it in plain words, no way to hand it to a friend.

Room test: a non-dev hears this and thinks "I've wanted to make or remix a game." That's most people.

## Who has it

Grok users. Non-technical. People in a group chat, at a party, at a hackathon, a kid who wants a game about their dog. Low floor, high want.

## Input / output

Input: a plain-language ask in Grok. "Make a game where you dodge falling tacos." "Flappy Bird but two players." "Take this game and make gravity low." Optional image or clip as a reference. Optional sign in with Grok to save and own it.

Output: a playable game running in the browser in seconds. Canvas or WASM, no install. A link anyone clicks and plays. Embeds on X, plays inside Grok, saved to your Grok account, open to remix.

## Where it lives

Not one surface. Three, each doing one job.

- Create in Grok. The ask and the auth start here. Sign in with Grok.
- Play in the browser. Instant, no install, runs in the Grok webview and on an X card.
- Share on X. Every shared game is a playable card that pulls people back to Grok.

Browser is the play surface because it's the only one that's instant and works everywhere. X is the growth loop. Grok is the front door.

Hosting: one Grok Games site, not a new site per game. Every game ships as a route on the same hosted arcade, something like grokgames.app/g/taco-dodge. A new game is a new route, not a new deploy. That keeps one deploy target, stable links for X cards and the Grok webview, and it gives us the arcade page for free: browse what's been made, play it, remix it. Remix culture needs a shared shelf.

## The loop

Seven stages. Each one is one sentence.

1. Ask. You prompt Grok for a game, or a remix of one that exists.
2. Spec. The harness turns the ask into a game spec: mechanics, controls, win and lose, assets.
3. Build. An agent writes the game as browser-runnable code in a sandbox.
4. Verify. A bot actually plays it. Does it boot, does input work, can you reach a win state, does it crash or soft-lock. This is the gate.
5. Repair. If verify fails, the agent fixes it and re-runs, up to a cap. Nothing ships unverified.
6. Ship. Playable link, runs in-browser, embeds to X, plays in Grok.
7. Customize. You or the room send a change in plain words. The harness patches it and re-verifies live.

## Why xAI ships this

Usefulness, and it's aimed at their own platform.

- It's a Grok-native consumer surface with distribution built in. Every game shared to X is a hook back to Grok. That's a growth loop, not a feature.
- Sign in with Grok gives them accounts and retention off the back of it.
- It moves Grok from "gives answers" to "makes things you can use and share." That's platform expansion.
- The want is common and the output is shareable, so it spreads on its own.

## Technical depth

The moat is not the generation. Any strong model generates game code. The moat is the harness around it.

- Reliable spin-up across game types, not one lucky prompt.
- A real verification layer: an agent that plays the game and grades it on checkable signals. Boots. Input responsive. Win state reachable. No crash, no soft-lock. Frame budget met.
- A bounded self-repair loop driven by what verify caught.
- Live patch-and-re-verify from plain language, so a human stays in the loop instead of watching a one-shot pipeline.

The verification layer is the hard part and the one that scores. Defining "is this actually playable" as signals a machine can check is RL-environment work, not prompt work. That's the technical spine.

## Why this beats "Grok already does that"

A raw model hands you code that often doesn't run, and to change it you re-prompt from scratch. Grok Games guarantees it runs, lets you reshape it in words, and makes it playable and shareable the second it's done. The product is the reliability and the loop, not the tokens.

It also isn't one-shottable. A coding agent can't fake distributed live customization or a verification gate in a single pass. That was the bar from day one.

## Demo

Audience shouts a game idea. You type it into Grok. It spins up. QR goes on screen. Everyone plays it on their phones in about 60 to 90 seconds. Someone shouts a change. It updates live and they play the new version. Recorded fallback ready in case the live run flakes.

## Scope for 12 hours

Core, about 6 hours:

- Harness: prompt to a browser game, held to one template family so it's reliable. Pick 2D arcade: dodger, breakout, runner, simple shooter.
- Verification play-test plus bounded self-repair.
- Playable link.
- One live customization path.

Integrations, the Grok stack:

- Grok CLI runs the pipeline. Spec, build, verify, repair all execute as Grok CLI agents in the sandbox.
- Grok 4.5 for spec, code, and repair.
- Structured outputs for the game spec.
- Grok Imagine for the art: sprites, backgrounds, and the cover image on the share card. Templates ship with placeholder art so a slow or failed image call never blocks a playable game.
- Grok Voice (Voice Agent API) only where a game calls for voice. Voice as an input method stays stretch.
- Sign in with Grok, real or stubbed for the demo.

Stretch, only if core is solid:

- Multiplayer.
- Image or clip reference.
- Voice input via the Voice Agent API.
- X embed card.
- Wider game types.

## Hard calls

- Browser or WASM, not low-level native. Instant play is the requirement, and native code will flake live in 12 hours.
- Narrow the game space to one template family for the demo. Breadth is a trap.
- The verification gate has to be real. Cut it and the whole pitch collapses into "Grok makes game code." No "it plays" claim unless the bot cleared it.
- Honest framing. It's a generated, verified-playable game. Not AAA.

## Risks

- Generation reliability under time pressure. Mitigate with templates, verification, and a fallback recording.
- "Grok already does this" read. Lead the pitch with verification and live customization, not generation.
- Verify can check playable, not fun. Say so. Machine grades playability, the room judges fun through the live remix.
- Live demo flake. Recorded fallback and pre-warmed examples.

## Open questions, all closed

- Template space: 2D arcade only. Decided in hard calls.
- Auth: stubbed on the day. Upgrade to real Sign in with Grok only if core lands early.
- Multiplayer: stretch, out of core.
- Verify signals: draft stands. Boots, input responsive, win reachable, no crash or soft-lock, frame budget. Henry owns it.

First 30 minutes before code: confirm working keys for Grok 4.5, Grok CLI, and Grok Imagine, and pick who deploys the arcade site so routes exist before the first game generates.
