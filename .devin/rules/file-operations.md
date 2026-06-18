---
trigger: always_on
---

# Devin Rule: File Operations

## Trigger
- Applies whenever AI agent needs to read, write, or verify files

## Actions
1. **NEVER automatically open files in editor if are PLANS or internal SCRIPTS** - Do NOT automatically open any files (plans, scripts) in the user's editor
   - Plans should be created but NOT opened
   - Scripts should be created in temp directory but NOT opened

2. **ALWAYS use empirical verification** - ALWAYS verify file existence and content using tools:
   - Use `Test-Path` (PowerShell) or `ls` (Unix) to verify file existence
   - Use `read` tool to read file content
   - Use `grep` tool to search for specific patterns
   - Use `find_file_by_name` tool to locate files
   - NEVER rely on "open files" in editor context

3. **IGNORE open files in editor context** - The editor keeps copies in memory even after deletion
   - If you delete a file, verify with `Test-Path` - do NOT rely on editor open files
   - Editor open files are NOT reliable indicators of file existence
   - ALWAYS use empirical tools to verify file state

4. **Verify before operations** - Before any file operation:
   - Verify file exists with `Test-Path` or `ls`
   - Verify file content with `read` if needed
   - Verify exact location with `grep` if searching for patterns
   - Do NOT assume file state based on editor context

5. **Use relative paths from workspace** - When in parent directory:
   - Use relative paths like `primebrick-fe-v3/src/...`
   - Do NOT use absolute paths unless necessary
   - Do NOT use paths with leading `/` unless required by tool

## Enforcement
- AI agent MUST verify file existence empirically before operations
- AI agent MUST NOT rely on editor open files for any decision
- AI agent MUST NOT automatically open plans and scripts files in editor
- AI agent MUST use grep/read tools for content verification