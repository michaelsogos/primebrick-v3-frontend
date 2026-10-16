/**
 * Adapter: vscode-json-languageservice → CodeMirror 6 extensions.
 * Lazy-loaded — call only when a JSON schema is provided.
 * Gives schema-aware lint (real ranges), completion (enum values like
 * true/false, property names per path) and hover, all in-process.
 */
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { TextDocument } from 'vscode-languageserver-textdocument';

const DOC_URI = 'inmemory://model.json';
const SCHEMA_URI = 'inmemory://schema.json';

type LintDiagnostic = {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
};

type CompletionEntry = {
  label: string;
  type?: string;
  detail?: string;
  info?: string;
  apply?: string | ((view: EditorView, completion: unknown, from: number, to: number) => void);
};

export async function jsonLsExtensions(schema: Record<string, unknown>): Promise<Extension[]> {
  const [{ getLanguageService }, { TextDocument: TD }, { linter }, langJson] =
    await Promise.all([
      import('vscode-json-languageservice'),
      import('vscode-languageserver-textdocument'),
      import('@codemirror/lint'),
      import('@codemirror/lang-json'),
    ]);

  const ls = getLanguageService({});
  ls.configure({
    schemas: [{ uri: SCHEMA_URI, fileMatch: ['*.json'], schema }],
    allowComments: false,
  });

  const makeDoc = (code: string): TextDocument =>
    TD.create(DOC_URI, 'json', 0, code);

  const severityMap: Record<number, LintDiagnostic['severity']> = {
    1: 'error',
    2: 'warning',
    3: 'info',
    4: 'hint',
  };

  const kindMap: Record<number, string> = {
    10: 'property',
    12: 'constant',
    13: 'constant',
    14: 'keyword',
    20: 'constant',
    21: 'constant',
  };

  function toOffset(doc: { line: (n: number) => { from: number; length: number } }, pos: { line: number; character: number }): number {
    const line = doc.line(pos.line + 1);
    return Math.min(line.from + pos.character, line.from + line.length);
  }

  // Strip LS snippet placeholders ($0, $1, ${1:foo}) for plain insertion.
  function plainInsertText(text: string): string {
    return text.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d+/g, '');
  }

  const schemaLinter = linter(async (view: EditorView): Promise<LintDiagnostic[]> => {
    const textDoc = makeDoc(view.state.doc.toString());
    const diagnostics = await ls.doValidation(textDoc, ls.parseJSONDocument(textDoc), {
      comments: 'error',
      schemaValidation: 'error',
      schemaRequest: 'warning',
      trailingCommas: 'error',
    });
    return diagnostics.map((d) => ({
      from: toOffset(view.state.doc, d.range.start),
      to: toOffset(view.state.doc, d.range.end),
      severity: severityMap[d.severity ?? 1] ?? 'error',
      message: typeof d.message === 'string' ? d.message : d.message.value,
    }));
  });

  const completionSource = async (context: {
    pos: number;
    explicit: boolean;
    state: { doc: { lineAt: (n: number) => { from: number; number: number }; toString: () => string; line: (n: number) => { from: number; length: number } } };
  }) => {
    const code = context.state.doc.toString();
    const textDoc = makeDoc(code);
    const line = context.state.doc.lineAt(context.pos);
    const result = await ls.doComplete(
      textDoc,
      { line: line.number - 1, character: context.pos - line.from },
      ls.parseJSONDocument(textDoc),
    );
    if (!result || result.items.length === 0) return null;

    const options: CompletionEntry[] = result.items.map((item) => {
      const option: CompletionEntry = {
        label: typeof item.label === 'string' ? item.label : String(item.label),
        type: kindMap[item.kind ?? 0] ?? 'text',
        detail: typeof item.detail === 'string' ? item.detail : undefined,
        info:
          typeof item.documentation === 'string'
            ? item.documentation
            : item.documentation && 'value' in item.documentation
              ? String(item.documentation.value)
              : undefined,
      };
      const textEdit =
        item.textEdit && 'newText' in item.textEdit && 'range' in item.textEdit
          ? item.textEdit
          : undefined;
      if (textEdit) {
        const from = toOffset(context.state.doc, textEdit.range.start);
        const to = toOffset(context.state.doc, textEdit.range.end);
        const insert = plainInsertText(textEdit.newText);
        option.apply = (v) => {
          v.dispatch({ changes: { from, to, insert }, userEvent: 'input.complete' });
        };
      } else if (item.insertText) {
        option.apply = plainInsertText(item.insertText);
      } else {
        option.apply = option.label;
      }
      return option;
    });

    return { from: context.pos, options, validFor: /^[\w"$.[\]-]*$/ };
  };

  return [
    schemaLinter,
    langJson.jsonLanguage.data.of({ autocomplete: completionSource }),
  ];
}
