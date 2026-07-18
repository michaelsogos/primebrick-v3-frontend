/**
 * E2E OTP helper — extracts the 6-digit OTP code from the emailsender log.
 *
 * The BE generates a 6-digit OTP, hashes it (SHA-256) for DB storage, and
 * publishes the plaintext OTP to the emailsender microservice via NATS. The
 * emailsender renders the `otp_verification` email template (which wraps the
 * code in an `<h1>` with letter-spacing) and stores the rendered HTML in
 * `emailsender.sender_log.interpolated_sent_message`.
 *
 * This helper polls the sender_log for the OTP email to a given recipient,
 * extracts the 6-digit code with a regex, and returns it.
 *
 * The template (see `emailsender/db-meta/fire-and-forget/seed_onboarding_email_templates.sql`
 * lines 38-50) renders the OTP inside:
 *   <h1 style="...letter-spacing:8px...">{{otp_code}}</h1>
 *
 * The regex matches any 6 consecutive digits in the rendered body. We prefer
 * the first match after the `<h1` tag to avoid false positives from other
 * numbers, but fall back to any 6-digit run if the h1 heuristic fails.
 */
import { findEmailLog } from "./db";

const OTP_REGEX_H1 = /<h1[^>]*>\s*(\d{6})\s*<\/h1>/i;
const OTP_REGEX_FALLBACK = /\b(\d{6})\b/;

/**
 * Wait for the OTP email to arrive in the sender_log and return the 6-digit
 * code parsed from the rendered HTML body.
 *
 * @param recipientEmail  The email address the OTP was sent to.
 * @param timeoutMs       How long to poll before giving up (default 15s).
 * @returns               The 6-digit OTP code as a string.
 * @throws                If no email is found within the timeout, or if the
 *                        email body does not contain a 6-digit code.
 */
export async function waitForOtp(
  recipientEmail: string,
  timeoutMs = 15000,
): Promise<string> {
  const log = await findEmailLog(recipientEmail, "otp_verification", timeoutMs);
  if (!log || !log.interpolated_sent_message) {
    throw new Error(
      `[waitForOtp] No otp_verification email found for ${recipientEmail} within ${timeoutMs}ms`,
    );
  }
  return parseOtpFromHtml(log.interpolated_sent_message);
}

/**
 * Wait for the invitation email to arrive in the sender_log and return the
 * welcome link (which contains the invitation token in the URL fragment:
 * `...#token=...`).
 *
 * @param recipientEmail  The email address the invitation was sent to.
 * @param timeoutMs       How long to poll before giving up (default 15s).
 * @returns               The welcome link URL (including `#token=...`).
 * @throws                If no email is found or no link is parseable.
 */
export async function waitForInvitationLink(
  recipientEmail: string,
  timeoutMs = 15000,
): Promise<string> {
  const log = await findEmailLog(recipientEmail, "invitation_welcome", timeoutMs);
  if (!log || !log.interpolated_sent_message) {
    throw new Error(
      `[waitForInvitationLink] No invitation_welcome email found for ${recipientEmail} within ${timeoutMs}ms`,
    );
  }
  return parseWelcomeLinkFromHtml(log.interpolated_sent_message);
}

/**
 * Extract the 6-digit OTP from the rendered email HTML.
 * Prefers the `<h1>123456</h1>` match; falls back to any 6-digit run.
 */
export function parseOtpFromHtml(html: string): string {
  const h1Match = html.match(OTP_REGEX_H1);
  if (h1Match) return h1Match[1];

  const fallbackMatch = html.match(OTP_REGEX_FALLBACK);
  if (fallbackMatch) return fallbackMatch[1];

  throw new Error("[parseOtpFromHtml] No 6-digit OTP code found in email HTML body");
}

/**
 * Extract the welcome link from the rendered invitation email HTML.
 * The template renders the link as `<a href="{{welcome_link}}">...</a>` and
 * also as plain text `{{welcome_link}}` on a separate line.
 */
export function parseWelcomeLinkFromHtml(html: string): string {
  // Try the <a href="..."> form first
  const hrefMatch = html.match(/<a\s+href="([^"]+)"/i);
  if (hrefMatch) return hrefMatch[1];

  // Fall back to a bare URL with #token= fragment
  const bareMatch = html.match(/(https?:\/\/[^\s<>"']+#token=[^\s<>"']+)/i);
  if (bareMatch) return bareMatch[1];

  throw new Error("[parseWelcomeLinkFromHtml] No welcome link found in email HTML body");
}

/**
 * Extract the token from a welcome link URL (the `#token=...` fragment).
 */
export function extractTokenFromWelcomeLink(link: string): string {
  const hashIndex = link.indexOf("#");
  if (hashIndex < 0) throw new Error("[extractTokenFromWelcomeLink] No # fragment in link");
  const fragment = link.slice(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  const token = params.get("token");
  if (!token) throw new Error("[extractTokenFromWelcomeLink] No token= param in fragment");
  return token;
}
