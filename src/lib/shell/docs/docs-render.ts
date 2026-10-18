/**
 * docs-render — KB markdown → sanitized HTML pipeline for the docs browser.
 *
 *   mdx → strip MDX directives → marked (custom renderer) → shiki code
 *   highlight → internal/external link rewrite → image placeholders →
 *   DOMPurify → html + toc
 *
 * Mermaid blocks come back as `<pre class="docs-mermaid">` placeholders —
 * the caller hydrates them with `hydrateMermaid(container)` post-mount.
 */
import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { createHighlighter, type Highlighter } from 'shiki';

export type DocsTocItem = { id: string; text: string; depth: 2 | 3 };

export type DocsRenderResult = {
  html: string;
  toc: DocsTocItem[];
};

// ─── Shiki (lazy singleton, docs lang set) ──────────────────────────────────

let highlighter: Highlighter | null = null;
let pending: Promise<Highlighter> | null = null;

const DOC_LANGS = ['ts', 'typescript', 'js', 'javascript', 'bash', 'sh', 'shell', 'sql', 'json', 'yaml', 'html', 'svelte', 'diff', 'md', 'tsx', 'css', 'toml'] as const;

async function getHighlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({
    themes: ['light-plus', 'github-dark-default'],
    langs: [...DOC_LANGS]
  });
  return (highlighter ??= await pending);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Convert MDX components that carry real content into markdown equivalents
 *  BEFORE any tag stripping. `<Mermaid chart={\`…\`}/>` (multiline attribute,
 *  chart text contains `-->` and `<br/>`) becomes a fenced ```mermaid block so
 *  it flows through the normal code path → `.docs-mermaid` placeholder →
 *  `hydrateMermaid`. Runs first: the generic JSX stripper would eat the
 *  opening tag at the first `>` inside the chart and leak the diagram body
 *  as raw text, corrupting every table/list after it (verified on rbac.mdx). */
function mdxComponentsToMarkdown(md: string): string {
  return md
    .replace(/<Mermaid\s+chart=\{`([\s\S]*?)`\}\s*\/?>/g, '\n\n```mermaid\n$1\n```\n\n')
    .replace(/<Mermaid[^>]*>\s*(?:\{`([\s\S]*?)`\}|([\s\S]*?))\s*<\/Mermaid>/g, (_m, attr, body) => `\n\n\`\`\`mermaid\n${attr ?? body}\n\`\`\`\n\n`);
}

/** Strip MDX-only syntax the KB docs may carry: import/export lines and
 *  PascalCase JSX tags (`<Callout …>…</Callout>`) — they have no meaning
 *  in-product and would leak as unknown elements after sanitization. The tag
 *  matcher is brace-aware: `prop={…}` groups may contain `>` (arrows, generics)
 *  without ending the tag early. */
function stripMdxDirectives(md: string): string {
  return md
    .replace(/^import\s[^\n]*$/gm, '')
    .replace(/^export\s[^\n]*$/gm, '')
    .replace(/<\/?[A-Z][A-Za-z0-9]*(?:(?:\{[^{}]*\})|[^>{])*>/g, '');
}

/** Docs-site base for links that point outside the KB (dev docs, site pages). */
const DOCS_SITE_BASE = 'https://docs.primebrick.dev/en/';

/**
 * Resolve a stored KB link (`metadata.links`, namespaced `<repo>/guide/<path>`)
 * or a `data-docpath` into a {repo, path} doc target. Namespaced links route
 * cross-repo; bare paths stay on the current repo.
 */
export function resolveDocTarget(
  link: string,
  currentRepo: string | undefined,
  repos: readonly { repo: string }[]
): { repo: string; path: string } | null {
  const clean = link.replace(/\.mdx?$/i, '');
  const segs = clean.split('/');
  if (segs.length >= 3 && segs[1] === 'guide' && repos.some((r) => r.repo === segs[0])) {
    return { repo: segs[0]!, path: segs.slice(2).join('/') };
  }
  const repo = currentRepo ?? repos[0]?.repo;
  return repo ? { repo, path: clean } : null;
}

/** Resolve `./`/`../` segments in a relative href against the doc's own dir. */
function resolveRelPath(docPath: string | undefined, href: string): string {
  if (!docPath || href.startsWith('/')) return href.replace(/^\.?\//, '');
  const dir = docPath.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '..') dir.pop();
    else if (seg && seg !== '.') dir.push(seg);
  }
  return dir.join('/');
}

/**
 * Render a KB doc to sanitized html + heading TOC.
 * Internal links become `data-docpath`/`data-docrepo` attributes (click →
 * in-panel navigation handled by the host); `#` anchors become
 * `data-docanchor`; external links get `target=_blank` so they leave the
 * product in a new tab. `opts.docPath` anchors relative `.mdx` hrefs.
 */
export async function renderDoc(md: string, opts?: { docPath?: string }): Promise<DocsRenderResult> {
  const toc: DocsTocItem[] = [];
  const codeBlocks: { token: string; lang: string; code: string }[] = [];

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const text = this.parser.parseInline(tokens);
        if (depth === 2 || depth === 3) {
          const id = slugify(text);
          toc.push({ id, text: text.replace(/<[^>]+>/g, ''), depth });
          return `<h${depth} id="${id}">${text}</h${depth}>`;
        }
        return `<h${depth}>${text}</h${depth}>`;
      },
      code({ text, lang }: Tokens.Code): string {
        const token = `@@DOC_CODE_${codeBlocks.length}@@`;
        codeBlocks.push({ token, lang: (lang ?? '').split(/\s/)[0]!.toLowerCase(), code: text });
        return token;
      },
      link({ href, tokens }: Tokens.Link): string {
        const text = this.parser.parseInline(tokens);
        if (/^https?:\/\//i.test(href)) {
          return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        if (href.startsWith('#')) {
          return `<a href="${escapeHtml(href)}" data-docanchor="${escapeHtml(href.slice(1))}">${text}</a>`;
        }
        const docLink = (slug: string, repo?: string): string => {
          const [path, anchor] = slug.replace(/\.mdx?$/i, '').split('#');
          return (
            `<a href="#" data-docpath="${escapeHtml(path ?? '')}"` +
            `${repo ? ` data-docrepo="${escapeHtml(repo)}"` : ''}` +
            `${anchor ? ` data-docanchor="${escapeHtml(anchor)}"` : ''}>${text}</a>`
          );
        };
        // `/docs/user-guide/<slug>` — product-route link to a user-guide
        // page of the same repo (the pack namespace is per-repo).
        let m = href.match(/^\/docs\/user-guide\/([^?#]+)/);
        if (m) return docLink(m[1]!);
        // `/docs/<repo>/guide/<slug>` — namespaced cross-repo user-guide link.
        m = href.match(/^\/docs\/([^/]+)\/guide\/([^?#]+)/);
        if (m) return docLink(m[2]!, m[1]!);
        // Other `/docs/…` (dev docs, site pages) — not in the product KB:
        // hand off to the public docs site in a new tab.
        m = href.match(/^\/docs\/(.+)/);
        if (m) {
          return `<a href="${escapeHtml(`${DOCS_SITE_BASE}${m[1]}`)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        if (/\.mdx?(#.*)?$/i.test(href) || /^\.\.?\/(?!\/)/.test(href)) {
          return docLink(resolveRelPath(opts?.docPath, href.split('#')[0]!) + (href.includes('#') ? `#${href.split('#')[1]}` : ''));
        }
        return `<a href="${escapeHtml(href)}">${text}</a>`;
      },
      image({ href, title, text }: Tokens.Image): string {
        // KB assets are not shipped with the product — render the alt text
        // as a placeholder so the doc stays readable.
        const caption = escapeHtml(title ?? text ?? href.split('/').pop() ?? 'image');
        return `<figure class="docs-img-placeholder" role="img" aria-label="${caption}"><span>${caption}</span></figure>`;
      }
    }
  });

  let html = marked.parse(stripMdxDirectives(mdxComponentsToMarkdown(md)), { async: false }) as string;

  // Code blocks: shiki highlight, mermaid → placeholder for post-mount hydration.
  if (codeBlocks.length) {
    const hl = await getHighlighter();
    const langs = new Set<string>(DOC_LANGS);
    for (const block of codeBlocks) {
      let replacement: string;
      if (block.lang === 'mermaid') {
        replacement = `<pre class="docs-mermaid">${escapeHtml(block.code)}</pre>`;
      } else if (block.lang && langs.has(block.lang)) {
        replacement = hl.codeToHtml(block.code, {
          lang: block.lang,
          themes: { light: 'light-plus', dark: 'github-dark-default' }
        });
      } else {
        replacement = `<pre><code>${escapeHtml(block.code)}</code></pre>`;
      }
      html = html.replace(block.token, replacement);
    }
  }

  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-docpath', 'data-docrepo', 'data-docanchor', 'target'],
    ADD_TAGS: ['figure']
  });
  return { html: clean, toc };
}

/** Hydrate `.docs-mermaid` placeholders inside a mounted container. */
export async function hydrateMermaid(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll('pre.docs-mermaid');
  if (!blocks.length) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
  let i = 0;
  for (const el of blocks) {
    const code = el.textContent ?? '';
    try {
      const { svg } = await mermaid.render(`docs-mermaid-${i++}`, code);
      const div = document.createElement('div');
      div.className = 'docs-mermaid-diagram';
      div.innerHTML = svg;
      el.replaceWith(div);
    } catch {
      el.classList.add('docs-mermaid-error');
    }
  }
}
