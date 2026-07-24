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
