import svelteConfig from './svelte.config.js';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    /**
     * Sheets are a closed, typed system: every right/left panel goes through
     * `openSheet('<panelId>', props)` (sheet-manager.svelte.ts) and renders
     * inside `SheetPanelLayout`. Direct `ui/sheet` imports outside the
     * sheets infrastructure bypass the panel registry, the standard
     * header/layout anatomy, and modal/dirty-state handling — forbidden.
     * Legit direct consumers (excluded below): the sheet primitives
     * themselves, SheetHost/SheetPanelLayout, entity-list panels
     * (Sheet.Close only), and the vendored sidebar.
     */
    files: ['src/**/*.{ts,svelte}'],
    ignores: [
      'src/lib/components/ui/sheet/**',
      'src/lib/components/ui/sidebar/**',
      'src/lib/shell/sheets/**',
      'src/lib/entity-list/sheets/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/ui/sheet', '**/components/ui/sheet/*'],
              message:
                "Do not import ui/sheet directly. Register a panel in SheetPanelPropsMap + SheetHost and open it via openSheet() — panels must wrap content in SheetPanelLayout. See docs/ai/sheets.md.",
            },
          ],
        },
      ],
    },
  },
  {
    // Project-specific rule overrides
    rules: {
      // Align with AGENTS.md: prefer $derived() over $derived.by() when possible
      'svelte/prefer-derived-over-derived-by': 'error',
      // Keep existing vestigial eslint-disable comments valid
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Ignore generated/build artifacts
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'docs/user-guide/_extracted/**',
      '*.config.{js,ts}',
      'scripts/**',
      'src/lib/__tests__/**',
    ],
  },
);
