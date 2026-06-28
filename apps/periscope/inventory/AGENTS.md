---
metadata:
  version: "1.2.0"
---

# Agents

This project uses [Agent Skills](https://agentskills.io). Skills are installed under `.agents/skills/`.

## Start here

Read `.agents/skills/vantage-ui-builder/SKILL.md` first. It explains the project layout (`datasource/`, `table/`, `page/`, `menu/`, `view/`), the YAML conventions, and the **MCP feedback loop**: Vantage runs an HTTP MCP server at `http://127.0.0.1:14488/mcp` exposing a `list_logs` tool that surfaces parser, validator, and backend warnings after every save. Configure your agent to use it before doing anything else; that loop is how you'll know whether a YAML edit actually worked.

For project-wide settings — the colour theme and other `application.yaml` options — read `.agents/skills/vantage-application-settings/SKILL.md`.

## This app: Periscope

Periscope is a Lens-style control room for a Kubernetes cluster, rendered entirely from YAML over the native **`vantage-kubernetes`** datasource (no `kubectl`, no proxy). The backend fetches real Kubernetes objects, flattens their nested JSON into typed rows, parses quantity strings (`"16331752Ki"`) into numbers, and resolves label/owner relations server-side.

- **Datasource** — `datasource/cluster.yaml` (`type: kubernetes`). Uses the current kubeconfig context; the bundled fixtures live in namespace `demo`.
- **Tables** — one per resource Periscope surfaces: nodes, namespaces, pods, deployments, replicasets, services, configmaps, secrets, jobs, events, plus live `node_metrics` / `pod_metrics`. Each `table:` is the resource's API path; columns map to projected fields.
- **Relations** — `references:` blocks wire the drill-downs: namespace → its eight child kinds, node → pods, deployment → replicasets → pods. Belongs-to `references:` on FK columns make namespace / node / owner cells drill-up links.
- **Pages** — two dashboards (`overview`, `usage`), binder pages with custom Summary **views** (`nodes`, `deployments`, `pods`), and two **burger** vertical-drill pages (`explorer`, `infra`).

## Running it

Periscope needs a Vantage UI binary built **with** the `vantage-kubernetes` backend (the sibling `../vantage-ui` build has it). Point `VANTAGE_UI_BIN` at it and open this `inventory/`. You also need a reachable cluster — `minikube` with the demo fixtures works out of the box.

## Working principles

- Only model resources the `vantage-kubernetes` backend projects (the table list above). A `table:` path with no projector yields empty rows.
- After every save, call `list_logs` on the Vantage MCP. Surface any WARN/ERROR before continuing.
- Build one page at a time. Get it right, then move on.
