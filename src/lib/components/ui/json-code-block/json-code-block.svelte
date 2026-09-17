<script lang="ts">
  import { CopyButton } from '$lib/components/ui/copy-button';
  import { highlightJson } from '$lib/highlight/shiki.svelte';
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    code,
    lineNumbers = false,
    copyable = false,
    minRows = 0,
    maxHeight,
    class: className,
    ...rest
  }: {
    /** JSON string or serializable value. */
    code: unknown;
    /** Render a line-number gutter. */
    lineNumbers?: boolean;
    /** Show a copy-to-clipboard CTA (copies the raw code). */
    copyable?: boolean;
    /** Minimum visible rows (row = 1.25rem at text-xs). */
    minRows?: number;
    /** CSS max-height for the scrollable area (e.g. '15rem'). */
    maxHeight?: string;
  } & HTMLAttributes<HTMLDivElement> = $props();

  const jsonString = $derived(
    typeof code === 'string' ? code : JSON.stringify(code, null, 2)
  );

  let html = $state('');
  let failed = $state(false);

  $effect(() => {
    const current = jsonString;
    failed = false;
    highlightJson(current)
      .then((h) => {
        if (jsonString === current) html = h;
      })
      .catch(() => {
        if (jsonString === current) failed = true;
      });
  });

  const containerStyle = $derived(
    [
      minRows > 0 ? `min-height: calc(${minRows} * 1.25rem + 1.5rem)` : '',
      maxHeight ? `max-height: ${maxHeight}` : '',
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<div
  class={cn('relative rounded-md bg-muted', className)}
  style={containerStyle}
  {...rest}
>
  {#if copyable}
    <CopyButton
      text={jsonString}
      class="absolute top-1.5 right-1.5 z-10 text-muted-foreground hover:text-foreground"
      data-testid="json-code-block-copy"
    />
  {/if}
  <div
    class="h-full overflow-auto p-3 text-xs font-mono leading-5"
    class:line-numbers={lineNumbers}
    data-testid="json-code-block-content"
  >
    {#if !failed && html}
      {@html html}
    {:else}
      <pre class="whitespace-pre-wrap">{jsonString}</pre>
    {/if}
  </div>
</div>

<style>
  /* Transparent bg — the container provides it (bg-muted). */
  :global(.shiki) {
    background-color: transparent !important;
    margin: 0;
  }
  :global(.shiki span) {
    background-color: transparent !important;
  }
  /* Dual-theme: shiki emits --shiki-light/--shiki-dark per span. */
  :global(.dark .shiki),
  :global(.dark .shiki span) {
    color: var(--shiki-dark) !important;
  }
  /* Line numbers via CSS counter on shiki's .line spans. */
  .line-numbers :global(.shiki) {
    counter-reset: line;
  }
  .line-numbers :global(.shiki .line)::before {
    counter-increment: line;
    content: counter(line);
    display: inline-block;
    width: 1.75rem;
    margin-right: 1rem;
    text-align: right;
    color: var(--muted-foreground);
    opacity: 0.6;
    user-select: none;
  }
</style>
