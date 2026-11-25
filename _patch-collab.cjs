const fs = require("fs");
const f = "src/lib/collaboration/useCollaborativeForm.svelte.ts";
let src = fs.readFileSync(f, "utf8");
const orig = src;
const crlf = src.includes("\r\n");
// normalize anchors to file line-endings
const E = crlf ? "\r\n" : "\n";
const norm = (s) => s.replace(/\n/g, E);

const subs = [
  [
    "\tdelta: Record<string, { old: unknown; new: unknown }>;\n\tchanged_by: string;\n\tchanged_by_display_name?: string | null;\n\tversion: number;",
    "\tdelta: Record<string, { old: unknown; new: unknown }>;\n\tchanged_by: string;\n\tchanged_by_display_name?: string | null;\n\tversion: bigint;",
    "AuditPageRow",
  ],
  [
    "\tgetRecordVersion: () => number | bigint;\n\tsetRecordVersion: (v: number | bigint) => void;",
    "\tgetRecordVersion: () => bigint;\n\tsetRecordVersion: (v: bigint) => void;",
    "opts types",
  ],
  [
    "\t\tif (marker.entity_uuid !== opts.uuid) return;\n\t\t// Self-save echo — the PUT response already realigned the version.\n\t\tif (Number(marker.version) <= Number(opts.getRecordVersion())) return;",
    "\t\tif (marker.entity_uuid !== opts.uuid) return;\n\t\t// Self-save echo — the PUT response already realigned the version.\n\t\t// (core types the marker `number` — wire reality is bigint: the\n\t\t//  extraction enforces the consumer-side invariant, and a genuine\n\t\t//  number here traces in dev — see wire-version.ts.)\n\t\tconst markerVersion = wireVersion(marker.version, `collab marker for '${opts.entity}'`);\n\t\tif (markerVersion <= opts.getRecordVersion()) return;",
    "comparison",
  ],
  [
    "\t\topts.setRecordVersion(marker.version);",
    "\t\topts.setRecordVersion(markerVersion);",
    "setRecordVersion",
  ],
  [
    "\t\tif (\n\t\t\ttypeof fresh.version === 'number' ||\n\t\t\ttypeof fresh.version === 'bigint'\n\t\t) {\n\t\t\topts.setRecordVersion(fresh.version);\n\t\t}",
    "\t\tif (fresh.version !== undefined && fresh.version !== null) {\n\t\t\topts.setRecordVersion(wireVersion(fresh.version, `conflict refetch for '${opts.entity}'`));\n\t\t}",
    "refetch",
  ],
];

const missing = [];
for (const [from, to, label] of subs) {
  const a = norm(from);
  if (!src.includes(a)) { missing.push(label); continue; }
  src = src.replace(a, norm(to));
}

if (!src.includes("wire-version") && !missing.length) {
  const imp = /import \{ apiFetchExt, extJsonStringify \} from '\$lib\/api-ext';/;
  src = src.replace(imp, "import { apiFetchExt, extJsonStringify } from '$lib/api-ext';" + E + "import { wireVersion } from '$lib/entity-form/wire-version';");
}
if (missing.length) { console.error("missing:", missing.join(", ")); process.exit(1); }
if (src === orig) { console.error("NO CHANGES"); process.exit(1); }
fs.writeFileSync(f, src);
console.log("collab patched — all sites, crlf preserved:", crlf);
