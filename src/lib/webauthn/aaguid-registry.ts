/**
 * Static AAGUID → { name, icon } registry for rich passkey display.
 *
 * The AAGUID (Authenticator Attestation Globally Unique Identifier) identifies
 * the authenticator model (e.g. Windows Hello, YubiKey 5, Google Password
 * Manager). It does NOT identify a specific device instance.
 *
 * Source: https://github.com/passkeydeveloper/passkey-authenticator-aaguids
 * (community-driven list). This is a static subset of the most common
 * authenticators. Unknown AAGUIDs fall back to a generic fingerprint icon
 * and empty name (the caller decides what to show).
 *
 * Note: `00000000-0000-0000-0000-000000000000` means the authenticator
 * chose to remain anonymous (some platform authenticators do this).
 * We treat it as unknown.
 *
 * Icons are imported per-file from `@lucide/svelte/icons/<name>` to keep
 * the bundle small (tree-shakeable). All icon names verified on
 * https://lucide.dev/icons/ and confirmed present in the installed
 * @lucide/svelte package.
 */
import Laptop from "@lucide/svelte/icons/laptop";
import ScanFace from "@lucide/svelte/icons/scan-face";
import Fingerprint from "@lucide/svelte/icons/fingerprint";
import Usb from "@lucide/svelte/icons/usb";
import Smartphone from "@lucide/svelte/icons/smartphone";
import KeyRound from "@lucide/svelte/icons/key-round";

import type { Component } from "svelte";

export interface AaguidInfo {
  /** Friendly name for display (e.g. "Windows Hello"). Empty string if unknown. */
  name: string;
  /** Lucide icon component to render. */
  icon: Component;
}

const REGISTRY: Record<string, AaguidInfo> = {
  // --- Windows Hello (3 known AAGUIDs across Windows versions) ---
  "08987058-cadc-4b81-b6e1-30de50dcbe96": { name: "Windows Hello", icon: Laptop },
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": { name: "Windows Hello", icon: Laptop },
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": { name: "Windows Hello", icon: Laptop },

  // --- Microsoft Password Manager (Windows platform authenticator) ---
  "d3452668-01fd-4c12-926c-83a4204853aa": { name: "Microsoft Password Manager", icon: Laptop },

  // --- Google Password Manager (Android) ---
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": { name: "Google Password Manager", icon: Smartphone },

  // --- Apple (iCloud Keychain / Face ID / Touch ID) ---
  // Apple uses "Apple Anonymous Attestation" which may report a zero AAGUID.
  // When a real AAGUID is present, these are the known ones:
  "adce0002-35bc-c60a-648b-0b25f1f05503": { name: "Apple Passkey", icon: ScanFace },

  // --- YubiKey 5 Series ---
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": { name: "YubiKey 5", icon: Usb },
  "ee882879-721c-4913-9775-3dfcce97072a": { name: "YubiKey 5", icon: Usb },
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": { name: "YubiKey 5 NFC", icon: Usb },
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": { name: "YubiKey 5 NFC", icon: Usb },
  "73bb0cd4-e502-49b8-9c6f-b59445bf720b": { name: "YubiKey 5 FIPS", icon: Usb },
  "85203421-48f9-4355-9bc8-8a53846e5083": { name: "YubiKey 5 FIPS (Lightning)", icon: Usb },
  "a25342c0-3cdc-4414-8e46-f4807fca511c": { name: "YubiKey 5 NFC", icon: Usb },
  "f4ce5fc0-57d3-46f5-a736-efb7d5bc63b5": { name: "YubiKey 5 NFC", icon: Usb },
  "662ef48a-95e2-4aaa-a6c1-5b9c40375824": { name: "YubiKey 5 NFC", icon: Usb },

  // --- 1Password ---
  "bada5566-a7aa-4019-8d11-4195b9f14a92": { name: "1Password", icon: KeyRound },

  // --- Dashlane ---
  "cc45f64e-52a2-451b-831a-4edd8022a202": { name: "Dashlane", icon: KeyRound },

  // --- Microsoft Authenticator ---
  "bada5566-a7aa-4019-8d11-4195b9f14a91": { name: "Microsoft Authenticator", icon: Smartphone },
};

const UNKNOWN: AaguidInfo = { name: "", icon: Fingerprint };
const ZERO_AAGUID = "00000000-0000-0000-0000-000000000000";

/**
 * Look up an AAGUID and return { name, icon }.
 * Returns a generic fingerprint icon and empty name for unknown or zero AAGUIDs.
 * The caller decides what to display when `name` is empty (e.g. use a label
 * or a generic "Passkey" string).
 */
export function lookupAaguid(aaguid?: string): AaguidInfo {
  if (!aaguid) return UNKNOWN;
  const normalized = aaguid.toLowerCase();
  if (normalized === ZERO_AAGUID) return UNKNOWN;
  return REGISTRY[normalized] ?? UNKNOWN;
}
