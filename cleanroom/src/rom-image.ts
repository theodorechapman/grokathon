/**
 * The code image the running model verifies against itself.
 *
 * This is not the original ROM — a clean-room model cannot contain it. What it
 * reproduces is the invariant the specification proves:
 *
 *   sum(CODE:0000..9eff) mod 65536 = 0x7f2f, stored big-endian at CODE:9f00
 *
 * with no seed, complement, CRC, or word summation. The image is filled with
 * deterministic filler, two padding bytes are then solved so the sum lands on
 * 0x7f2f, and the identity blocks are placed at 9f02/9f0c — outside the
 * checksum coverage, which is consistent with the coverage boundary the
 * specification recovered.
 */

import { CODE, IDENTITY, ROM_CHECKSUM } from './memory-map.ts';

/**
 * Filler bytes reserved for solving the checksum. A byte contributes at most
 * 255 to the sum, so covering every residue in 0..65535 needs at least 258 of
 * them.
 */
const PAD_START = 0x9df0;
const PAD_END = 0x9eff;

const packBcd = (digits: string): Uint8Array => {
  if (digits.length % 2 !== 0) throw new Error(`BCD field must have even length: ${digits}`);
  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (Number(digits[i * 2]) << 4) | Number(digits[i * 2 + 1]);
  }
  return out;
};

export const sumRange = (bytes: Uint8Array, from: number, toExclusive: number): number => {
  let total = 0;
  for (let a = from; a < toExclusive; a += 1) total = (total + bytes[a]) & 0xffff;
  return total;
};

export const buildRomImage = (): Uint8Array => {
  const bytes = new Uint8Array(CODE.imageEnd);

  // Deterministic filler standing in for code the model does not contain.
  for (let a = 0; a < CODE.checksumCoverageEnd; a += 1) {
    bytes[a] = (a * 31 + (a >> 8) * 7 + 0x5a) & 0xff;
  }
  bytes.fill(0, PAD_START, PAD_END + 1);

  let shortfall = (ROM_CHECKSUM - sumRange(bytes, 0, CODE.checksumCoverageEnd)) & 0xffff;
  for (let a = PAD_START; a <= PAD_END && shortfall > 0; a += 1) {
    const take = Math.min(0xff, shortfall);
    bytes[a] = take;
    shortfall -= take;
  }

  if (sumRange(bytes, 0, CODE.checksumCoverageEnd) !== ROM_CHECKSUM) {
    throw new Error('failed to solve the ROM checksum invariant');
  }

  // Stored checksum word, big-endian, at the coverage boundary.
  bytes[CODE.checksumWord] = (ROM_CHECKSUM >> 8) & 0xff;
  bytes[CODE.checksumWord + 1] = ROM_CHECKSUM & 0xff;

  bytes.set(packBcd(IDENTITY.boschNumber), CODE.identityBlockA);
  bytes.set(packBcd(IDENTITY.softwareNumber), CODE.identityBlockB);

  return bytes;
};

export const identityBlock = (bytes: Uint8Array, address: number, digits: number): string => {
  let out = '';
  for (let i = 0; i < digits / 2; i += 1) {
    const byte = bytes[address + i];
    out += String(byte >> 4) + String(byte & 0x0f);
  }
  return out;
};
