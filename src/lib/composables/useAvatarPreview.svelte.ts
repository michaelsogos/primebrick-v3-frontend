/**
 * useAvatarPreview — composable that derives the avatar seed (initials) and
 * chrome fallback class from a reactive display name getter.
 *
 * Consolidates the identical `userAvatarSeed` + `avatarChromeFallbackClass`
 * derivation duplicated across Profile, Create User, and Edit User pages.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - $derived values exposed via individual getters
 */
import { computeInitials } from "$lib/utils/avatar-initials";
import { avatarFallbackChromeClasses } from "$lib/avatar-chrome-palette";

export function useAvatarPreview(
  displayName: () => string | undefined,
  fallback = "??",
) {
  const seed = $derived.by(() => computeInitials(displayName(), fallback));
  const chromeFallbackClass = $derived(avatarFallbackChromeClasses(seed));

  return {
    get seed() {
      return seed;
    },
    get chromeFallbackClass() {
      return chromeFallbackClass;
    },
  };
}
