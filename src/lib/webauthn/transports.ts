/**
 * WebAuthn transport helpers for passkey display.
 *
 * Transports indicate how the authenticator communicates with the browser:
 *   - "internal": platform authenticator (TPM, Secure Enclave, etc.)
 *   - "hybrid":   phone-based authenticator via QR + BLE (caBLE)
 *   - "usb":      USB security key
 *   - "nfc":      NFC tap
 *   - "ble":      Bluetooth Low Energy (legacy, rarely used)
 *
 * IMPORTANT: "internal" does NOT mean "this device". Platform authenticators
 * can be synced across devices via iCloud Keychain, Google Password Manager,
 * etc. A passkey with transport "internal" may live on a different device
 * than the one the user is currently on. We render the raw transport value
 * as an informational badge — never as a "this device" claim.
 */

/**
 * The set of valid WebAuthn transport values.
 */
export type WebauthnTransport = "internal" | "hybrid" | "usb" | "nfc" | "ble";

/**
 * Map a transport value to its i18n key suffix.
 * The full key is `auth.passkeys.transport.<suffix>`.
 * Returns `undefined` for unrecognized transport values (caller should skip).
 */
export function transportKeySuffix(transport: string): string | undefined {
  switch (transport) {
    case "internal":
      return "internal";
    case "hybrid":
      return "hybrid";
    case "usb":
      return "usb";
    case "nfc":
      return "nfc";
    case "ble":
      return "ble";
    default:
      return undefined;
  }
}
