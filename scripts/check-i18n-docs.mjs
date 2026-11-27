// i18n doc family enforcement — permanent standards gate.
// Every canonical translations doc in THIS repo must carry:
//   1. the never-deferred doctrine ("all seven supported languages" + "never deferred")
//   2. a "## Related documents" section mapping the family
// Self-configuring: scans docs/ recursively for known family filenames (generated/ excluded).
// Usage: node check-i18n-docs.mjs [docsRootOverride]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = process.argv[2] ?? join(repoRoot, "docs");
const FAMILY = new Set([
  "i18n.md", "i18n.mdx", "i18n-translation-sources.md", "translation-key-convention.md",
  "i18n-namespace-segregation.md", "translations-cache-invalidation.md", "translations.mdx",
]);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!p.includes("generated")) out.push(...walk(p)); }
    else if (FAMILY.has(e.name)) out.push(p);
  }
  return out;
}

if (!existsSync(docsRoot)) { console.log("check-i18n-docs: no docs/ — skip"); process.exit(0); }
const files = walk(docsRoot);
if (!files.length) { console.log("check-i18n-docs: no family docs in this repo — skip"); process.exit(0); }

let fail = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const doctrine = text.includes("all seven supported languages") && /never deferred/i.test(text);
  const section = /## Related documents/i.test(text);
  const ok = doctrine && section;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${f.slice(f.indexOf("docs"))} — doctrine:${doctrine} related:${section}`);
}
if (fail) { console.error(`check-i18n-docs: ${fail} doc(s) violate the i18n family contract`); process.exit(1); }
console.log(`check-i18n-docs: ${files.length} family doc(s) compliant`);
