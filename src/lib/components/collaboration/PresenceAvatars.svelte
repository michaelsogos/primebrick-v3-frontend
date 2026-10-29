<script lang="ts">
  /**
   * PresenceAvatars — unified presence stack for the `page-header-presence`
   * slot. Renders ONLY on update surfaces (detail/edit routes holding an
   * entity uuid): create pages and other archetypes get nothing.
   *
   * Spec (ai-plans/collaboration-visual-merge §6.4):
   * - self always rightmost; zero others → renders nothing
   * - others leftward: editors by activity recency, then readers by
   *   `last_seen_at` — hidden users decay into the `+N` pill (leftmost)
   * - rings: warning gradient = live EDITING · primary gradient = EDITED
   *   (saved ≤5min AND after my own mount)
   *
   * TODO(i18n): tooltips are inline EN pending `app.collaboration.*`
   * translation keys (needs a BE db-meta seed patch).
   */
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { userProfileState } from '$lib/user-profile-store.svelte';
  import { usePresenceChannel } from '$lib/composables/usePresenceChannel.svelte';
  import {
    orderPresenceStack,
    capPresenceStack,
    presenceRing,
  } from '$lib/collaboration/presence-stack';
  import { computeAvatarGradient, avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import { computeInitials } from '$lib/utils/avatar-initials';
  import { cn } from '$lib/utils';
  import type { PresenceEntry } from '@primebrick/ui';
  import { untrack } from 'svelte';

  let { entity, uuid }: { entity: string; uuid: string } = $props();

  /**
   * Captured once per mount — the parent `{#key}` remounts this component on
   * `entity:uuid` change, so a stale channel is impossible by construction.
   */
  const channel = untrack(() => usePresenceChannel({ entity, uuid }));
  const selfUuid = $derived(userProfileState.current?.uuid);

  /** Re-evaluate the EDITED ring window — 5-min TTL needs a ticking clock. */
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const ordered = $derived(orderPresenceStack(channel.readers, channel.editors, selfUuid));
  const { visible, hiddenCount } = $derived(capPresenceStack(ordered));
  /** DOM order: leftmost +N → least active → most active → self (rightmost). */
  const display = $derived([...visible].reverse());

  function ringClass(ring: 'editing' | 'edited' | 'none'): string {
    if (ring === 'editing') return 'bg-range-warning-gradient';
    if (ring === 'edited') return 'bg-range-primary-gradient';
    return '';
  }

  function tooltip(entry: PresenceEntry, ring: 'editing' | 'edited' | 'none'): string {
    const name = entry.user_name;
    if (ring === 'editing') {
      return entry.field ? `${name} is editing ${entry.field}` : `${name} is editing`;
    }
    if (ring === 'edited' && entry.edited_at !== undefined) {
      const mins = Math.max(1, Math.round((now - entry.edited_at) / 60_000));
      return `${name} saved a change ${mins}min ago`;
    }
    return name;
  }

  function initials(entry: PresenceEntry): string {
    return entry.avatar_initials ?? computeInitials(entry.user_name);
  }

  function avatarStyle(entry: PresenceEntry): string | null {
    if (!entry.avatar_color) return null;
    const g = computeAvatarGradient(entry.avatar_color);
    return `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`;
  }
</script>

{#if ordered.length > 0}
  <div class="flex items-center" data-testid="presence-avatars">
    {#if hiddenCount > 0}
      <button
        type="button"
        class="mr-[-6px] flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
        title="{hiddenCount} more users"
        data-testid="presence-more"
      >
        +{hiddenCount}
      </button>
    {/if}
    {#each display as entry (entry.user_uuid)}
      {@const ring = presenceRing(entry, now, channel.mountedAt)}
      {@const style = avatarStyle(entry)}
      <div
        class={cn('avatar-hex mr-[-6px] p-[1.5px]', ring !== 'none' && ringClass(ring))}
        title={tooltip(entry, ring)}
        data-testid="presence-avatar"
        data-presence-ring={ring === 'none' ? undefined : ring}
        data-presence-user={entry.user_uuid}
      >
        <Avatar class="size-7 rounded-none avatar-hex">
          <AvatarFallback
            class={cn(
              'rounded-none text-[10px] font-semibold',
              !style && avatarFallbackChromeClasses(initials(entry)),
            )}
            style={style ?? undefined}
          >
            {initials(entry)}
          </AvatarFallback>
        </Avatar>
      </div>
    {/each}
    <!-- Self — always rightmost, plain. -->
    <div
      class="avatar-hex p-[1.5px]"
      title="You"
      data-testid="presence-self"
      data-presence-user={selfUuid}
    >
      <Avatar class="size-7 rounded-none avatar-hex">
        <AvatarFallback class="rounded-none bg-muted text-[10px] font-semibold">
          {userProfileState.current?.avatar_initials ??
            computeInitials(userProfileState.current?.display_name)}
        </AvatarFallback>
      </Avatar>
    </div>
  </div>
{/if}
