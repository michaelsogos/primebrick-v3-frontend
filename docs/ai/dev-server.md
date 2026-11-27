# Dev server & process lifecycle (agent-owned)

> Audience: AI agents and developers running this repo locally.
> `.devin/rules/dev-server.md` is a pointer to this page — this is the
> canonical text.

## Golden rules

1. **The agent owns the dev-server lifecycle** — start, stop, restart are
   autonomous operations, no ask-first (supersedes the old "user must
   confirm" policy).
2. **A process that is provably user-started is NEVER killed** without
   explicit user permission — and "not user-started" must be PROVEN
   empirically (see step 3), never assumed from "the port is busy" or
   "I didn't start it".
3. **Never duplicate, never migrate**: no second server on the same port,
   no "just use a different port". If the port is taken, resolve the owner.
4. **The stack must survive the turn**: BE, FE, job-handler and CRM stay
   running across agent turns — a service started inside an agent shell
   dies with the session, so services MUST be started **detached** via
   `primebrick-workspace/scripts/dev-stack.ps1` (delegates to
   `dev-stack.mjs` — genuinely idempotent: per-service state files in
   `temp/dev/<name>.json`, serialized lock, process-TREE kill via
   `taskkill /T`, `status`/`stop`/`restart`/`reap` subcommands;
   `reap` kills untracked primebrick dev processes — zombies — while a
   chain that reaches an IDE terminal is classified USER-STARTED and
   never touched. Logs to `temp/logs/` at the multi-repo checkout root
   (`D:\git\primebrick\temp\logs\` — NOT under primebrick-workspace). If a
   turn finds a service down, restart it detached — never leave the only
   copy of the stack inside an ephemeral shell.
5. **Releases and branch churn kill the stack — restart it after**:
   checkouts, merges and release flows rewrite source files under
   running `bun --hot`/tsx watchers; watch-mode services crash
   mid-operation and stay down (`dev-hot` prints "edit a file to
   restart" and respawns only on a *lib* `src/` change). After any
   release, merge or branch-close operation, re-run `dev-stack.ps1`
   and verify the stack ports answer — the stack MUST be alive when
   the turn ends.

## Default ports

| Service | Port | Start command |
|---------|------|---------------|
| This repo (Frontend) | 5173 | `pnpm run dev` |
| Backend | 3001 | `pnpm run dev` in `primebrick-be-v3` |
| job-handler | 3006 | `pnpm run dev` in `primebrick-us-v3/job-handler` |
| crm | 3007 | `pnpm run dev` in `primebrick-us-v3/crm` |
| (other microservices) | 3003–3005 | `bun --hot src/index.ts` in each `primebrick-us-v3/<service>` |

**One-shot detached start** (idempotent — skips ports already listening):
`powershell -ExecutionPolicy Bypass -File primebrick-workspace/scripts/dev-stack.ps1`

## Launch context (Windows) — Git Bash chain REQUIRED

`dev-stack.ps1` MUST be launched from a shell chain that carries Git
`usr/bin` in PATH — agent exec shells (Git Bash) qualify, pure
PowerShell/cmd does NOT.

Why: headed windows pipe service output through `tee.exe` for raw UTF-8
logs. `tee.exe` exists ONLY in `C:\Program Files\Git\usr\bin`, which is in
neither the user nor the machine PATH. Git Bash prepends `/usr/bin` and
MSYS2 converts it for every Windows child process, so the chain
bash → powershell → node → cmd → service window inherits it.

Since 2026-11-27 `dev-stack.mjs` probes tee before any spawn (`ensureTee`:
PATH first, then the well-known Git path prepended to its own PATH so
every window inherits it) and fails fast with a clear error if neither
resolves — no more doomed windows. Failure mode being prevented: each
window dies instantly with "tee.exe non riconosciuto" then hangs at
Read-Host; dev-stack waits the full 30s port timeout per service — it
looks like a slow boot, it is instant death.

## Procedure — before starting or touching a server

1. **Check the port** (Windows):
   `netstat -ano | findstr "LISTENING" | findstr ":<port>"`
2. **Port free** → start the server yourself (background shell, keep the
   `shell_id`; if you started it only to verify something, stop it when done).
3. **Port busy** → identify the owner empirically:
   ```powershell
   Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>' |
     Select-Object ProcessId, ParentProcessId, CommandLine | Format-List
   ```
   Then walk the **parent chain** — repeat the query on `ParentProcessId`
   until the root. Classify:
   - **User-started** — the chain reaches a terminal under the IDE
     (`Code.exe` / `Windsurf.exe` / `Devin.exe` → `conhost.exe` →
     `powershell`/`cmd`) or a user shell: **reuse the server** (HMR/watch
     already has the latest code). Do NOT kill it, do NOT duplicate it.
     If you need its stdout/stderr, check the IDE's open terminals; if you
     can't reach them, ASK for access to the running terminal — do not
     restart.
   - **Orphan** — the chain is broken or ends in a detached process with no
     live terminal ancestor (leftover agent shell, dead IDE session):
     agent-owned. You may kill it and restart on the SAME port.
4. **Wrong-app conflict** — the port is held by a process that is NOT this
   project: same owner test. User-started → ask which project owns the
   port; orphan → kill or escalate. Never silently steal a port.

## After dependency-graph changes

`pnpm install`, `workspace:*` relinks, or new vendored packages → delete
`node_modules/.vite` and restart the dev server. The optimizer cache does
NOT self-heal; stale-cache symptoms look like product bugs but are not.
Signature: `SyntaxError: ... does not provide an export named 'X'` in the
browser while `svelte-check`/`tsc` are green — verify by curling the served
`/@fs/` URL, not by trusting the checks.

Installs run at the **workspace root**, never inside a single repo dir
(every member must re-resolve consistently). `@primebrick/*` inter-repo
deps MUST be `workspace:*` — plain semver resolves from npm and silently
replaces the link with a stale published copy.

## Vendor-plane build gating

`pnpm run dev` runs `vendor/vendor-ensure.mjs` before `vite dev`: it
hashes the vendor build's real inputs (vendor config + entries, ui's
`vendor-map.json`, `package.json` + `pnpm-lock.yaml`, and a
relpath:size:mtime fingerprint of the `dist/` trees of `@primebrick/ui`
and `@primebrick/core` — the vendor build resolves workspace packages
through their dist) and **skips the ~20s build when nothing changed**
(~0.1s). The mechanism, outputs, and manifest handshake are untouched —
the stamp in `static/vendor/.stamp` only gates WHEN the build runs.

Force a full rebuild anytime with `pnpm vendor:build`. If the stamp
ever misfires (bundle stale while inputs look equal), that is a bug in
the input list — report it, and extend the hash inputs in
`vendor-ensure.mjs` rather than deleting the gate.

## E2E note

Playwright specs (`src/e2e/`) connect to an already-running stack —
`globalSetup` asserts reachability and aborts; the config deliberately has
no `webServer` block. Start the stack (this procedure), then run
`pnpm run test:e2e`.
