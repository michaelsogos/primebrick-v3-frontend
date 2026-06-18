---
trigger: always_on
---
# Rule: Always Check Rules Before Action

## Trigger
- Applies to ALL actions, file operations, and planning tasks
- Must be checked before any write operation, file creation, or terminal command

## Mandatory Pre-Action Checklist
Before taking ANY action, you MUST:

1. **Read `.devin/rules/` directory** - List and read all rule files
2. **Check `AGENTS.md`** - Read project-specific agent instructions  
3. **Identify applicable rules** - Determine which rules apply to the current task
4. **Follow rule-defined paths** - Use paths specified in rules, not existing file patterns
5. **Only then proceed** - Take action only after confirming compliance with all applicable rules

## Forbidden Behaviors
- ❌ Copy existing file patterns without checking rules first
- ❌ Assume based on "typical" locations without verification
- ❌ Skip rule-checking for "obvious" tasks
- ❌ Rely on pattern-matching over explicit rule-following

## Consequence
If you fail to check rules before action, halt immediately and ask user to reset the approach.