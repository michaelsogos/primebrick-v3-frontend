<script lang="ts">
  /** Ancestor segments only (current page title is shown separately, e.g. in `h1`). A trailing `/` is always rendered after the last segment. */
  let {
    segments
  }: {
    segments: { label: string; href?: string }[];
  } = $props();
</script>

{#if segments.length > 0}
  <nav aria-label="Breadcrumb" class="text-xs text-muted-foreground sm:text-sm">
    <ol class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {#each segments as seg, i (i)}
        <li class="flex min-w-0 items-center gap-x-1.5">
          {#if i > 0}
            <span class="text-muted-foreground/60" aria-hidden="true">/</span>
          {/if}
          {#if seg.href}
            <a href={seg.href} class="truncate hover:text-foreground hover:underline">
              {seg.label}
            </a>
          {:else}
            <span class="truncate">{seg.label}</span>
          {/if}
        </li>
      {/each}
      <li class="flex min-w-0 items-center gap-x-1.5 text-muted-foreground/60" aria-hidden="true">
        <span>/</span>
      </li>
    </ol>
  </nav>
{/if}
