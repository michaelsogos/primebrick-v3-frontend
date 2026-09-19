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
