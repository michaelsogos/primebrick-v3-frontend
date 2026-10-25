# Enforcement over verification — E2E is never the guard

E2E (and unit tests in general) are *executable* checks — they can be
skipped, flaky, environment-blocked, or simply not run. They are the
**second net**: they prove a gate works. They must never BE the gate.

When a behavior is wrong/illegal/unwanted, the default design answer is a
**construction-time or lint-time enforcement**, in descending preference:

1. **Make it unrepresentable** — types/closed unions/builders that cannot
   express the bad shape (e.g. `entityPaths` generates create/detail
   routes; nobody writes `…/new` by hand).
2. **Validate at a mandatory checkpoint** — enrollment/registration/boot
   gates that reject invalid input before it reaches the system (e.g.
   `validateNavDeclaration` at `service.register`; route-factory branding
   at `createMicroservice` boot).
3. **Lint / check-standards rule** — `pnpm check:standards` or eslint rule
   that greps the forbidden pattern and fails CI (e.g. i18n-key-ns checks).
4. **Compile-time error** — `tsc`/`svelte-check` failure on misuse.

Tests and E2E come AFTER all of the above, as regression proof that the
gate itself still works. If a plan proposes "tests will catch it" as the
primary mechanism, the plan is incomplete: find the code/lint/typing hook
that makes the bad state impossible first.

A skippable check is not enforcement — a violation that only fails under a
suite that may not run is a convention, not a gate.
