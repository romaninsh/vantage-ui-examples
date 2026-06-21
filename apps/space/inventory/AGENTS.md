---
metadata:
  version: "1.2.0"
---

# Agents

This project uses [Agent Skills](https://agentskills.io). Skills are installed under `.agents/skills/`.

## Start here

Read `.agents/skills/vantage-ui-builder/SKILL.md` first. It explains the project layout (`datasource/`, `table/`, `page/`, `menu/`), the YAML conventions, and — importantly — the **MCP feedback loop**: Vantage runs an HTTP MCP server at `http://127.0.0.1:14488/mcp` exposing a `list_logs` tool that surfaces parser, validator, and backend warnings after every save. Configure your agent to use it before doing anything else; that loop is how you'll know whether a YAML edit actually worked.

For backend-specific guidance (e.g. AWS, Postgres, REST APIs), read the matching `vantage-persistence-<kind>/SKILL.md`.

For project-wide settings — the colour theme and other `application.yaml` options — read `.agents/skills/vantage-application-settings/SKILL.md`.

## Working principles

- Confirm the user's intent before writing YAML. Don't pivot to one specific feature — present a small menu, propose a specific page with specific columns, wait for "yes".
- Use the actual backend CLI (`aws`, `psql`, `mongosh`, …) to count what's there and propose realistic columns instead of guessing.
- After every save, call `list_logs` on the Vantage MCP. Surface any WARN/ERROR back to the user before continuing.
- Build one page at a time. Get it right, ask the user, then move on.
