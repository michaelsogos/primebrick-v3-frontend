/**
 * Shared chat avatar/bubble chrome for every AI assistant panel.
 *
 * One source of truth for:
 *  - user avatar identity (same as the sidebar profile menu: avatar_color
 *    gradient, palette fallback from initials)
 *  - user bubble: background = the avatar gradient at barely-perceptible
 *    alpha, border = the same gradient at full strength
 *  - assistant bubble: muted fill kept as-is + primary gradient border
 *    (same double-background trick as the `border-primary-gradient`
 *    utility, preserving --muted as inner fill)
 *
 * Both message renderers — smart-ai/ai-chat-panel and
 * shell/sheets/panels/AiChatPanel — derive their inline styles from here
 * so the chrome can never drift apart.
 */
import type { UserProfile } from '$lib/user-profile-store.svelte';
import { avatarFallbackChromeClasses, computeAvatarGradient } from '$lib/avatar-chrome-palette';

export interface ChatAvatarChrome {
  /** Inline style for the AvatarFallback (gradient bg + contrast text). */
  avatarStyle: { style: string; class: string } | null;
  /** Initials shown inside the fallback avatar. */
  avatarSeed: string;
  /** Palette classes when avatar_color is absent. */
  fallbackClass: string;
  /** User bubble inline style (tinted gradient bg + gradient border). */
  bubbleStyle: string | null;
}

export function chatAvatarChrome(user: UserProfile | null | undefined): ChatAvatarChrome {
  const seed = user?.avatar_initials ?? '?';
  const color = user?.avatar_color;
  const g = color ? computeAvatarGradient(color) : null;
  return {
    avatarStyle: g
      ? {
          style: `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`,
          class: 'rounded-none text-xs font-semibold',
        }
      : null,
    avatarSeed: seed,
    fallbackClass: avatarFallbackChromeClasses(seed),
    // The gradient border CANNOT share the element's background layers: a
    // transparent fill would let the full-strength border-box layer bleed
    // through. Instead the `.gradient-ring` mask utility paints `--gb` as a
    // 1px ring; the element background stays the barely-visible 8% gradient.
    bubbleStyle: g
      ? `background: linear-gradient(135deg, color-mix(in srgb, ${g.start} 8%, transparent), ` +
        `color-mix(in srgb, ${g.end} 8%, transparent)); ` +
        `border: 1px solid transparent; ` +
        `--gb: linear-gradient(135deg, ${g.start}, ${g.end});`
      : null,
  };
}

/** Assistant bubble: barely-visible primary-gradient fill (same 8% technique
 *  as the user bubble) + full-strength primary gradient ring. */
export const AI_BUBBLE_STYLE =
  'background: linear-gradient(to bottom right, color-mix(in srgb, #38bdf8 8%, transparent), ' +
  'color-mix(in srgb, #818cf8 8%, transparent)); ' +
  'border: 1px solid transparent; ' +
  '--gb: linear-gradient(to bottom right, #38bdf8, #818cf8);';
