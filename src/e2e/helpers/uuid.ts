import { randomBytes } from "crypto";

/**
 * E2E-side uuid v7 generator (RFC 9562 §5.7): 48-bit ms timestamp + version +
 * 12-bit rand_a + variant + 62-bit rand_b — the same layout PostgreSQL
 * `uuidv7()` and the DAL `newUuidV7()` produce. E2E fixtures that inject uuid
 * values into uuid-PK columns or entity URLs must be v7: the DAL boundary
 * enforcer rejects anything else.
 */
export function e2eUuidV7(): string {
  const rand = randomBytes(10);
  const randA = (rand.readUInt16BE(0) & 0x0fff) | 0x7000;
  const randB = rand.readBigUInt64BE(2) & ((1n << 62n) - 1n);
  const ts = BigInt(Date.now());
  return (
    (ts >> 16n).toString(16).padStart(8, "0") + "-" +
    (ts & 0xffffn).toString(16).padStart(4, "0") + "-" +
    randA.toString(16).padStart(4, "0") + "-" +
    ((0x8000n | (randB >> 48n)).toString(16).padStart(4, "0")) + "-" +
    (randB & 0xffffffffffffn).toString(16).padStart(12, "0")
  );
}
