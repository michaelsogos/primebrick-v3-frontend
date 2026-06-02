<script lang="ts">
  let { search = '' }: { search?: string } = $props();

  type SearchSyntaxSeg =
    | { kind: 'plain'; text: string }
    | { kind: 'wAny'; text: string }
    | { kind: 'wOne'; text: string }
    | { kind: 'litStar' | 'litQ'; text: string }
    | { kind: 'sym'; text: string }
    | { kind: 'bsLit'; text: string };

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
        out.push({ kind: 'wAny', text: '\\*' });
        i++;
      } else if (ch === '\\' && next === '?') {
        flush();
        out.push({ kind: 'wOne', text: '\\?' });
        i++;
      } else if (ch === '\\' && next !== undefined) {
        flush();
        out.push({ kind: 'bsLit', text: ch + next });
        i++;
      } else if (ch === '*') {
        flush();
        out.push({ kind: 'litStar', text: '*' });
      } else if (ch === '?') {
        flush();
        out.push({ kind: 'litQ', text: '?' });
      } else if (ch === '%' || ch === '_') {
        flush();
        out.push({ kind: 'sym', text: ch });
      } else {
        buf += ch;
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
      case 'wAny':
        return 'font-semibold text-neutral-600 dark:text-neutral-400';
      case 'wOne':
        return 'font-semibold text-violet-600 dark:text-violet-400';
      case 'litStar':
      case 'litQ':
        return 'font-medium text-amber-700/90 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-950/30 rounded px-0.5';
      case 'sym':
        return 'font-medium text-emerald-700/90 dark:text-emerald-400/90';
      case 'bsLit':
        return 'text-muted-foreground';
    }
  }
</script>

{#each searchSyntaxParts as seg}
  <span class={searchSyntaxSpanClass(seg)}>{seg.text}</span>
{/each}
