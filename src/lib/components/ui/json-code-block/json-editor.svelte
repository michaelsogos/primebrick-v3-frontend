<script lang="ts">
  import { cn } from '$lib/utils';
  import { onMount } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { EditorView } from '@codemirror/view';

  let {
    value = $bindable(''),
    minRows = 0,
    maxHeight,
    placeholder: placeholderText,
    onChange,
    class: className,
    ...rest
  }: {
    /** Editable JSON text (bindable). */
    value?: string;
    /** Minimum visible rows (row = 1.25rem at text-xs). */
    minRows?: number;
    /** CSS max-height for the scrollable editor (e.g. '24rem'). */
    maxHeight?: string;
    /** CodeMirror placeholder shown when empty. */
    placeholder?: string;
    /** Called on every edit with the new doc text. */
    onChange?: (v: string) => void;
  } & HTMLAttributes<HTMLDivElement> = $props();

  let host: HTMLDivElement;
  let view: EditorView | null = null;
  let applyingExternal = false;

  const containerStyle = $derived(
    [
      minRows > 0 ? `min-height: calc(${minRows} * 1.25rem + 1.5rem)` : '',
      maxHeight ? `max-height: ${maxHeight}` : '',
    ]
      .filter(Boolean)
      .join('; ')
  );

  onMount(() => {
    let destroyed = false;
    (async () => {
      const [
        { EditorView, basicSetup },
        { json },
        { linter, lintGutter },
        { HighlightStyle, syntaxHighlighting },
        { tags },
      ] = await Promise.all([
        import('codemirror'),
        import('@codemirror/lang-json'),
        import('@codemirror/lint'),
        import('@codemirror/language'),
        import('@lezer/highlight'),
      ]);
      if (destroyed) return;

      // Same palette as JsonCodeBlock's shiki themes (light-plus /
      // github-dark-default), expressed as CSS vars so .dark switches it.
      // jsonParseLinter reports zero-length diagnostics (point marker only).
      // This variant extends the range to end-of-line → wavy underline.
      const jsonLintRange = () => (v: EditorView) => {
        try {
          JSON.parse(v.state.doc.toString());
          return [];
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
          const doc = v.state.doc;
          let pos = 0;
          const mPos = /at position (\d+)/.exec(e.message);
          const mLine = /at line (\d+) column (\d+)/.exec(e.message);
          if (mPos) pos = Math.min(+mPos[1], doc.length);
          else if (mLine) pos = Math.min(doc.line(+mLine[1]).from + (+mLine[2]) - 1, doc.length);
          const line = doc.lineAt(pos);
          const to = line.to > pos ? line.to : Math.min(pos + 1, doc.length);
          return [{ from: pos, to, message: e.message, severity: 'error' as const }];
        }
      };

      const shikiStyle = HighlightStyle.define([
        { tag: tags.propertyName, color: 'var(--json-property)' },
        { tag: tags.string, color: 'var(--json-string)' },
        { tag: tags.number, color: 'var(--json-number)' },
        { tag: [tags.bool, tags.null, tags.keyword], color: 'var(--json-atom)' },
        { tag: tags.punctuation, color: 'var(--json-punctuation)' },
      ]);
      view = new EditorView({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          syntaxHighlighting(shikiStyle),
          linter(jsonLintRange()),
          lintGutter(),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !applyingExternal) {
              const v = u.state.doc.toString();
              value = v;
              onChange?.(v);
            }
          }),
          EditorView.theme({
            '&': { fontSize: '0.75rem', backgroundColor: 'transparent' },
            '.cm-content': { fontFamily: 'monospace', padding: '0.75rem' },
            '.cm-line': { lineHeight: '1.25rem', padding: '0' },
            '.cm-scroller': { fontFamily: 'monospace', overflow: 'auto' },
            '.cm-gutters': {
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              paddingLeft: '0.75rem',
              opacity: '0.6',
            },
            '.cm-gutterElement': { lineHeight: '1.25rem' },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
        parent: host,
      });
    })();
    return () => {
      destroyed = true;
      view?.destroy();
      view = null;
    };
  });

  // Push external value changes into the editor (e.g. builder resets).
  $effect(() => {
    const v = value;
    if (view && v !== view.state.doc.toString()) {
      applyingExternal = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
      applyingExternal = false;
    }
  });
</script>

<div
  class={cn('json-editor relative rounded-md bg-muted overflow-hidden', className)}
  style={containerStyle}
  {...rest}
>
  <div bind:this={host} class="h-full" data-testid="json-editor-cm"></div>
  {#if placeholderText && !value}
    <div class="pointer-events-none absolute top-3 left-12 text-xs font-mono text-muted-foreground/60">
      {placeholderText}
    </div>
  {/if}
</div>

<style>
  /* Same palette as JsonCodeBlock's shiki themes. */
  .json-editor {
    /* light-plus */
    --json-property: #0451a5;
    --json-string: #a31515;
    --json-number: #098658;
    --json-atom: #0000ff;
    --json-punctuation: #000000;
  }
  :global(.dark) .json-editor {
    /* github-dark-default */
    --json-property: #79c0ff;
    --json-string: #a5d6ff;
    --json-number: #79c0ff;
    --json-atom: #ff7b72;
    --json-punctuation: #c9d1d9;
  }

  /* Keep lint panels on-app theme. (The wavy error underline is drawn by
     CodeMirror's base theme via background-image.) */
  :global(.cm-tooltip) {
    background-color: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
  }
</style>
