---
trigger: always_on
---
# Devin Workflow Rule: Tic-Toc Planning

## Trigger
- Applies automatically at the start of any new session.
- Triggered whenever a new feature, refactor, debt management, or bugfix is requested.

## Actions
1. **Analysis Phase**: Analyze the codebase to fully understand the requirements, but **DO NOT modify any source code files** during this phase.
2. **File Creation**: Automatically generate a new Markdown plan file inside the directory `d:\git\primebrick\primebrick-workspace\ai-plans\`. You are free to decide the file name based on the task context (e.g., `feature-xyz-plan.md` or `bugfix-abc-plan.md`). Ensure the file uses the `.md` extension.
3. **Plan Generation**: Write a detailed, structural action plan inside this generated Markdown file. Include objectives, impacted files, architectural changes, and precise acceptance criteria; with code examples.
4. **MANDATORY BLOCKER**: Once the file is saved, output this exact message in the chat: *"Planning complete. I have created the plan file inside your ai-plans folder. Awaiting approval."* 
5. **HALT EXECUTION**: Stop immediately. **DO NOT** execute any coding, terminal commands, or subagents until the user explicitly sends the keyword: **"PROCEED"**.

