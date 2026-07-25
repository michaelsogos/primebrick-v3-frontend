<script lang="ts">
  /**
   * AvatarPreview — reusable avatar preview block used in Profile, Create User,
   * and Edit User form pages. Renders a hex-shaped avatar with initials derived
   * from the display name, and either the user-selected color or a deterministic
   * chrome-palette fallback.
   *
   * Consolidates the duplicated Avatar + AvatarFallback block (D-11).
   */
  import { untrack } from "svelte";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { cn } from "$lib/utils";
  import { computeAvatarGradient } from "$lib/avatar-chrome-palette";
  import { useAvatarPreview } from "$lib/composables/useAvatarPreview.svelte";

  let {
    displayName,
    avatarColor,
    defaultSeed = "??",
  }: {
    displayName: string | undefined;
    avatarColor: string | undefined;
    defaultSeed?: string;
  } = $props();

  const { seed, chromeFallbackClass } = useAvatarPreview(
    () => displayName,
    untrack(() => defaultSeed),
  );

  const gradientStyle = $derived.by(() => {
    if (!avatarColor) return "";
    const g = computeAvatarGradient(avatarColor);
    return `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`;
  });
</script>

<Avatar class="size-14 rounded-none avatar-hex">
  <AvatarFallback
    class={cn(
      "rounded-none text-2xl font-semibold",
      avatarColor ? "" : chromeFallbackClass,
    )}
    style={gradientStyle}
  >
    {seed}
  </AvatarFallback>
</Avatar>
