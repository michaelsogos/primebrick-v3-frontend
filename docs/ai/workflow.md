# Devin Workflow Rule: Tic-Toc Planning

> Canonical body of `.devin/rules/workflow.md` — the rule file is a pointer to this page.

## Trigger
- Applies automatically at the start of any new session.
- Triggered whenever a new feature, refactor, debt management, or bugfix is requested.

## Re-read obligation — every turn, not once per session

This file MUST be re-read whenever the agent is called to ANALYZE, PLAN,
or CODE — not once at session start. Memory of it decays inside a long
session; "I already read it" is not compliance. This is a mechanical
obligation, not a suggestion: a turn that analyzes, plans, or codes
without a fresh read of this document is a protocol violation.

## Documentation deep-dive — MANDATORY gate before TIC and TOC

No phase ever starts on memory or code examples alone. Before entering
EITHER phase the agent MUST run a thorough documentation pass across
**every repo the task's domain touches** — `AGENTS.md`, `.devin/rules/*`,
`docs/ai/*`, `docs/dev-guide/*` in each of them. Docs are the contract;
source code is only the proof.

**Doc first, code second — order is not negotiable.** "Docs are the
contract, code is the proof" means the doc provides the correct
high-level view FIRST and code is then read to deepen, verify, and
complete it. The two interpenetrate — the doc states intent, code
proves behavior — but the entry point is always the doc, never the
code. Starting from source and inferring the contract backwards
produces drift: neighboring code that disagrees with the doc is a bug
or a debt, never documentation.


- **Before TIC** (Analysis Phase → plan file): map the task's domain to
  the repos it concerns, read the relevant rules and canonical docs in
  each of them, and cite the doc findings in the plan — file paths,
  never memory.
- **Before TOC** (execution after `PROCEED`): re-read the docs governing
  the areas the plan touches — they are the authority the change must
  satisfy, and they may have changed since planning. A doc-vs-plan
  conflict stops execution and goes back to the user; it is never
  resolved silently.

Skipping this gate is a protocol violation — wrong locale codes, wrong
icon vocabulary and anatomy drift all trace back to skipped doc reads.

## Doubt protocol — docs first, user second, never guess

Whenever the agent is uncertain — about a requirement, a contract, a
convention, a vocabulary choice, an expected behavior — at ANY point of
ANY turn and for ANY judgment call, the resolution order is fixed:

1. **Search the docs.** `AGENTS.md`, `.devin/rules/*`, `docs/ai/*`,
   `docs/dev-guide/*` in every repo the doubt touches. Most doubts are
   already settled there.
2. **If the docs do not answer deterministically, ask the user.** When
   two readings are both defensible — colors, vocabulary, ordering, UX
   semantics — the user picks, not the agent. A judgment call resolved
   silently is a drift vector.
3. **Guessing is the violation.** The protocol is "search → ask", never
   "guess and fix later". An unverified assumption that ships costs
   more than a question asked.

## Non-negotiables

- **Never offer a drift fallback.** When presenting options, never
  include a path that bypasses the governed contract — a parallel
  scheduler, a hidden channel, a local workaround. If the governed
  path is blocked, the contingency is unblocking the block, never a
  parallel mechanism. Presenting drift as a choice legitimizes it.
- **Code precedent never overrides a rule.** If neighboring code
  violates a rule, the rule wins — the neighbor is debt, not
  precedent. Copying a violation because "the sibling file does it"
  is how debt propagates; flag the neighbor, follow the contract.

## Actions
1. **Analysis Phase**: Analyze the codebase to fully understand the requirements, but **DO NOT modify any source code files** during this phase.
2. **File Creation**: Automatically generate a new Markdown plan file inside the directory `d:\git\primebrick\primebrick-workspace\ai-plans\`. You are free to decide the file name based on the task context (e.g., `feature-xyz-plan.md` or `bugfix-abc-plan.md`). Ensure the file uses the `.md` extension. When in plan mode please use sub-agents to create the plan file.
3. **Plan Generation**: Write a detailed, structural action plan inside this generated Markdown file. Include objectives, impacted files, architectural changes, and precise acceptance criteria; with code examples.
4. **MANDATORY BLOCKER**: Once the file is saved, output this exact message in the chat: *"Planning complete. I have created the plan file inside your ai-plans folder. Awaiting approval."* 
5. **HALT EXECUTION**: Stop immediately. **DO NOT** execute any coding, terminal commands, or subagents until the user explicitly sends the keyword: **"PROCEED"**.

## TIC is empirical — every gap surfaced in the plan, nothing deferred to TOC

The purpose of the Analysis Phase is to discover **every** gap the task
touches — empirically, not by assumption. If a question can be answered
by running code, querying a database, reading a file, or executing an
E2E probe, it MUST be answered inside TIC and the evidence recorded in
the plan file. "We will find out during execution" is a protocol
violation: an analysis deferred to TOC is a gap that ships unverified.

- **Censuses belong to TIC** — inventories of call sites, violations,
  consumers, affected tables/routes are produced during analysis and
  land verbatim in the plan file (counts + file:line evidence), never
  as a TODO for the executor.
- **Pseudo-code and snippets belong to TIC** — the intended change is
  sketched in the plan precisely enough that TOC is transcription, not
  design.
- **Empirical probes belong to TIC** — and per "Tests are deliverables",
  a probe written to answer an analysis question is written as the final
  spec from the start, in its canonical location, never as a throwaway
  script. The E2E that proves a gap exists stays as the regression test.
- **TOC contains zero discovery work** — no censuses left "to be done",
  no "figure out how X works", no "decide based on what we find". Open
  questions at plan time are resolved via the doubt protocol
  (docs -> user), never parked inside the plan.

## Tests are deliverables — final specs from the first write

Every behavioral verification written during a task MUST land as a
final, persistent test in its canonical location — the first draft is
already the deliverable and is refined incrementally; it is never a
throwaway probe deleted after it passes.

- Writing the same check twice — a temporary script now, the real
  spec later — is forbidden wasted work.
- A deleted probe deletes its proof: any behavior only ever verified
  by a temporary file counts as UNVERIFIED until the persistent spec
  exists.
- Exploratory checks run inside the final spec while it is developed,
  never in scratch files; assertions sharpen as evidence arrives.

## Dev stack persistence — every turn

BE, FE, job-handler and CRM MUST stay running across turns and session
restarts: start them detached via
`primebrick-workspace/scripts/dev-stack.ps1`, never inside an ephemeral
agent shell (a shell-owned server dies with the session). If a turn
finds a service down, restart it detached. Full lifecycle rules:
[`docs/ai/dev-server.md`](./dev-server.md).
