/**
 * RFC7807 Error Mapper
 * Maps backend RFC7807 errors (status + internal_code) to frontend i18n message keys.
 * This allows the frontend to show translated, user-friendly error messages.
 */

export function mapRFC7807ToMessageKey(
	error: { status: number; internal_code?: string; detail?: string }
): { key: string; minutes?: number } | undefined {
	if (error.status === 401) {
		// Whitelist: these internal_code are camouflaged with the same generic message for security
		const genericAuthCodes = ['invalid_grant', 'user_not_found', 'account_disabled'];

		if (error.internal_code === 'account_locked') {
			// Account locked - extract minutes from detail if available
			// Detail format: "Account locked due to too many failed attempts. Wait X minutes."
			const minutesMatch = error.detail?.match(/Wait (\d+) minutes/);
			const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
			return { key: 'login.accountLocked', minutes };
		}

		if (!error.internal_code || genericAuthCodes.includes(error.internal_code)) {
			return { key: 'login.invalidCredentials' };
		}
	}

	if (error.status === 403) {
		if (error.internal_code === 'user_no_permission') {
			return { key: 'login.userNoPermission' };
		}
	}

	// For other status codes (400, 500, etc.), return undefined to use the raw detail message
	// The error card in the ErrorsPanel will show the exact backend message
	return undefined;
}
