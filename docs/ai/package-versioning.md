# Devin Rule: Fixed Package Versions (No Ranges)

> Canonical body of `.devin/rules/package-versioning.md` — the rule file is a pointer to this page.

## Trigger
- Applies to ALL `package.json` files in this repository.
- Applies whenever a package is added, updated, or its version is modified.

## Rule

### All package versions MUST be pinned to exact versions.

- **ALLOWED**: `"typescript": "5.9.3"` — exact, no prefix.
- **FORBIDDEN**: `"typescript": "^5.9.3"` — caret range.
- **FORBIDDEN**: `"typescript": "~5.9.3"` — tilde range.
- **FORBIDDEN**: `"typescript": ">=5.9.3"` — unbounded range.
- **FORBIDDEN**: `"typescript": "latest"` — floating tag.
- **FORBIDDEN**: `"typescript": "*"` — wildcard.

### Why

1. **Certification (MANDATORY rationale)**: the dependency set in
   `package.json` is the exact set this code was developed, reviewed, and
   tested against — it is CERTIFIED to work with it. An unapproved patch or
   minor release can still introduce behavior or breaking changes; ranges
   let uncertified code in silently. We do not accept that.
2. **Reproducibility**: every dev machine, CI build, and production release
   gets the exact same dependency tree that was certified. A rebuild during
   a prod release cannot accidentally pull a newer patch that wasn't tested.
3. **Controlled upgrades**: upgrading a dependency is a deliberate act —
   performed in periodic `pnpm outdated` review sessions, each bump is
   re-verified (tests + any needed code adaptation) before it lands. Never
   implicit, never silent.

### Exceptions

- **`workspace:*`** and **`file:../...`** protocols are allowed for internal
  monorepo packages (e.g. `"@primebrick/dal-pg": "workspace:*"`). These are
  not registry packages and their version is determined by the local
  workspace, not by semver resolution.
- **`catalog:`** protocol is allowed if the workspace uses pnpm catalogs
  (the catalog itself must pin exact versions).

### Upgrade Procedure

When upgrading a package version:

1. Run `pnpm view <package> version` to get the latest absolute version.
2. Run `pnpm view <package>@<current-major> version` to get the latest
   version within the current major (safe patch/minor).
3. Decide which version to pin:
   - **Patch/minor within current major**: safe, no breaking changes.
   - **Major bump**: requires dedicated testing session — never do it
     silently as part of another task.
4. Set the exact version in `package.json` (no `^`, `~`, or other prefix).
5. Run `pnpm install` to update the lockfile.
6. Run the project's test suite to verify the upgrade didn't break anything.

### Enforcement

- AI agent MUST NOT add `^`, `~`, `>=`, `*`, or `latest` prefixes to any
  registry package version in `package.json`.
- AI agent MUST pin exact versions when adding new dependencies.
- AI agent MUST NOT change a pinned version to a range as a "quick fix"
  for a resolution conflict.
- When reviewing PRs, flag any range-prefixed versions as violations.
