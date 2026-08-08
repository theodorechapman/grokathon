# Nova spec

Grokathon, Aug 8. Team: Supratik (consumer surface, integrations), Theo and Henry (pipeline, reverse engineering). Grok Games was the working title. The product shipped as Nova.

## One-liner

Every game starts as a sentence. Built on Grok. Type what you want, the pipeline builds it, verifies it plays, and ships it to the arcade. Live at https://playgrokgames.vercel.app.

## The problem

Everyone has said "someone should make a game where you..." and nothing happens. The idea dies because building is hard. You can't code, or you could but not in the 5 minutes the idea stays alive.

AI game-gen doesn't fix this yet. You prompt a model, you get a blob of code that half-runs, and you can't change it without starting over. There's no play button, no tweaking it in plain words, no handing it to a friend.

Room test: a non-dev hears this and thinks "I've wanted to make or remix a game." That's most people.

## Who has it

Non-technical people. A group chat, a party, a hackathon, a kid who wants a game about their dog. Low floor, high want.

## Input / output

Input: a sentence on the create page. "Make a game where you dodge falling tacos." "Breakout but gravity flips." Creating requires Sign in with X. Playing never does.

Output: a playable game in the browser. No install. A stable link anyone taps and starts. It joins the arcade shelf, open to remix.

## Where it lives

One site, three jobs.

- Landing. Grok Imagine art. The NOVA lockup uses a black hole as the O, with an animated hero video from grok-imagine-video.
- Arcade. The shared shelf. Cards show cover, title, source tag, description, play button, upvote, and play count. Filter chips: 1 player, 2 players, reverse-engineered, prompted, remixes. A My games rail collects your own creations.
- Create. Gated behind Sign in with X. Your sentence becomes a job, the pipeline builds it, and you wait in the waiting room at /g/<slug> until it ships.

Hosting: one arcade at playgrokgames.vercel.app. Every game is a route, not a new deploy. A GitHub Action auto-deploys on any merge touching arcade/. Stable links, a single deploy target, and the shelf comes free.

## Auth

Sign in with X. OAuth2 PKCE in a popup, 7-day session, @handle chip in the nav. Create and Leaderboard only appear in the nav when you're signed in. Playing is never gated. The gate exists to attribute creations and scores to a real handle, not to keep anyone out.

## The arcade ranks

Generation is cheap, so the shelf fills with slop unless something sorts it. Shipped ranking: votes times 3 plus plays, default sort. Upvote button and play count on every card.

- Upvotes. Cheapest signal, already live.
- Plays. Counted in Redis, attributed to whoever's signed in.
- Remixes as the strongest evidence. Somebody cared enough to alter it. Remixes credit the original, so a good base game climbs as its remixes spread.
- X engagement folding back into rank remains future work.

Two gates, two jobs: verification keeps unplayable games out entirely, ranking keeps boring ones down. The machine certifies playable, the crowd decides fun.

## Leaderboard

Players ranked by plays and distinct games played. Signed-in plays are attributed to the handle. Filter chips flip over to per-game high-score boards.

Score contract: every game must postMessage {type:"nova:score",score:N} on game over. Redis keeps each player's personal best per title. Signed-out players who finish a game get a claim-your-score banner that prompts sign-in.

## The loop

Seven stages. Each one is one sentence.

1. Ask. You type a sentence on the create page, or reply to a game's X post to remix it.
2. Spec. The harness converts the ask into a blueprint: mechanics, controls, win and lose, assets.
3. Build. An agent writes the game as browser-runnable code in a sandbox.
4. Verify. A bot actually plays it. Does it boot, does input work, can you reach a win state, does it crash or soft-lock. This is the gate.
5. Repair. If verify fails, the agent fixes it and re-runs, up to a cap. Nothing ships unverified.
6. Ship. The bundle lands in arcade/public/games/<slug>/, the auto-deploy runs, and the waiting room flips to the game.
7. Customize. A remix ask goes back through the same pipeline as a new job credited to the remixer.

Plumbing: POST /api/create commits a job file to pipeline/jobs/<slug>.json. The repo is the queue. The pipeline picks it up, builds, verifies, and commits the bundle. No job server to babysit.

## First game

Breakout, live now. Reverse-engineered from a Game Boy ROM. Theo and Henry's pipeline reconstructed it in GBDK and it runs on a JS gameboy emulator in the browser. That's the reverse-engineered tag on the shelf.

## The X loop (in flight)

- Every finished title auto-posts to X.
- Replies to that post become remix jobs, credited to the replier.
- Mentioning the account creates a game.

Every game shared to X is a hook back to Nova. That's a growth loop, not a feature.

## Technical depth

The moat is not the generation. Any strong model generates game code. The moat is the harness around it.

- Reliable spin-up across game types, not one lucky prompt.
- A real verification layer: an agent that plays the game and grades it on checkable signals. Boots. Input responsive. Win state reachable. No crash, no soft-lock. Frame budget met.
- A bounded self-repair loop driven by what verify caught.
- The reverse-engineering track: a ROM goes in, a verified browser port comes out. Harder than codegen and it proves the harness handles code nobody wrote for it.

The verification layer is the hard part and the one that scores. Defining "is this actually playable" as signals a machine can check is RL-environment work, not prompt work. That's the technical spine.

## Why this beats "Grok already does that"

A raw model hands you code that often doesn't run, and to change it you re-prompt from scratch. Nova guarantees it runs, lets you reshape it in words, and makes it playable and shareable the second it's done. The product is the reliability and the loop, not the tokens.

It also isn't one-shottable. A coding agent can't fake a verification gate, an attributed leaderboard, and an X remix loop in a single pass. That was the bar from day one.

## Demo

Open the site. Sign in with X in the popup. Type a sentence on the create page. Show the waiting room. QR goes on screen for Breakout. The room plays on phones and scores hit the leaderboard live. Judging rewards most users, and Vercel Analytics alongside Redis counters measure exactly that.

## Scope, shipped vs not

Shipped:

- Landing with Grok Imagine art and the animated hero.
- Arcade shelf with cards, filter chips, ranked sort, My games rail.
- Sign in with X, PKCE popup, 7-day session.
- Create flow: sentence to job file to built bundle, waiting room at /g/<slug>.
- Leaderboard covering player rankings and per-title high scores.
- Score claim contract and Redis best-score storage.
- Breakout, reverse-engineered from a Game Boy ROM.
- Auto-deploy GitHub Action on arcade/ merges.

In flight:

- X loop: auto-post on ship, replies as remix jobs, mentions as create.

Stretch, honestly not built: multiplayer, image or clip reference input, voice input, X engagement feeding rank, and wider game types. None of these exist yet and we don't claim them.

## Hard calls

- Browser, not native. Instant play is the requirement.
- The verification gate has to be real. Cut it and the whole pitch collapses into "a model makes game code." No "it plays" claim unless the bot cleared it.
- Play is never gated. Auth exists for attribution, not access. Judges count users, and a login wall kills that.
- The repo as the queue. No job infrastructure to stand up or watch during the hackathon.
- Honest framing. Generated, verified-playable games. Not AAA.

## Risks

- Generation reliability under time pressure. Blunted by the verify gate and titles already sitting on the shelf.
- "Grok already does this" read. Lead with verification and the reverse-engineered Breakout, not generation.
- Verify can check playable, not fun. Say so. Machine grades playability, the crowd judges fun through votes and plays.
- Demo flake. Breakout exists today, so the audience beat can't fail even when a fresh build runs long.
