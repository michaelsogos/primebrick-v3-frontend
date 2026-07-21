/**
 * TOTP code generation helper for E2E tests.
 *
 * Generates RFC 6238 TOTP codes from a base32 secret, matching the BE
 * implementation. Used to simulate an authenticator app during E2E tests.
 */

import { createHmac } from "crypto";

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/\s/g, "").replace(/=+$/, "").toUpperCase();
  const lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits: string[] = [];
  for (const c of cleaned) {
    const idx = lookup.indexOf(c);
    if (idx === -1) throw new Error(`Invalid base32 char: ${c}`);
    bits.push(idx.toString(2).padStart(5, "0"));
  }
  const allBits = bits.join("");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= allBits.length; i += 8) {
    bytes.push(parseInt(allBits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate a TOTP code from a base32 secret.
 * Matches the BE's generateTotp() implementation (SHA1, 30s step, 6 digits).
 */
export function generateTotp(secret: string, timeStep = 30, digits = 6): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % Math.pow(10, digits)).toString().padStart(digits, "0");
}
