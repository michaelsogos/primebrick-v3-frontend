/**
 * useOtpInput — shared controller for OTP/PIN code entry (MFA challenge,
 * step-up, enrollment verify, welcome code).
 *
 * Owns the code state and the submit gating so every call site stays DRY:
 *   - `requestSubmit()` fires `onSubmit(code)` — wired by `OtpInput` to BOTH
 *     the Enter key and the auto-complete event (all cells filled).
 *   - `disabled()` guard suppresses submit while a request is in flight.
 *   - `reset()` clears the code (e.g. after a failed verify).
 *
 * Usage:
 *   const otp = useOtpInput({ onSubmit: verify, disabled: () => submitting });
 *   <OtpInput bind:value={otp.code} onsubmit={otp.requestSubmit} disabled={submitting} />
 */
export function useOtpInput(options: {
	/** Code length — default 6 (TOTP). */
	length?: number;
	/** Suppress submit while busy (request in flight). */
	disabled?: () => boolean;
	/** Called on Enter AND when the last cell is filled. Receives the full code. */
	onSubmit: (code: string) => unknown;
}) {
	const length = options.length ?? 6;
	let code = $state("");

	const complete = $derived(code.length === length);

	function requestSubmit() {
		if (options.disabled?.()) return;
		options.onSubmit(code);
	}

	return {
		get code() {
			return code;
		},
		set code(v: string) {
			code = v;
		},
		get complete() {
			return complete;
		},
		requestSubmit,
		reset() {
			code = "";
		},
	};
}
