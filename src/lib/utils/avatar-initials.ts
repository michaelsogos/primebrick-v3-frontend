/**
 * computeInitials — pure utility that derives 1-2 character initials from a
 * display name string. Used by the avatar preview across form pages, sidebar,
 * and login page.
 *
 * Algorithm (matches the original inline logic in all 3 form pages):
 *   - Empty/whitespace-only name → fallback (default '??')
 *   - Single word → first 2 chars of the word, uppercased
 *   - Multiple words → first letter of first word + first letter of last word
 *
 * @param displayName The full display name to derive initials from
 * @param fallback The string to return when displayName is empty (default '??')
 */
export function computeInitials(displayName: string | undefined | null, fallback = "??"): string {
  if (!displayName) return fallback;
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return fallback;
  const firstLetter = words[0][0].toUpperCase();
  if (words.length > 1) {
    return firstLetter + words[words.length - 1][0].toUpperCase();
  }
  return words[0].slice(0, 2).toUpperCase() || firstLetter;
}
