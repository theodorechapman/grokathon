There exists tooling for
1. Decompiling and mapping the call graph of a binary (Ghidra)
2. Mapping and perturbing memory state (especially in emulators)
3. And the ability for agents to drive a computer (inputs and visual understanding)

Our hypothesis was that the intelligence frontier has reached that point where a harness created with proper attention-to-detail could enable an LLM to fully recreate any small binary in clean C

We started with a proof of concept: the classic GameBoy game, Breakout (pong-like where you hit the ball into blocks and break them). The binary was only 33kb, and the Gameboy has been nicely emulated in pure C by this project: https://github.com/LIJI32/SameBoy. 


We built out the following for the first demo:
A MCP server for Ghidra decompilation and tagging of functions
A MCP server that wrapped SameBoy’s memory inspection and perturbing tooling
Hand-rolled a screencap + render + input interface MCP for the SameBoy process

Sure enough, after 15 minutes running in a container with these tools (and with the binary properly anonymized), Grok Build was able to create a frame-for-frame exact reconstruction.

Excited, we quickly ran this reconstructed file in a TypeScript emulator and put it on a website (https://playgrokgames.vercel.app/g/breakout). We posted on X, Instagram, and LinkedIn and got 2500+ views and 700 visitors to our game. We also wired in “Sign in with X” where competitors claimed a spot on the leaderboard.

At this point, we wanted to flesh out the full vision we had bumped up upon

On the social side, one of the great benefits of having clean code to compile from is the customizability, so we made it so: if you tag @suprapan07 on X with a customization you wanted (make the game fire themed for example), we would spin up Grok Build in a container, make the change and post the Remix in our web arcade.


Next was to improve the harness and reach the next order of magnitude of size complexity:
Kirby’s Dream Land (262 kb)
Postie (262kb)
Both open-source platformers


The immediate first hypothesis was to add the ability for the agent to compile its own code, run in its own emulator, and run experiments to compare with the original binary. Adding a new layer of feedback, from an information theory perspective. 

One of the difficult technical challenges when building out CompareBoy (our lovingly named comparison interface) was how best to pass visual information. We first tried passing generic sets of frames to the model on every game input, but redundant information would cause it to get confused. We eventually settled on a function that would pass frames based on a threshold of visual distance between the original and the models implementation frames. (this produced much better results, and allowed the agent to reason about how close it was to getting the code right)

Another problem was the agent. We initially tried running Fable (and got immediately banned for cybersecurity violations and presumably the Geneva convention as well), and then 5.6-sol after that. The assumption being, let’s just see if it works with the max intelligence possible. What we actually found was that the model was quick to give up, ending its turns around 15 minutes every time. When we slotted Grok B back in, it ran faster and worked for around 20 minutes before giving up, getting through much more work per run.

The final iteration we thus had to make was to have the agent run again after a run was marked incomplete. Once that was added, and our runtimes subsequently exploded (90+ minutes for one run!), we were able to nearly perfectly reconstruct Kirby and Postie.
The final ingredient to a rigorous harness design is of course proper evals. Since we already had proper infrastructure for comparing render states, it was trivial to then drive through the game and see the visual concordance.
Extending this paradigm to automotive firmware, we found an engine control unit (ECU) binary online that belonged to a BMW model from ~1990s, with about 40kb of software that controls when fuel is injected and when sparks are fired. First, We designed the ghidra harness that read the code via static analysis, and filled in information gaps via spec sheets and online forum searches. Next, We generated comprehensive .md files that included how each subsystems in the ECU worked. Then, we performed a clean room rebuild of the binary in TypeScript, which allowed us to visualize how the ECU’s output RPM changed when engine load, throttle, etc. changed. After that, using the .md files and a good understanding of the binary, we understood what peripherals send/receive signals and built to completely emulate the ECU running.
