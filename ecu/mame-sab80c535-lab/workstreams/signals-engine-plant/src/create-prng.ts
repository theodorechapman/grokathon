export interface Prng {
  nextUint32(): number;
  nextSigned(amplitude: number): number;
}

/** Xorshift32 with an explicit nonzero normalization for seed zero. */
export const createPrng = (seed: number): Prng => {
  let state = (seed >>> 0) || 0x6d2b79f5;
  const step = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  return {
    nextUint32: step,
    nextSigned: (amplitude) => {
      if (!Number.isInteger(amplitude) || amplitude < 0) {
        throw new RangeError(`amplitude must be a nonnegative integer: ${amplitude}`);
      }
      if (amplitude === 0) return 0;
      return (step() % (amplitude * 2 + 1)) - amplitude;
    },
  };
};
