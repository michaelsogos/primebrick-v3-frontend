<script lang="ts">
  let {
    search = '',
    disablePadding = false
  }: {
    search?: string;
    disablePadding?: boolean
  } = $props();

  type SearchSyntaxSeg =
    | { kind: 'plain'; text: string }
    | { kind: 'escapedStar'; text: string }  // \*
    | { kind: 'escapedQ'; text: string };   // \?

  function searchSyntaxSegments(raw: string): SearchSyntaxSeg[] {
    const out: SearchSyntaxSeg[] = [];
    let buf = '';
    const flush = () => {
      if (buf) {
        out.push({ kind: 'plain', text: buf });
        buf = '';
      }
    };
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]!;
      const next = raw[i + 1];
      if (ch === '\\' && next === '*') {
        flush();
        out.push({ kind: 'escapedStar', text: '\\*' });
        i++;
      } else if (ch === '\\' && next === '?') {
        flush();
        out.push({ kind: 'escapedQ', text: '\\?' });
        i++;
      } else {
        buf += ch; // Everything else is plain text
      }
    }
    flush();
    return out;
  }

  const searchSyntaxParts = $derived(searchSyntaxSegments(search));

  function searchSyntaxSpanClass(seg: SearchSyntaxSeg): string {
    switch (seg.kind) {
      case 'plain':
        return 'text-foreground';
      case 'escapedStar':
        return [
          'font-medium text-amber-700/90 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-950/30 rounded',
          disablePadding ? '' : 'px-0.5'
        ].filter(Boolean).join(' ');
      case 'escapedQ':
        return [
          'font-medium text-violet-700/90 dark:text-violet-400/90 bg-violet-50 dark:bg-violet-950/30 rounded',
          disablePadding ? '' : 'px-0.5'
        ].filter(Boolean).join(' ');
    }
  }
</script>

{#each searchSyntaxParts as seg}
  <span class={searchSyntaxSpanClass(seg)}>{seg.text}</span>
{/each}
