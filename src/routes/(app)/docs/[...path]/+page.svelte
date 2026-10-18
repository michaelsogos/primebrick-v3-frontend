<script lang="ts">
  /**
   * /docs/[...path] — full-page user-guide browser ("View full page" from the
   * docs sheet). Deliberately low-prominence: no top-level nav entry; the
   * doc tree lives in a page-local left column, not the global sidebar.
   *
   * URL shape: /docs/<repo>/<doc-path> — doc-path is the KB path without the
   * .mdx extension (e.g. /docs/backend/generated/customers).
   * /docs (no path) → tree only, first entry pre-selected.
   */
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { fetchDocsIndex, fetchDoc, type DocsIndexRepo } from '$lib/api';
  import { renderDoc, hydrateMermaid } from '$lib/shell/docs/docs-render';
  import { cn } from '$lib/utils';
  import FileText from '@lucide/svelte/icons/file-text';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import BookOpen from '@lucide/svelte/icons/book-open';

  type LoadedDoc = { repo: string; path: string; title: string; html: string };

  let index = $state<DocsIndexRepo[] | null>(null);
  let error = $state<string | null>(null);
  let doc = $state<LoadedDoc | null>(null);
  let docMissing = $state(false);
  let contentEl = $state<HTMLElement | null>(null);

  const rawPath = $derived(page.params.path ?? '');
  const docRef = $derived.by(() => {
    const [repo, ...rest] = rawPath.split('/').filter(Boolean);
    return repo && rest.length ? { repo, path: `${rest.join('/')}.mdx` } : null;
  });

  async function loadDoc(repo: string, path: string) {
    doc = null;
    docMissing = false;
    const found = await fetchDoc({ repo, path });
    if (!found) {
      docMissing = true;
      return;
    }
    const rendered = await renderDoc(found.content);
    doc = { repo: found.repo, path: found.path, title: found.title, html: rendered.html };
    await tick();
    if (contentEl) await hydrateMermaid(contentEl);
  }

  function hrefFor(repo: string, path: string): string {
    return `/docs/${repo}/${path.replace(/\.mdx$/i, '')}`;
  }

  function onContentClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('a');
    if (!el) return;
    const docpath = el.getAttribute('data-docpath');
    const anchor = el.getAttribute('data-docanchor');
    if (docpath) {
      e.preventDefault();
      const target = hrefFor(docRef?.repo ?? index?.[0]?.repo ?? 'backend', docpath);
      void goto(resolve(target as '/')).then(() => {
        if (anchor) tick().then(() => contentEl?.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView());
      });
      return;
    }
    if (anchor) {
      e.preventDefault();
      contentEl?.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // React to param changes (in-page doc links keep the same component).
  $effect(() => {
    const ref = docRef;
    if (ref) void loadDoc(ref.repo, ref.path);
    else doc = null;
  });

  onMount(async () => {
    try {
      index = await fetchDocsIndex();
      if (!docRef && index.length) {
        const first = index.flatMap((r) => r.entries.map((e) => ({ repo: r.repo, path: e.path })))[0];
        if (first) void goto(resolve(hrefFor(first.repo, first.path) as '/'), { replaceState: true });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });
</script>

<AppPageScaffold title={$t('app.docs.title')}>
  <div class="flex h-full min-h-0">
    <!-- page-local doc tree -->
    <aside class="w-64 shrink-0 overflow-auto border-r border-border p-2" data-testid="docs-tree">
      {#if error}
        <p class="p-2 text-sm text-muted-foreground">{error}</p>
      {:else if index === null}
        <div class="flex items-center gap-2 p-2 text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />
          <span class="text-sm">{$t('app.docs.loading')}</span>
        </div>
      {:else}
        {#each index as repo (repo.repo)}
          <div class="mb-3">
            <div class="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {repo.repo}
            </div>
            <ul class="space-y-0.5">
              {#each repo.entries as entry (entry.path)}
                {@const href = hrefFor(repo.repo, entry.path)}
                {@const active = doc?.repo === repo.repo && doc?.path === entry.path}
                <li>
                  <a
                    href={resolve(href as '/')}
                    class={cn(
                      'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                      active && 'bg-accent font-medium'
                    )}
                  >
                    <FileText class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="truncate">{entry.title}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </aside>

    <!-- doc content -->
    <div bind:this={contentEl} class="min-w-0 flex-1 overflow-auto p-6" onclick={onContentClick} role="presentation">
      {#if docMissing}
        <div class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <BookOpen class="size-8" />
          <p class="text-sm">{$t('app.docs.notFound')}</p>
        </div>
      {:else if doc}
        <article class="docs-page mx-auto max-w-3xl">
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{doc.repo}</div>
          <h1 class="mb-4 text-2xl font-semibold leading-tight">{doc.title}</h1>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- KB content is DOMPurify-sanitized in renderDoc -->
          <div class="docs-md">{@html doc.html}</div>
        </article>
      {:else}
        <div class="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />
          <span class="text-sm">{$t('app.docs.loading')}</span>
        </div>
      {/if}
    </div>
  </div>
</AppPageScaffold>

<style>
  .docs-md :global(h1) { font-size: 1.35rem; font-weight: 600; margin: 1.2em 0 0.5em; }
  .docs-md :global(h2) { font-size: 1.15rem; font-weight: 600; margin: 1.3em 0 0.5em; scroll-margin-top: 1rem; }
  .docs-md :global(h3) { font-size: 1rem; font-weight: 600; margin: 1.1em 0 0.4em; scroll-margin-top: 1rem; }
  .docs-md :global(h4) { font-size: 0.9rem; font-weight: 600; margin: 0.9em 0 0.3em; }
  .docs-md :global(p) { margin: 0 0 0.8em; line-height: 1.65; }
  .docs-md :global(ul), .docs-md :global(ol) { margin: 0 0 0.8em; padding-left: 1.4rem; }
  .docs-md :global(ul) { list-style: disc; }
  .docs-md :global(ol) { list-style: decimal; }
  .docs-md :global(li) { margin: 0.25em 0; line-height: 1.6; }
  .docs-md :global(code) { background: var(--muted); padding: 0.1em 0.3em; border-radius: 0.25rem; font-size: 0.85em; }
  .docs-md :global(pre) {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    margin: 0 0 1em;
    font-size: 0.85rem;
  }
  .docs-md :global(pre code) { background: transparent; padding: 0; }
  .docs-md :global(pre.shiki) { background: transparent; }
  .docs-md :global(a) { color: var(--primary); }
  .docs-md :global(a:hover) { text-decoration: underline; }
  .docs-md :global(table) { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0 0 1em; }
  .docs-md :global(th), .docs-md :global(td) { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
  .docs-md :global(th) { background: var(--muted); font-weight: 600; }
  .docs-md :global(blockquote) { border-left: 3px solid var(--border); padding-left: 1rem; margin: 0 0 0.8em; color: var(--muted-foreground); }
  .docs-md :global(hr) { border-color: var(--border); margin: 1.2em 0; }
  .docs-md :global(.docs-img-placeholder) {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border); border-radius: 0.375rem;
    background: var(--muted); color: var(--muted-foreground);
    font-size: 0.8rem; padding: 2rem 1rem; margin: 0 0 1em; text-align: center;
  }
  .docs-md :global(.docs-mermaid) { border: 1px solid var(--border); border-radius: 0.375rem; }
  .docs-md :global(.docs-mermaid-diagram) { display: flex; justify-content: center; padding: 1rem; margin: 0 0 1em; overflow-x: auto; }
  .docs-md :global(.docs-mermaid-diagram svg) { max-width: 100%; }
</style>
