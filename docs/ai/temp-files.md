
# Devin Rule: Temporary Files Location

> Canonical body of `.devin/rules/temp-files.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever AI agent needs to create temporary files (scripts, patches, intermediate files, etc.)

## Actions
1. **NEVER create temporary files in project repositories** - Do NOT create .js, .py, .cjs, or any temporary script files in:
   - `d:/git/primebrick-fe-v3/` (frontend repository)
   - `d:/git/primebrick-be-v3/` (backend repository)
   - `d:/git/primebrick-us-v3/` (microservices repository)
   - `d:/git/primebrick-dal-v3/` (DAL library repository)
   - `d:/git/primebrick-v3-sdk/` (SDK library repository)
   - `d:/git/primebrick-v3-core/` (core contracts library)
   - `d:/git/primebrick-v3-ui/` (UI component library)
   - `d:/git/primebrick-decimal/` (decimal math library)
   - `d:/git/primebrick-v3-docs/` (docs site repository)
   - Any other project repository

2. **Use temp directory for temporary files** - If temporary files are absolutely necessary, use:
   - Windows: `d:\git\primebrick\temp\`
   - Linux/Mac: `/tmp/` or `/var/tmp/`

3. **Clean up temporary files immediately** - After using temporary files:
   - Remove them immediately with `Remove-Item -Force` (PowerShell) or `rm -f` (Unix)
   - Do NOT leave temporary files in the system temp directory
   - Verify cleanup with `Test-Path` or `ls` before proceeding

4. **Prefer in-memory operations** - Instead of creating temporary files:
   - Use subagents for complex operations
   - Use string manipulation in memory
   - Use direct file edits instead of intermediate scripts

5. **NEVER open temporary files in IDE** - Do not automatically open temporary files in the user's editor

## Enforcement
- AI agent MUST verify file location before creating any file
- AI agent MUST clean up all temporary files before ending session
- AI agent MUST NOT leave project repositories polluted with temporary files
