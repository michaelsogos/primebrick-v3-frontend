import svelteConfig from './svelte.config.js';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/**
 * Import-governance fragments. Flat config is LAST-MATCH-WINS per rule:
 * when several blocks match a file and set `no-restricted-imports`, the
 * LAST block's options replace the earlier ones entirely (no merge).
 * Every block below therefore composes the UNION of the restrictions
 * valid for its file scope from these fragments — a lone-concern block
 * would silently erase the others.
 */
const SRC_FILES = ['src/**/*.{ts,svelte}'];

/** Direct Sheet consumers that exist by design (one Sheet.Root lives here). */
const SHEET_INFRA = [
  'src/lib/components/ui/sheet/**',
  'src/lib/components/ui/sidebar/**',
  'src/lib/shell/sheets/**',
  'src/lib/entity-list/sheets/**',
];

/** Composites that own their switch labelling contract. */
const SWITCH_ALLOWLIST = [
  'src/lib/components/config-list/ConfigValueInput.svelte',
  'src/lib/entity-list/sheets/panels/FiltersPanel.svelte',
  'src/lib/components/entity-list-table/panels/PreviewPanel.svelte',
  'src/lib/components/anchor-tabs/anchor-tabs-mode-switch.svelte',
  'src/lib/components/entity-list-table/components/CardViewRenderer.svelte',
  'src/routes/(app)/system/settings/modules/+page.svelte',
];

const VENDOR_BAN = {
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
};

const SHEET_BAN = {
  paths: [
    {
      name: '@primebrick/ui',
      importNames: ['Sheet'],
      message:
        "Do not mount Sheet primitives — there is exactly ONE Sheet.Root (SheetHost). Register a panel in SheetPanelPropsMap + SheetHost and open it via openSheet(). See docs/ai/sheets.md.",
    },
  ],
  patterns: [
    {
      group: ['**/components/ui/sheet', '**/components/ui/sheet/**'],
      message:
        "Do not import ui/sheet directly. Register a panel in SheetPanelPropsMap + SheetHost and open it via openSheet() — panels must wrap content in SheetPanelLayout. See docs/ai/sheets.md.",
    },
  ],
};

const SWITCH_BAN = {
  paths: [
    {
      name: '@primebrick/ui',
      importNames: ['Switch'],
      message:
        'Labelled booleans MUST use SwitchField (switch-first anatomy). Raw Switch is composite-internal only — add to the allowlist only if the file owns its labelling. See docs/ai/form-field-standard.md.',
    },
  ],
};

const CHROME_BAN = {
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
};

const mergeBans = (...bans) => ({
  paths: bans.flatMap((b) => b.paths ?? []),
  patterns: bans.flatMap((b) => b.patterns ?? []),
});

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
     * Wire-value display safety — `extJsonParse` (json-bigint strict) emits
     * null-prototype objects; `String(obj)` throws `Cannot convert object to
     * primitive value` on them. Display coercion of unknown/record values
     * MUST go through `toDisplayString` (@primebrick/ui) — type-aware lint
     * enforces it. `*.svelte*` files inherit type info from the projectService
     * block above; plain `.ts` files get it here.
     */
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.svelte.ts'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-base-to-string': 'error',
    },
  },
  {
    files: ['src/**/*.svelte', 'src/**/*.svelte.ts', 'src/**/*.svelte.js'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'error',
    },
  },
  {
    /**
     * B1 — vendor plane (all src): vendor libraries are consumed ONLY
     * through their sanctioned `@primebrick/ui/vendor/<lib>` subpaths
     * (mirrors core's VENDOR_BLOCKED_PACKAGES: the remote chunk build
     * rejects the same raw imports). Base layer — every later block in
     * this chain re-states these bans plus its own, because the last
     * matching block's options replace (not merge) this rule.
     */
    files: SRC_FILES,
    rules: { 'no-restricted-imports': ['error', mergeBans(VENDOR_BAN)] },
  },
  {
    /**
     * B2 — + sheet ban (all src except sheet infra): every right/left
     * panel goes through `openSheet('<panelId>', props)` and renders
     * inside `SheetPanelLayout`. Direct `ui/sheet` imports or Sheet
     * mounts outside SHEET_INFRA bypass the panel registry, the standard
     * header/layout anatomy, and modal/dirty-state handling — forbidden.
     */
    files: SRC_FILES,
    ignores: SHEET_INFRA,
    rules: {
      'no-restricted-imports': ['error', mergeBans(VENDOR_BAN, SHEET_BAN)],
    },
  },
  {
    /**
     * B3 — sheet infra keeps the switch ban (infra is exempt from the
     * sheet ban only): files inside SHEET_INFRA that are not in
     * SWITCH_ALLOWLIST still cannot import raw Switch.
     */
    files: SHEET_INFRA,
    ignores: SWITCH_ALLOWLIST,
    rules: {
      'no-restricted-imports': ['error', mergeBans(VENDOR_BAN, SWITCH_BAN)],
    },
  },
  {
    /**
     * B4 — + switch ban (all src except sheet infra and the composites
     * that own their labelling): labelled booleans are SwitchField
     * ALWAYS (docs/ai/form-field-standard.md).
     */
    files: SRC_FILES,
    ignores: [...SHEET_INFRA, ...SWITCH_ALLOWLIST],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeBans(VENDOR_BAN, SHEET_BAN, SWITCH_BAN),
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
     * B5 — routes: + page-chrome ban. Page chrome is host-owned and
     * MANDATORY — `AppShell` renders the fixed `PageHeader` above every
     * (app) route. The ONLY opt-out is the route decl's
     * `chrome:'remote'` flag.
     */
    files: ['src/routes/**/*.{ts,svelte}'],
    ignores: SWITCH_ALLOWLIST,
    rules: {
      'no-restricted-imports': [
        'error',
        mergeBans(VENDOR_BAN, SHEET_BAN, SWITCH_BAN, CHROME_BAN),
      ],
    },
  },
  {
    /**
     * B6 — allowlisted routes keep vendor/sheet/chrome bans but own
     * their Switch labelling (SWITCH_ALLOWLIST ∩ routes).
     */
    files: ['src/routes/(app)/system/settings/modules/+page.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeBans(VENDOR_BAN, SHEET_BAN, CHROME_BAN),
      ],
    },
  },
  {
    /**
     * Raw HTML form controls (`<input>`/`<select>`/`<textarea>`) are
     * canonical-component-only — every user-facing field MUST go through
     * the @primebrick/ui wrappers (Input/TextInput/NumericInput,
     * ComboSelect, Textarea…) so chrome, a11y and i18n stay uniform.
     * A bare element was the ScheduleSpecInput drift — construction-time
     * enforcement now. Legit raw elements live ONLY inside primitive
     * wrappers (excluded below) or carry an inline
     * `<!-- eslint-disable-next-line no-restricted-syntax -->` with reason.
     */
    files: ['src/**/*.svelte'],
    ignores: [
      // Canonical primitive wrappers — the raw element IS their job.
      'src/lib/components/ui/smart-regex-input/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "SvelteElement[name.name='input'], SvelteElement[name.name='select'], SvelteElement[name.name='textarea']",
          message:
            'Raw HTML controls are forbidden — use the canonical components (@primebrick/ui Input/TextInput/NumericInput, ComboSelect, Textarea…). Exempt only primitive wrappers. See docs/ai/form-field-standard.md.',
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
      '**/*.config.{js,ts}',
      'scripts/**',
      'src/lib/__tests__/**',
      'static/vendor/**',
      '**/*.bak.*',
    ],
  },
);
