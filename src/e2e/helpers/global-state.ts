/**
 * Shared state between global.setup.ts and global.teardown.ts.
 *
 * Playwright runs setup and teardown in the same Node process, so module-level
 * state persists between them. This file holds the fake Brevo server instance
 * so the teardown can close it.
 */

import type { FakeBrevoServer } from "./fake-brevo";
import type { FakeBrevoProviderSnapshot } from "./db";

let fakeBrevo: FakeBrevoServer | null = null;
let brevoProviderSnapshot: FakeBrevoProviderSnapshot | null = null;

export function setFakeBrevo(server: FakeBrevoServer | null): void {
  fakeBrevo = server;
}

export function getFakeBrevo(): FakeBrevoServer | null {
  return fakeBrevo;
}

export function setBrevoProviderSnapshot(snapshot: FakeBrevoProviderSnapshot): void {
  brevoProviderSnapshot = snapshot;
}

export function getBrevoProviderSnapshot(): FakeBrevoProviderSnapshot | null {
  return brevoProviderSnapshot;
}
