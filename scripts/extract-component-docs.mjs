#!/usr/bin/env node
/**
 * Extract documentation data from Svelte 5 components using sveld.
 * sveld bundles its own Svelte 5 compiler — no TypeScript version dependency.
 * Supports $props(), $bindable(), Snippet, callback props, $state, $derived.
 *
 * Usage: node scripts/extract-component-docs.mjs
 * Output: docs/user-guide/_extracted/components.json
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const COMPONENTS_DIR = join(projectRoot, 'src', 'lib', 'components');
const OUTPUT_DIR = join(projectRoot, 'docs', 'user-guide', '_extracted');
const OUTPUT_FILE = join(OUTPUT_DIR, 'components.json');

/**
 * Recursively find all .svelte files in a directory.
 */
function findSvelteFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findSvelteFiles(fullPath, files);
    } else if (entry.endsWith('.svelte')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log('=== Svelte component docs extraction (sveld) ===');

  let ComponentParser;
  try {
    const sveld = await import('sveld');
    ComponentParser = sveld.ComponentParser;
  } catch (err) {
    console.error('Failed to import sveld. Is it installed?');
    console.error('Run: pnpm add -D sveld@0.36.0');
    console.error('Error:', err.message);
    process.exit(1);
  }

  if (!existsSync(COMPONENTS_DIR)) {
    console.error(`Components directory not found: ${COMPONENTS_DIR}`);
    process.exit(1);
  }

  const svelteFiles = findSvelteFiles(COMPONENTS_DIR);
  console.log(`Found ${svelteFiles.length} .svelte files in src/lib/components/`);

  const results = [];

  for (const filePath of svelteFiles) {
    const relPath = relative(projectRoot, filePath).replace(/\\/g, '/');
    const componentName = relPath.split('/').pop().replace('.svelte', '');
    try {
      const source = readFileSync(filePath, 'utf-8');
      const parser = new ComponentParser();
      const documented = parser.parseSvelteComponent(source, { filePath: relPath });
      results.push({
        file: relPath,
        component: componentName,
        data: documented,
      });
    } catch (err) {
      console.warn(`  Warning: failed to parse ${relPath}: ${err.message}`);
      results.push({
        file: relPath,
        component: componentName,
        error: err.message,
      });
    }
  }

  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nExtracted: ${successCount} success, ${errorCount} errors out of ${results.length} components`);
  console.log(`Wrote to ${relative(projectRoot, OUTPUT_FILE)}`);
  console.log('=== Extraction complete ===');
}

main().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
