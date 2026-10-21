/**
 * docs-render — regression tests for the mdx→html pipeline.
 * P1 focus: MDX components with multiline JSX attributes (`<Mermaid chart={\`…\`}/>`
 * whose chart text contains `-->` and `<br/>`) must convert to mermaid fences —
 * the old generic tag stripper stopped at the first `>` inside the attribute and
 * leaked the diagram body as raw markdown, corrupting every table after it.
 */
import { describe, expect, it } from 'vitest';
import { renderDoc } from '../shell/docs/docs-render';

const MERMAID_JSX = `<Mermaid chart={\`
flowchart LR
    U["User"] --> R["Role"]
    R --> P["✔️ view customers"]
\`} />`;

describe('renderDoc — markdown fidelity', () => {
  it('renders a GFM table into real table elements', async () => {
    const { html } = await renderDoc('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th');
    expect(html).toContain('<td>1</td>');
    expect(html).not.toContain('|---');
  });

  it('renders unordered and ordered lists', async () => {
    const { html } = await renderDoc('- one\n- two\n\n1. first\n2. second');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect((html.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('converts <Mermaid chart={…}/> JSX into a mermaid placeholder, not leaked text', async () => {
    const { html } = await renderDoc(`Intro paragraph.\n\n${MERMAID_JSX}\n\nAfter the diagram.`);
    expect(html).toContain('docs-mermaid');
    // the chart lives escaped inside the placeholder for hydrateMermaid —
    // it must NOT appear as JSX or as raw (unescaped) arrows in flow text.
    expect(html).not.toContain('<Mermaid');
    expect(html).not.toContain('chart=');
    expect(html).not.toContain('-->');
    expect(html).toContain('After the diagram.');
  });

  it('does not corrupt the table AFTER a multiline Mermaid JSX block', async () => {
    const md = `${MERMAID_JSX}\n\n| Step | What |\n|---|---|\n| one | two |`;
    const { html } = await renderDoc(md);
    expect(html).toContain('<table>');
    expect(html).not.toContain('|---');
  });

  it('syntax-highlights fenced code via shiki and never leaks the token', async () => {
    const { html } = await renderDoc('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('shiki');
    expect(html).not.toContain('@@DOC_CODE_');
  });

  it('strips import/export lines and unknown PascalCase tags but keeps inner text', async () => {
    const md = `import { Callout } from 'zudoku';\n\n<Callout type="note">Keep this text.</Callout>`;
    const { html } = await renderDoc(md);
    expect(html).toContain('Keep this text.');
    expect(html).not.toContain('import ');
    expect(html).not.toContain('<Callout');
    expect(html).not.toContain('&lt;Callout');
  });

  it('collects h2/h3 into the TOC with ids', async () => {
    const { html, toc } = await renderDoc('# Title\n\n## First section\n\n### Sub point\n\nBody.');
    expect(toc.map((t) => t.text)).toEqual(['First section', 'Sub point']);
    expect(html).toContain('id="first-section"');
  });
});
