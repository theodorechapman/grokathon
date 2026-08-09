/**
 * KW71 framing rules.
 *
 * Three proven facts define the framing, and they are all this file contains:
 *  - "CODE:8b36 stores a received byte, decrements the remaining length,
 *     complements the next byte, and transmits it";
 *  - "CODE:8aa0 verifies a received byte against the complement of the previous
 *     byte";
 *  - "CODE:8afd accepts a length byte no greater than 0x10", and "the maximum
 *     observed payload length is 16 bytes".
 *
 * Outgoing frames use XRAM 00b1 length, 00b2 sequence, 00b3 service, payload at
 * 00b4, and a trailing 0x03.
 */

import { u8 } from '../byte-math.ts';
import { SPEC_PROVEN } from '../assumptions.ts';

export const MAX_BLOCK_LENGTH = SPEC_PROVEN.maxDiagPayload;
export const BLOCK_TERMINATOR = SPEC_PROVEN.frameTerminator;
export const SYNC_BYTE = SPEC_PROVEN.syncByte;
export const HANDSHAKE_BYTE = SPEC_PROVEN.handshakeByte;

export const complement = (byte: number): number => u8(~byte);

/** CODE:8aa0 — the echo check. */
export const isValidEcho = (received: number, previousSent: number): boolean =>
  u8(received) === complement(previousSent);

/** CODE:8afd — the only length rule the binary proves. */
export const isAcceptableLength = (length: number): boolean =>
  length > 0 && length <= MAX_BLOCK_LENGTH;

export interface OutgoingBlock {
  length: number;
  sequence: number;
  service: number;
  payload: number[];
}

/** Serialise a block into the bytes that go on the wire, terminator included. */
export const serializeBlock = (block: OutgoingBlock): number[] => [
  u8(block.length),
  u8(block.sequence),
  u8(block.service),
  ...block.payload.map(u8),
  BLOCK_TERMINATOR,
];

export interface ParsedBlock {
  sequence: number;
  service: number;
  payload: number[];
}

/** Inverse, for a block assembled from received bytes. */
export const parseBlock = (bytes: readonly number[]): ParsedBlock | null => {
  if (bytes.length < 3) return null;
  if (bytes[bytes.length - 1] !== BLOCK_TERMINATOR) return null;
  return {
    sequence: bytes[0],
    service: bytes[1],
    payload: bytes.slice(2, bytes.length - 1),
  };
};
