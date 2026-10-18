<script lang="ts">
  /**
   * DocsPanel — the in-product user-guide browser (sheet VIEWER archetype).
   *
   * Opened via `openSheet('shell.docs', {}, { modal: false })` from the
   * topbar book CTA. Three surfaces:
   *
   *   context doc  — the page the user is on resolves a doc through
   *                  `metadata.entity` (docsContext); shown on open with an
   *                  "On this page" TOC that scrolls inside CONTENT.
   *   index        — full repo→pages tree (`/docs/index`), ordered by each
   *                  repo's `_order.json`. Fallback when no context matches.
   *   doc          — any page opened from index/search/see-also/internal
   *                  links. An internal nav stack powers the back CTA:
   *                  doc → context → index.
   *
   * Search hits `/docs/search` (server-side embedding); nothing here is
   * agentic — no LLM is involved in browsing.
   */
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import { Input } from '$lib/components/ui/input';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import { closeSheet, sheetState, setSheetExpanded } from '$lib/shell/sheets/sheet-manager.svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { docsContext } from '$lib/shell/docs/docs-context.svelte';
  import { renderDoc, hydrateMermaid, type DocsTocItem } from '$lib/shell/docs/docs-render';
  import { fetchDocsIndex, fetchDoc, searchDocs, type DocsIndexRepo, type DocsIndexEntry, type DocsSearchHit } from '$lib/api';
  import { cn } from '$lib/utils';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minimize2 from '@lucide/svelte/icons/minimize-2';
  import Search from '@lucide/svelte/icons/search';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileText from '@lucide/svelte/icons/file-text';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import XIcon from '@lucide/svelte/icons/x';

  type DocRef = { repo: string; path: string };

  type LoadedDoc = DocRef & {
    title: string;
    html: string;
    toc: DocsTocItem[];
    links: string[];
  };

  type View = { kind: 'index' } | { kind: 'doc'; doc: LoadedDoc } | { kind: 'missing' };

  let index = $state<DocsIndexRepo[] | null>(null);
  let indexError = $state<string | null>(null);
  let stack = $state<View[]>([]);
  let loadingDoc = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<DocsSearchHit[] | null>(null);
  let searching = $state(false);
  let contentEl = $state<HTMLElement | null>(null);
  /** The context doc resolved on open — the "back to here" landmark. */
  let contextDocRef = $state<DocRef | null>(null);

  const view = $derived(stack[stack.length - 1] ?? ({ kind: 'index' } as View));
  const expanded = $derived(sheetState.expanded);

  /** Pick the index entry matching the current docs context.
   *  `create` mode prefers `<entity>-create` pages; list mode prefers the
   *  entity doc that is NOT a -create page. */
  function resolveContextEntry(): { repo: string; entry: DocsIndexEntry } | null {
    const entity = docsContext.entity;
    if (!entity || !index) return null;
    for (const repo of index) {
      const matches = repo.entries.filter((e) => e.entity === entity);
      if (!matches.length) continue;
      const create = matches.find((e) => /-create$/.test(e.path.replace(/\.mdx$/i, '')));
      const main = matches.find((e) => !/-create$/.test(e.path.replace(/\.mdx$/i, '')));
      const entry = docsContext.mode === 'create' ? (create ?? main) : (main ?? create);
      if (entry) return { repo: repo.repo, entry };
    }
    return null;
  }

  async function openDoc(ref: DocRef, opts?: { replace?: boolean }) {
    loadingDoc = true;
    try {
      const doc = await fetchDoc({ repo: ref.repo, path: ref.path });
      if (!doc) {
        stack = [...stack, { kind: 'missing' }];
        return;
      }
      const rendered = await renderDoc(doc.content);
      const links = Array.isArray(doc.metadata?.links)
        ? (doc.metadata.links as unknown[]).filter((l): l is string => typeof l === 'string')
        : [];
      const loaded: LoadedDoc = { repo: doc.repo, path: doc.path, title: doc.title, html: rendered.html, toc: rendered.toc, links };
      stack = opts?.replace ? [...stack.slice(0, -1), { kind: 'doc', doc: loaded }] : [...stack, { kind: 'doc', doc: loaded }];
    } finally {
      loadingDoc = false;
    }
  }

  function pushIndex() {
    stack = [...stack, { kind: 'index' }];
  }

  function goBack() {
    if (stack.length <= 1) return;
    stack = stack.slice(0, -1);
    contentEl?.scrollTo({ top: 0 });
  }

  function toggleExpand() {
    const next = !sheetState.expanded;
    setSheetExpanded(next);
    // This panel is non-modal when collapsed — expanded implies modal.
    sheetState.modal = next;
  }

  function scrollToAnchor(id: string) {
    contentEl?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Click delegation: [data-docpath] → in-panel doc navigation,
   *  [data-docanchor] → scroll inside CONTENT. */
  function onContentClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('a');
    if (!el) return;
    const docpath = el.getAttribute('data-docpath');
    const anchor = el.getAttribute('data-docanchor');
    if (docpath) {
      e.preventDefault();
      const path = docpath.endsWith('.mdx') ? docpath : `${docpath}.mdx`;
      const repo = view.kind === 'doc' ? view.doc.repo : index?.[0]?.repo;
      if (repo) void openDoc({ repo, path }).then(() => {
        if (anchor) tick().then(() => scrollToAnchor(anchor));
      });
      return;
    }
    if (anchor) {
      e.preventDefault();
      scrollToAnchor(anchor);
    }
  }

  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchDebounce) clearTimeout(searchDebounce);
    const q = searchQuery.trim();
    if (!q) {
      searchResults = null;
      return;
    }
    searchDebounce = setTimeout(async () => {
      searching = true;
      try {
        searchResults = await searchDocs({ query: q, limit: 8 });
      } catch {
        searchResults = [];
      } finally {
        searching = false;
      }
    }, 300);
  }

  function openSearchHit(hit: DocsSearchHit) {
    searchQuery = '';
    searchResults = null;
    void openDoc({ repo: hit.repo, path: hit.path });
  }

  function fullPageHref(doc: LoadedDoc): string {
    return `/docs/${doc.repo}/${doc.path.replace(/\.mdx$/i, '')}`;
  }

  /** Mermaid diagrams hydrate after the {@html} content mounts. */
  $effect(() => {
    const el = contentEl;
    const v = view;
    if (!el || v.kind !== 'doc') return;
    tick().then(() => hydrateMermaid(el));
  });

  onMount(async () => {
    try {
      index = await fetchDocsIndex();
    } catch (e) {
      indexError = e instanceof Error ? e.message : String(e);
      stack = [{ kind: 'index' }];
      return;
    }
    const ctx = resolveContextEntry();
    if (ctx) {
      contextDocRef = { repo: ctx.repo, path: ctx.entry.path };
      await openDoc(contextDocRef);
    } else {
      stack = [{ kind: 'index' }];
    }
  });
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <BookOpen class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.docs.title')}
  {/snippet}
  {#snippet actions()}
    {#if stack.length > 1}
      <SheetHeaderAction title={$t('app.docs.back')} onclick={goBack} testid="docs-panel-back">
        <ArrowLeft class="size-4" />
      </SheetHeaderAction>
    {/if}
    <SheetHeaderAction
      title={expanded ? $t('app.docs.collapse') : $t('app.docs.expand')}
      onclick={toggleExpand}
      testid="docs-panel-expand"
    >
      {#if expanded}
        <Minimize2 class="size-4" />
      {:else}
        <Maximize2 class="size-4" />
      {/if}
    </SheetHeaderAction>
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('app.common.done')}
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  {/snippet}
  {#snippet toolbar()}
    <div class="relative">
      <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        bind:value={searchQuery}
        oninput={onSearchInput}
        placeholder={$t('app.docs.search.placeholder')}
        class="h-8 pl-8 text-sm"
        data-testid="docs-panel-search"
      />
    </div>
  {/snippet}

  <div bind:this={contentEl} class="h-full overflow-auto" onclick={onContentClick} role="presentation">
    {#if searchResults !== null || searching}
      <div class="p-3">
        {#if searching}
          <div class="flex items-center gap-2 py-6 justify-center text-muted-foreground">
            <LoaderCircle class="size-4 animate-spin" />
            <span class="text-sm">{$t('app.docs.loading')}</span>
          </div>
        {:else if searchResults && searchResults.length === 0}
          <p class="py-6 text-center text-sm text-muted-foreground">{$t('app.docs.noResults')}</p>
        {:else}
          <ul class="space-y-1" data-testid="docs-search-results">
            {#each searchResults ?? [] as hit (hit.repo + hit.path + hit.chunk_idx)}
              <li>
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  onclick={() => openSearchHit(hit)}
                >
                  <div class="text-sm font-medium">{hit.title}</div>
                  <div class="text-xs text-muted-foreground">{hit.repo} · {hit.path}</div>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else if loadingDoc && view.kind !== 'doc'}
      <div class="flex items-center gap-2 py-10 justify-center text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        <span class="text-sm">{$t('app.docs.loading')}</span>
      </div>
    {:else if view.kind === 'missing'}
      <div class="p-4 text-sm text-muted-foreground">{$t('app.docs.notFound')}</div>
    {:else if view.kind === 'doc'}
      {@const doc = view.doc}
      <article class="p-4">
        <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{doc.repo}</div>
        <h1 class="mb-3 text-lg font-semibold leading-tight">{doc.title}</h1>

        {#if doc.toc.length}
          <nav class="mb-4 rounded-md border border-border bg-muted/30 p-3" data-testid="docs-toc">
            <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {$t('app.docs.onThisPage')}
            </div>
            <ul class="space-y-1">
              {#each doc.toc as item (item.id)}
                <li class={item.depth === 3 ? 'pl-3' : ''}>
                  <a
                    href={`#${item.id}`}
                    class="text-sm text-primary hover:underline"
                    onclick={(e) => { e.preventDefault(); scrollToAnchor(item.id); }}
                  >{item.text}</a>
                </li>
              {/each}
            </ul>
          </nav>
        {/if}

        <!-- eslint-disable-next-line svelte/no-at-html-tags -- KB content is DOMPurify-sanitized in renderDoc -->
        <div class="docs-md" data-testid="docs-content">{@html doc.html}</div>

        {#if doc.links.length}
          <div class="mt-6 border-t border-border pt-3" data-testid="docs-see-also">
            <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {$t('app.docs.seeAlso')}
            </div>
            <ul class="space-y-1">
              {#each doc.links as link (link)}
                <li>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    onclick={() => void openDoc({ repo: doc.repo, path: link.endsWith('.mdx') ? link : `${link}.mdx` })}
                  >
                    <FileText class="size-3.5 shrink-0" />
                    {link.replace(/\.mdx$/i, '')}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="mt-6 flex items-center justify-between gap-2 border-t border-border pt-3">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onclick={pushIndex}
            data-testid="docs-all-docs"
          >
            <BookOpen class="size-3.5" />
            {$t('app.docs.index')}
          </button>
          <a
            href={resolve(fullPageHref(doc) as '/')}
            class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onclick={() => closeSheet()}
            data-testid="docs-view-full"
          >
            <ExternalLink class="size-3.5" />
            {$t('app.docs.viewFull')}
          </a>
        </div>
      </article>
    {:else}
      <!-- index view -->
      <div class="p-3">
        {#if indexError}
          <p class="py-6 text-center text-sm text-muted-foreground">{indexError}</p>
        {:else if index === null}
          <div class="flex items-center gap-2 py-10 justify-center text-muted-foreground">
            <LoaderCircle class="size-4 animate-spin" />
            <span class="text-sm">{$t('app.docs.loading')}</span>
          </div>
        {:else}
          <Accordion.Root type="multiple" class="w-full" value={index.map((r) => r.repo)}>
            {#each index as repo (repo.repo)}
              <Accordion.Item value={repo.repo} data-testid={`docs-repo-${repo.repo}`}>
                <Accordion.Trigger class="text-sm">{repo.repo}</Accordion.Trigger>
                <Accordion.Content>
                  <ul class="space-y-0.5 py-1">
                    {#each repo.entries as entry (entry.path)}
                      <li>
                        <button
                          type="button"
                          class={cn(
                            'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                            contextDocRef?.repo === repo.repo && contextDocRef?.path === entry.path && 'bg-accent/60 font-medium'
                          )}
                          onclick={() => void openDoc({ repo: repo.repo, path: entry.path })}
                        >
                          <span class="flex items-center gap-1.5">
                            <FileText class="size-3.5 shrink-0 text-muted-foreground" />
                            {entry.title}
                          </span>
                          {#if entry.description}
                            <span class="mt-0.5 block pl-5 text-xs text-muted-foreground">{entry.description}</span>
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                </Accordion.Content>
              </Accordion.Item>
            {/each}
          </Accordion.Root>
        {/if}
      </div>
    {/if}
  </div>
</SheetPanelLayout>

<style>
  /* KB markdown — scoped via .docs-md, same pattern as .ai-md. */
  .docs-md :global(h1) { font-size: 1.15rem; font-weight: 600; margin: 1.2em 0 0.5em; }
  .docs-md :global(h2) { font-size: 1.05rem; font-weight: 600; margin: 1.2em 0 0.5em; scroll-margin-top: 0.5rem; }
  .docs-md :global(h3) { font-size: 0.95rem; font-weight: 600; margin: 1em 0 0.4em; scroll-margin-top: 0.5rem; }
  .docs-md :global(h4) { font-size: 0.875rem; font-weight: 600; margin: 0.8em 0 0.3em; }
  .docs-md :global(p) { margin: 0 0 0.7em; font-size: 0.875rem; line-height: 1.55; }
  .docs-md :global(ul), .docs-md :global(ol) { margin: 0 0 0.7em; padding-left: 1.25rem; font-size: 0.875rem; }
  .docs-md :global(ul) { list-style: disc; }
  .docs-md :global(ol) { list-style: decimal; }
  .docs-md :global(li) { margin: 0.2em 0; line-height: 1.5; }
  .docs-md :global(code) {
    background: var(--muted);
    padding: 0.1em 0.3em;
    border-radius: 0.25rem;
    font-size: 0.8em;
  }
  .docs-md :global(pre) {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.6rem 0.75rem;
    overflow-x: auto;
    margin: 0 0 0.8em;
    font-size: 0.8rem;
  }
  .docs-md :global(pre code) { background: transparent; padding: 0; }
  .docs-md :global(pre.shiki) { background: transparent; }
  .docs-md :global(a) { color: var(--primary); }
  .docs-md :global(a:hover) { text-decoration: underline; }
  .docs-md :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    margin: 0 0 0.8em;
  }
  .docs-md :global(th), .docs-md :global(td) {
    border: 1px solid var(--border);
    padding: 0.35rem 0.5rem;
    text-align: left;
  }
  .docs-md :global(th) { background: var(--muted); font-weight: 600; }
  .docs-md :global(blockquote) {
    border-left: 3px solid var(--border);
    padding-left: 0.75rem;
    margin: 0 0 0.7em;
    color: var(--muted-foreground);
  }
  .docs-md :global(hr) { border-color: var(--border); margin: 1em 0; }
  .docs-md :global(.docs-img-placeholder) {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--border);
    border-radius: 0.375rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    padding: 1.5rem 0.75rem;
    margin: 0 0 0.8em;
    text-align: center;
  }
  .docs-md :global(.docs-mermaid) {
    border: 1px solid var(--border);
    border-radius: 0.375rem;
  }
  .docs-md :global(.docs-mermaid-diagram) {
    display: flex;
    justify-content: center;
    padding: 0.75rem;
    margin: 0 0 0.8em;
    overflow-x: auto;
  }
  .docs-md :global(.docs-mermaid-diagram svg) { max-width: 100%; }
</style>
