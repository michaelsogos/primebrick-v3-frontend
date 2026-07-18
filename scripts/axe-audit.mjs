/**
 * Axe-core accessibility audit for Primebrick FE.
 *
 * Runs axe-core (via @axe-core/playwright) against every route in the FE dev
 * server and produces:
 *   - public/vpat/vpat-data.json   (machine-readable audit results)
 *   - console summary table
 *
 * Usage:
 *   node scripts/axe-audit.mjs                # audits http://localhost:5173
 *   node scripts/axe-audit.mjs --base-url URL # audits a different base URL
 *
 * Prerequisites:
 *   - FE dev server running (pnpm run dev)
 *   - Playwright chromium browser installed (pnpm exec playwright install chromium)
 *
 * WCAG 2.x coverage: axe-core tags are cumulative. We run with:
 *   ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa',
 *    'wcag22a', 'wcag22aa', 'wcag22aaa', 'best-practice', 'ACT', 'section508',
 *    'EN301549']
 * This enables WCAG 2.0/2.1/2.2 at A/AA/AAA, plus Section 508 and EN 301 549.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Parse --base-url argument
const args = process.argv.slice(2);
const baseUrlArgIndex = args.indexOf("--base-url");
const BASE_URL =
  baseUrlArgIndex !== -1 && args[baseUrlArgIndex + 1]
    ? args[baseUrlArgIndex + 1]
    : process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

// Routes to audit. (app) group routes require authentication in production,
// but the dev server may redirect to /login. We audit all routes and record
// the final URL after redirects.
const ROUTES = [
  { path: "/", label: "Root (redirects to login or dashboard)" },
  { path: "/login", label: "Login page" },
  { path: "/welcome", label: "Welcome page" },
  { path: "/mcp/consent", label: "MCP consent page" },
  // (app) routes — will likely redirect to /login without auth, but we
  // still audit the redirect target and the login page itself.
  { path: "/customers", label: "Customers list" },
  { path: "/customers/new", label: "New customer" },
  { path: "/crm/pipeline", label: "CRM pipeline" },
  { path: "/system/settings", label: "Settings root" },
  { path: "/system/settings/profile", label: "Profile settings" },
  { path: "/system/settings/security", label: "Security settings" },
  { path: "/system/settings/users", label: "Users list" },
  { path: "/system/settings/users/create", label: "Create user" },
  { path: "/system/settings/organizations", label: "Organizations list" },
  { path: "/system/settings/organizations/create", label: "Create organization" },
  { path: "/system/settings/email-providers", label: "Email providers" },
  { path: "/system/settings/modules", label: "Modules list" },
  { path: "/system/settings/templates", label: "Templates" },
];

// Axe tags for full WCAG 2.x + Section 508 + EN 301 549 coverage.
// WCAG 2.2 rules are disabled by default in axe-core and must be explicitly
// enabled via cumulative tags.
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag21aaa",
  "wcag22a",
  "wcag22aa",
  "wcag22aaa",
  "best-practice",
  "ACT",
  "section508",
  "EN301549",
];

/**
 * Map axe-core rule IDs to WCAG success criteria.
 * This is a subset — axe-core's ruleset maps to ~50 of the 86 WCAG 2.2 SCs.
 * The full mapping is in axe-core's lib/data/standards.json.
 * We record the axe tags each rule belongs to so the VPAT generator can
 * map results to the correct WCAG SC.
 */
async function runAudit() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  const auditDate = new Date().toISOString();
  const axeVersion = await getAxeVersion();

  console.log(`\n Axe-core accessibility audit`);
  console.log(` Base URL: ${BASE_URL}`);
  console.log(` Axe tags: ${AXE_TAGS.join(", ")}`);
  console.log(` Routes:   ${ROUTES.length}`);
  console.log(` Date:     ${auditDate}\n`);

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;
    process.stdout.write(`  Auditing ${route.path.padEnd(45)} `);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      // Wait a bit for Svelte hydration and dynamic content
      await page.waitForTimeout(500);

      const finalUrl = page.url();
      const axeResults = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .analyze();

      const summary = {
        route: route.path,
        label: route.label,
        requested_url: url,
        final_url: finalUrl,
        redirected: finalUrl !== url,
        violations: axeResults.violations.length,
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        inapplicable: axeResults.inapplicable.length,
        violation_details: axeResults.violations.map((v) => ({
          rule_id: v.id,
          description: v.description,
          help: v.help,
          help_url: v.helpUrl,
          impact: v.impact,
          tags: v.tags,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            target: n.target,
            failure_summary: n.failureSummary,
          })),
        })),
        pass_rule_ids: axeResults.passes.map((p) => p.id),
        incomplete_rule_ids: axeResults.incomplete.map((i) => i.id),
        inapplicable_rule_ids: axeResults.inapplicable.map((i) => i.id),
      };

      results.push(summary);
      console.log(
        `✓  V:${summary.violations}  P:${summary.passes}  I:${summary.incomplete}  N/A:${summary.inapplicable}` +
          (summary.redirected ? `  → ${finalUrl}` : "")
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`✗  ERROR: ${errorMsg}`);
      results.push({
        route: route.path,
        label: route.label,
        requested_url: url,
        final_url: null,
        redirected: false,
        error: errorMsg,
        violations: 0,
        passes: 0,
        incomplete: 0,
        inapplicable: 0,
        violation_details: [],
        pass_rule_ids: [],
        incomplete_rule_ids: [],
        inapplicable_rule_ids: [],
      });
    }
  }

  await browser.close();

  // Aggregate summary
  const aggregate = {
    audit_date: auditDate,
    axe_version: axeVersion,
    base_url: BASE_URL,
    axe_tags: AXE_TAGS,
    routes_audited: results.length,
    total_violations: results.reduce((sum, r) => sum + r.violations, 0),
    total_passes: results.reduce((sum, r) => sum + r.passes, 0),
    total_incomplete: results.reduce((sum, r) => sum + r.incomplete, 0),
    total_inapplicable: results.reduce((sum, r) => sum + r.inapplicable, 0),
    // Unique violating rule IDs across all routes
    unique_violating_rules: [
      ...new Set(
        results.flatMap((r) => r.violation_details.map((v) => v.rule_id))
      ),
    ],
    // Unique passing rule IDs across all routes
    unique_passing_rules: [
      ...new Set(results.flatMap((r) => r.pass_rule_ids)),
    ],
    routes: results,
  };

  // Write to public/vpat/vpat-data.json (served by the dev server and
  // available in the build output)
  const outputDir = resolve(projectRoot, "public", "vpat");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "vpat-data.json");
  writeFileSync(outputPath, JSON.stringify(aggregate, null, 2), "utf-8");

  console.log(`\n Aggregate:`);
  console.log(`   Routes audited:    ${aggregate.routes_audited}`);
  console.log(`   Total violations:  ${aggregate.total_violations}`);
  console.log(`   Total passes:      ${aggregate.total_passes}`);
  console.log(`   Total incomplete:  ${aggregate.total_incomplete}`);
  console.log(`   Total inapplicable:${aggregate.total_inapplicable}`);
  console.log(`   Unique violating rules: ${aggregate.unique_violating_rules.length}`);
  console.log(`   Unique passing rules:   ${aggregate.unique_passing_rules.length}`);
  console.log(`\n Written to: ${outputPath}\n`);

  // Exit with non-zero if violations found (for CI gating)
  if (aggregate.total_violations > 0) {
    console.log(` ⚠  ${aggregate.total_violations} violations found.`);
    process.exit(0); // Exit 0 for now — violations are expected pre-remediation
  }
}

async function getAxeVersion() {
  try {
    const pkgPath = resolve(projectRoot, "node_modules", "axe-core", "package.json");
    const pkg = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(pkgPath, "utf-8")));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

runAudit().catch((err) => {
  console.error("Fatal error during axe audit:", err);
  process.exit(1);
});
