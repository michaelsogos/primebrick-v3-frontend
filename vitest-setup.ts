import "@testing-library/jest-dom/vitest";

// jsdom does not implement CSS.supports — required by bits-ui PinInput (OTP input).
if (typeof window !== "undefined" && typeof window.CSS?.supports !== "function") {
	window.CSS = Object.assign(window.CSS ?? {}, { supports: () => false });
}

// jsdom does not implement ResizeObserver — required by bits-ui PinInput.
if (typeof globalThis.ResizeObserver !== "function") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// jsdom does not implement document.elementFromPoint — used by bits-ui
// PinInput's password-manager badge detection.
if (typeof document !== "undefined" && typeof document.elementFromPoint !== "function") {
	document.elementFromPoint = () => null;
}

// jsdom does not implement Element.scrollIntoView — used by bits-ui Command
// (CommandPalette in AppTopbar) when a group header is selected.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
	Element.prototype.scrollIntoView = () => {};
}

// jsdom does not implement window.matchMedia — required by svelte/motion
// (prefersReducedMotion MediaQuery at module scope) pulled in via
// @primebrick/ui barrel exports (e.g. NumberTicker).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

// @primebrick/ui i18n bridge — in the app this is bound at boot via
// host-bindings.ts; test files act as a host realm, so bind an identity
// translator (returns the key) that mirrors the standard $lib/i18n mocks.
import { readable } from "svelte/store";
import { bindI18n } from "@primebrick/ui/bridges";
bindI18n(readable((key: string) => key), () => "en-GB");
