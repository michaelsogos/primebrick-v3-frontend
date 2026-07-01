---
trigger: always_on
---

# Devin Rule: Dev Server Management

## Trigger
- Applies whenever an AI agent is about to start a dev server for this project.

## Actions
Before starting any dev server, ALWAYS check first whether one is already running
for this project. Never take the initiative to start a new dev server on a new
port, and NEVER kill a PID that is holding the port this project normally uses.

Procedure to follow before starting a dev server:

1. Check the listening ports for this project's default dev port
   (Frontend: **5173**). On Windows:
   `netstat -ano | findstr "LISTENING" | findstr ":5173"`
2. If a process is already listening on that port, resolve the PID to its
   command line to confirm it belongs to THIS project:
   `powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>' | Select-Object ProcessId, CommandLine | Format-List"`
3. If the PID belongs to this project's dev server:
   - DO NOT start a new dev server.
   - DO NOT kill the existing process.
   - Reuse it. The dev server already has the latest code via HMR (Vite).
4. If you need stdout/stderr output from that dev server:
   - First check whether the terminal running it is visible in the IDE
     (look for open terminals in the IDE before spawning your own).
   - If you cannot access it, ASK the user to give you access to the
     terminal that is already running, instead of restarting the server.
5. Only start a new dev server if:
   - No process is listening on the default port, AND
   - The user has confirmed it is OK to start one.

## Enforcement
- AI agent MUST check port 5173 before running `pnpm run dev`.
- AI agent MUST NOT kill a PID holding port 5173 without explicit user instruction.
- AI agent MUST NOT start a second `pnpm run dev` instance (port conflict).
- If the agent started `pnpm run dev` only to verify something, it MUST stop it
  when done. The user's dev server must never be killed without asking.
