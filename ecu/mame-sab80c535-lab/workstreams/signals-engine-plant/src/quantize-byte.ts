export const quantizeByte = (value: number): number => {
  if (!Number.isFinite(value)) throw new RangeError(`byte value must be finite: ${value}`);
  return Math.min(0xff, Math.max(0, Math.floor(value + 0.5)));
};
