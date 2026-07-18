/**
 * WebAuthn codec — (de)serialization between base64url JSON (over the wire) and
 * ArrayBuffer (for `navigator.credentials`).
 *
 * WebAuthn options and credentials contain `ArrayBuffer` fields. When sent as
 * JSON over HTTP, these are encoded as base64url strings. The browser's
 * `navigator.credentials.get()` / `.create()` APIs require real `ArrayBuffer`
 * objects. This module converts between the two.
 *
 * No external dependency — just the standard WebAuthn JSON codec pattern.
 */

// --- base64url helpers ----------------------------------------------------

/**
 * Decode a base64url string to an ArrayBuffer.
 * Handles both base64url (no padding, -/_) and standard base64.
 * Throws if the input is not valid base64url.
 */
export function base64urlToBuffer(base64url: string): ArrayBuffer {
  // Convert base64url to standard base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to length multiple of 4
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encode an ArrayBuffer to a base64url string (no padding).
 */
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Decoding: server JSON → browser PublicKeyCredentialRequestOptions -----

/**
 * Recursively walk a JSON object and convert any base64url string field that
 * should be an ArrayBuffer into an ArrayBuffer. The conversion is driven by
 * field names known to the WebAuthn spec.
 *
 * This is the standard pattern used by SimpleWebAuthn and Casdoor's own JS SDK.
 */
const BUFFER_FIELDS = new Set([
  "challenge",
  "user.id",
  "id",
  "salt",
]);

/**
 * Decode `PublicKeyCredentialRequestOptions` (signin) or
 * `PublicKeyCredentialCreationOptions` (signup) from JSON (base64url strings)
 * into the browser-native format with ArrayBuffers.
 *
 * The BE returns `{ publicKey: { ... } }` — the browser API expects this
 * wrapper shape for `navigator.credentials.get({ publicKey })` and
 * `navigator.credentials.create({ publicKey })`.
 */
export function decodeCredentialRequestOptions(
  json: Record<string, unknown>,
): { publicKey: PublicKeyCredentialRequestOptions } {
  return deepDecodeBuffers(json) as { publicKey: PublicKeyCredentialRequestOptions };
}

export function decodeCredentialCreationOptions(
  json: Record<string, unknown>,
): { publicKey: PublicKeyCredentialCreationOptions } {
  return deepDecodeBuffers(json) as { publicKey: PublicKeyCredentialCreationOptions };
}

/**
 * Recursively walk the object, converting known buffer fields from base64url
 * strings to ArrayBuffers.
 */
function deepDecodeBuffers(obj: unknown): unknown {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(deepDecodeBuffers);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof value === "string" && isBufferField(key, value)) {
        try {
          result[key] = base64urlToBuffer(value);
        } catch {
          // Not valid base64url — leave as string (e.g. Casdoor may return
          // a non-base64 id field that matches the buffer field name heuristic)
          result[key] = value;
        }
      } else if (value && typeof value === "object") {
        result[key] = deepDecodeBuffers(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

/**
 * Heuristic: a field is a buffer field if its name is in the known set AND the
 * value looks like base64url (only contains base64url chars, length > 0).
 * The try/catch in deepDecodeBuffers handles false positives gracefully.
 */
function isBufferField(key: string, value: string): boolean {
  if (!BUFFER_FIELDS.has(key)) return false;
  // Must be non-empty and only base64url characters
  return /^[A-Za-z0-9_-]+$/.test(value);
}

// --- Encoding: browser credential → JSON (base64url strings) --------------

/**
 * Serialize a `PublicKeyCredential` (from `navigator.credentials.get()`) into a
 * JSON-safe object with base64url-encoded fields, ready to POST to the BE.
 */
export function encodeAuthenticatorAssertion(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : undefined,
    },
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  };
}

/**
 * Serialize a `PublicKeyCredential` (from `navigator.credentials.create()`)
 * into a JSON-safe object with base64url-encoded fields, ready to POST to the
 * BE.
 */
export function encodeAuthenticatorAttestation(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
    },
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  };
}

// --- Feature detection ----------------------------------------------------

/**
 * Returns true if the current browser supports WebAuthn / passkeys.
 * Checks for `navigator.credentials` and `PublicKeyCredential`.
 */
export function isWebauthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    "PublicKeyCredential" in window
  );
}
