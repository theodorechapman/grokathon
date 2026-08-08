---
name: ship
description: Use when Supratik says "ship it", "new pr and merge it", "pr and merge to main", or wants current file changes landed as a merged PR without ceremony. Covers branch, commit, push, PR, merge, sync.
---

# Ship

Land the current changes in the active repo as a merged PR, no confirmation stops.

1. From the repo root, check `git status`. If on main, create a branch: `git checkout -b <short-slug>` named after the change.
2. Commit the intended files with a short lowercase message. Don't `git add -A` blindly; add the files this task touched.
3. Push with `git push -u origin <branch>`.
4. `gh pr create` against main. Body is 2 to 4 sentences in Supratik's voice: short declaratives, contractions, bare numbers, no em dashes, no semicolons, no AI phrases. Run the humanizer skill on the body first per the global rule.
5. `gh pr merge <number> --merge --delete-branch`. That deletes the remote branch, switches back to main, and deletes the local branch. Then `git pull && git fetch -p` so nothing stale lingers.
6. Deploy: if the change touches `arcade/`, run `cd arcade && vercel --prod --yes` after the merge. The repo has no Vercel git integration (private repo under Theo's account), so CLI deploy is the pipeline. Prod URL: https://playgrokgames.vercel.app
7. Sync mirrored copies. In grokathon, `docs/grok-games-prd.md` in the repo mirrors `~/grokathon/grok-games-prd.md`. Copy whichever is newer over the other so they match.
7. Reply with the PR link and one line on what landed.

Repo hygiene: root stays clean. Only README.md plus folders (docs/, arcade/, pipeline/, .claude/). New files go in the folder that owns them, never the root.

Merge immediately after creating the PR unless Supratik says he wants review first. If the merge fails on branch protection, say so and leave the PR open instead of forcing.
