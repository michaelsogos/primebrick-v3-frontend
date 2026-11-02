# Pre-Implementation Anatomy Protocol (UI surfaces)

**Applies to:** every page, component, archetype, or form surface an agent
implements or modifies — host pages, remote module pages, shared controls.

This protocol exists because every recurring anatomy regression (missing
breadcrumb, dropped clear CTA, overlapped trailing icons, unspaced footer
CTAs, undersized JSON editors, tests asserting implementation intent) has
the same root cause: **implementation from memory instead of from the
canonical reference consumer and the component's own contract.** Good
intentions are not enforcement — these gates are mandatory and sequential.

## Gate 1 — REFERENCE LOCK

Before writing code, declare the **canonical reference consumer** in the
plan (e.g. `system/settings/configurations/create` for entity forms,
`system/settings/users` for list+create pages). Produce an **anatomy
inventory** of it: snippets used, props passed, variants, spacing classes,
testids, `{...props}` wiring, icon allocation, footer anatomy. Review the
new code as **diff vs inventory** — never vs memory.

## Gate 2 — CONTRACT READ

For every imported `@primebrick/ui` or `$lib` shared component: read its
docstring header and props **in the file itself** and cite the usage
constraints that apply (e.g. `TextInput.trailing` two-CTA slot contract,
`JsonEditor.minRows`/`maxHeight`, `ComboSelect display="detailed"`). If a
contract is documented in the component's docstring, not reading it is a
violation, not an oversight.

## Gate 3 — ALLOCATION CHECK

- Every new Lucide icon → grep the codebase for existing usage of that
  icon and of the slot it will occupy. Icon imports go through
  `@primebrick/ui/vendor/lucide` — never raw `@lucide/*`.
- Every new i18n key → grep the namespace for collisions and confirm the
  key lands in the owning module's translations.
- Every new testid → follow `e2e-testid-convention.md`.
Attach results to the plan.

## Gate 4 — E2E = PRODUCT CONTRACT

Specs assert **platform behavior**, never implementation intent:

- Create/edit CTAs open a NEW TAB — assert via
  `context.waitForEvent("page")` + popup URL + parent URL unchanged.
- Page anatomy is asserted (breadcrumb visible, clear CTA, footer spacing,
  tooltip triggers where meta declares them).
- Unexpected dialogs FAIL the test — collecting `page.on("dialog")` and
  asserting zero after the flow; an accepted `confirm()` that hides a
  tainted-guard regression makes the spec worthless.
- Cleanup deletes only the rows it created; residue is verified at the end.

## Gate 5 — VISUAL GATE

Before declaring a UI surface "done": take a Playwright screenshot and
diff the rendered anatomy against the reference page. A green testid is
not evidence — the rendered page is.

## Gate 6 — DONE = SIGNED CHECKLIST

A UI task closes only when the plan/checklist records: reference consumer
named, anatomy inventory produced, component contracts read, icon/i18n
allocations checked, product-contract E2E written, screenshot reviewed.
