# Independent ROM evaluator

`evaluate.py` runs an original ROM and a reconstruction through the same
deterministic input script, then writes `evaluation.json`. It stays outside the
agent workspace so reconstruction and scoring remain separate phases.

```sh
python3 pipeline/evaluator/evaluate.py \
  --original pipeline/raw_rom/postie.gbc \
  --candidate path/to/reconstructed.gb \
  --output path/to/evaluation.json \
  --artifacts path/to/evaluation-frames
```

The report contains ROM and script hashes, per-checkpoint frame hashes and
pixel errors, motion/input-response parity, activity/soft-lock signals, a
weighted score, and the pass threshold. A custom JSON script may be supplied
with `--script`; each step has a unique `name`, positive `frames`, and optional
held `buttons`.

Exit status is 0 when the score meets `--threshold` (90 by default), 1 for a
completed evaluation below threshold, and 2 for invalid CLI input.
