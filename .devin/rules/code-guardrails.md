---
trigger: always_on
---
# Code Execution Guardrails

## Linting & Compilation Errors
1. **Max Retry Limit**: If a terminal command, linter, or test fails, you are allowed a maximum of **2 self-correction attempts** to fix the issue.
2. **Halt on Failure**: If the lint or compilation error persists after the 2nd attempt, **STOP ALL OPERATIONS IMMEDIATELY**. Do not hallucinate massive code changes.
3. **Kanban State**: Set the current session state to **BLOCKED** in the Agent Command Center / Kanban board.
4. **User Escalation**: Report the error logs in the chat and wait for user guidance.

## Architectural Constraints
1. **Scope Locking**: Do not alter existing function signatures, API endpoints, or shared state structures unless explicitly authorized in the approved Markdown plan.
2. **Atomic Commits/Changes**: Apply changes iteratively. Run the linter or local tests after modifying single modules rather than editing multiple files at once.
