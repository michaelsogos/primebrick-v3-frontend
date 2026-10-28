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
    /**
     * Vendor plane — vendor libraries are consumed ONLY through their
     * sanctioned `@primebrick/ui/vendor/<lib>` subpaths (mirrors core's
     * VENDOR_BLOCKED_PACKAGES: the remote chunk build rejects the same raw
     * imports). A raw import would resolve a second, unsanctioned instance
     * outside the host-controlled vendor plane — forbidden by design.
     */
    files: ['src/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // paths = exact package names (anchored — a bare name pattern
          // would also match the sanctioned '@primebrick/ui/vendor/<lib>'
          // specifier's last segment). patterns = the same packages' deep
          // subpath imports, anchored so they cannot match the ui subpaths.
          paths: [
            'clsx',
            'tailwind-merge',
            'tailwind-variants',
            '@lucide/svelte',
            'bits-ui',
            '@huggingface/transformers',
          ].map((name) => ({
            name,
            message:
              'Raw vendor imports are forbidden — use the sanctioned @primebrick/ui/vendor/<lib> subpath (@primebrick/ui/vendor/transformers for transformers). See ai-plans/COMPLETED/vendor-plane-unification.md.',
          })),
          patterns: [
            {
              group: [
                'clsx/*',
                'tailwind-merge/*',
                'tailwind-variants/*',
                '@lucide/svelte/*',
                'bits-ui/*',
                '@huggingface/transformers/*',
              ],
              message:
                'Raw vendor imports are forbidden — use the sanctioned @primebrick/ui/vendor/<lib> subpath (@primebrick/ui/vendor/transformers for transformers). See ai-plans/COMPLETED/vendor-plane-unification.md.',
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * vendor/ is the vendor-plane BUILD — its entry files legitimately
     * re-export svelte internals (that is the bundle's whole purpose), so
     * the svelte-internal prohibition does not apply there.
     */
    files: ['vendor/**/*.{ts,js}'],
    rules: {
      'svelte/no-svelte-internal': 'off',
    },
  },
  {
    /**
     * Page chrome is host-owned and MANDATORY — `AppShell` renders the
     * fixed `PageHeader` (breadcrumb · ★ · h1 · description · presence)
     * above every (app) route. Route files must never rebuild chrome:
     * no direct imports of the breadcrumb machinery or the header
     * component. The ONLY opt-out is the route decl's `chrome:'remote'`
     * flag (remote pages that own their complete chrome).
     */
    files: ['src/routes/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '$lib/components/AppPageBreadcrumb.svelte',
              message:
                'Page chrome is host-owned — AppShell renders the mandatory PageHeader. Remove the breadcrumb; the route decl label_key drives the title.',
            },
            {
              name: '$lib/breadcrumb/module-breadcrumb',
              message:
                'Page chrome is host-owned — moduleBreadcrumbSegments is PageHeader-internal. Remove it; the route decl label_key drives the title.',
            },
          ],
          patterns: [
            {
              group: ['**/AppPageBreadcrumb*', '**/page-header/**'],
              message:
                'Page chrome is host-owned — AppShell renders the mandatory PageHeader. Route files must not import header/breadcrumb components.',
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
    /**
     * ext-json wire layer: api-ext.ts/api-types.ts serialize BE traffic and must
     * never bypass extJsonParse/extJsonStringify (bigint safety). Plain JSON.* in
     * localStorage/UI code elsewhere is legitimate — scope stays tight on purpose.
     */
    files: ['src/lib/api-ext.ts', 'src/lib/api-types.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='JSON'][callee.property.name='stringify']",
          message: 'Use extJsonStringify — BE wire payloads are ext-json (bigint-safe).',
        },
        {
          selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
          message: 'Use extJsonParse — BE wire payloads are ext-json (bigint-safe).',
        },
      ],
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
