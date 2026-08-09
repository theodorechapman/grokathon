"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlock = exports.serializeBlock = exports.isAcceptableLength = exports.isValidEcho = exports.complement = exports.HANDSHAKE_BYTE = exports.SYNC_BYTE = exports.BLOCK_TERMINATOR = exports.MAX_BLOCK_LENGTH = void 0;
const byte_math_ts_1 = require("../byte-math.js");
const assumptions_ts_1 = require("../assumptions.js");
exports.MAX_BLOCK_LENGTH = assumptions_ts_1.SPEC_PROVEN.maxDiagPayload;
exports.BLOCK_TERMINATOR = assumptions_ts_1.SPEC_PROVEN.frameTerminator;
exports.SYNC_BYTE = assumptions_ts_1.SPEC_PROVEN.syncByte;
exports.HANDSHAKE_BYTE = assumptions_ts_1.SPEC_PROVEN.handshakeByte;
const complement = (byte) => (0, byte_math_ts_1.u8)(~byte);
exports.complement = complement;
/** CODE:8aa0 — the echo check. */
const isValidEcho = (received, previousSent) => (0, byte_math_ts_1.u8)(received) === (0, exports.complement)(previousSent);
exports.isValidEcho = isValidEcho;
/** CODE:8afd — the only length rule the binary proves. */
const isAcceptableLength = (length) => length > 0 && length <= exports.MAX_BLOCK_LENGTH;
exports.isAcceptableLength = isAcceptableLength;
/** Serialise a block into the bytes that go on the wire, terminator included. */
const serializeBlock = (block) => [
    (0, byte_math_ts_1.u8)(block.length),
    (0, byte_math_ts_1.u8)(block.sequence),
    (0, byte_math_ts_1.u8)(block.service),
    ...block.payload.map(byte_math_ts_1.u8),
    exports.BLOCK_TERMINATOR,
];
exports.serializeBlock = serializeBlock;
/** Inverse, for a block assembled from received bytes. */
const parseBlock = (bytes) => {
    if (bytes.length < 3)
        return null;
    if (bytes[bytes.length - 1] !== exports.BLOCK_TERMINATOR)
        return null;
    return {
        sequence: bytes[0],
        service: bytes[1],
        payload: bytes.slice(2, bytes.length - 1),
    };
};
exports.parseBlock = parseBlock;
