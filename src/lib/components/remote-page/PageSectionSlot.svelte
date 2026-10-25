<script lang="ts">
  /**
   * PageSectionSlot — mounts ONE declared section inside the page grid.
   *
   * `remote:<export>` → calls the chunk's named mount export
   * `fn(el, ctx, section)`; `host:<key>` → mounts the registered host
   * component (same realm — no bridge). A mount failure is isolated to the
   * cell: the section renders the error panel while siblings keep working.
   */
  import { mount, onMount } from 'svelte';
  import type {
    ModulePageHost,
    MountSectionFn,
    PageSectionDecl,
  } from '@primebrick/ui';
  import RemotePageErrorPanel from './RemotePageErrorPanel.svelte';
  import { disposeMounted, type RemoteErrorKind, type RemoteModule } from './remote-loader';
  import { getHostSection, type HostSectionProps } from './host-sections';
  import { parseSectionSource, sectionCellStyle } from './section-layout';
  import type { Component } from 'svelte';

  let {
    section,
    mod = undefined,
    ctx,
  }: {
    section: PageSectionDecl;
    /** The page's loaded chunk — absent for host-only descriptor pages. */
    mod?: RemoteModule | null;
    ctx: ModulePageHost;
  } = $props();

  let el = $state<HTMLDivElement>();
  let error_kind = $state<RemoteErrorKind | null>(null);
  let error_detail = $state<string | null>(null);
  let mounted: unknown = null;

  function fail(kind: RemoteErrorKind, detail: string) {
    error_kind = kind;
    error_detail = detail;
  }

  onMount(() => {
    const target = el;
    if (!target) return;
    const parsed = parseSectionSource(section.source);
    if (!parsed) {
      fail('contract', `malformed section source '${section.source}'`);
      return;
    }
    try {
      if (parsed.kind === 'remote') {
        const fn = mod?.[parsed.name] as MountSectionFn | undefined;
        if (typeof fn !== 'function') {
          fail(
            'contract',
            mod == null
              ? `section '${section.id}' needs a remote chunk but the route has no component_url`
              : `module chunk has no export '${parsed.name}'`,
          );
          return;
        }
        mounted = fn(target, ctx, section);
      } else {
        const Comp = getHostSection(parsed.name) as
          | Component<HostSectionProps>
          | undefined;
        if (!Comp) {
          fail('contract', `host section '${parsed.name}' is not registered`);
          return;
        }
        mounted = mount(Comp, { target, props: { section, ctx } });
      }
    } catch (e) {
      console.error(`[section ${section.id}] mount failed`, e);
      fail('mount', e instanceof Error ? e.message : String(e));
      return;
    }
    return () => {
      const prev = mounted;
      mounted = null;
      void disposeMounted(prev).catch(() => undefined);
    };
  });
</script>

<div
  class="min-h-0 min-w-0"
  style={sectionCellStyle(section)}
  data-section-id={section.id}
>
  {#if error_kind}
    <RemotePageErrorPanel kind={error_kind} detail={error_detail} />
  {/if}
  <!-- Mount target stays mounted even while the error panel overlays — the
       remote owns whatever it already rendered inside. -->
  <div bind:this={el} class="contents"></div>
</div>
