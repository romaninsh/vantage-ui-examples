# Smith Requirements — `client-password-reset`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top
> to bottom first. Fill in "Notes" as you work.

## What you're building

Wire up an admin row-action on the Clients grid that generates a random password for the
selected client, sends it through an external mailer (HTTP API), and saves the hashed
password back to the client record. The user right-clicks a row → "Send password reset" →
sees a confirm dialog → on confirm the email is queued and the row updates.

Three YAML edits, no Rust. The Rust side (a `vantage-actions` crate + a confirm dialog
+ a process-wide dispatcher) is already in place — see Neo's `AGENT_NEO_NOTES.md` for
context. Your job is the inventory configuration: schema → action → page wiring.

## Prerequisites

- [ ] **vantage-ui running** — call `list_logs(level="info", limit=5)` on MCP. You
      should see catalog-load lines for `datasource/table/page/menu/action`.
- [ ] **SurrealDB reachable** — the bakery dev DB. The seed already populates `client`
      rows but doesn't have a `password_hash` column; you'll add one (soft-schema —
      no `DEFINE FIELD`, just write to it).
- [ ] **MCP tools present** — call `list_logs(level="warn", limit=5)` once to confirm.
- [ ] **`MAILER_URL` + `MAILER_TOKEN` env vars** — for first-run testing point at
      httpbin so you can inspect the JSON payload without standing up a real mailer:

      ```sh
      export MAILER_URL=https://httpbin.org/post
      export MAILER_TOKEN=dev-token
      ```

If any prereq fails, stop and write what you saw in Notes.

### MCP tools

- `list_logs(level, limit)` — always available.

## Reading order (do this BEFORE starting)

1. **`.agents/skills/vantage-ui-builder/SKILL.md`** — pay attention to two new sections:
   - "Row actions: `navigate:` vs. `action:`"
   - "Actions: declaring side-effecting operations"
2. **`.agents/skills/vantage-ui-builder/references/actions.md`** — full reference for
   the `action/<key>.yaml` shape and the host-fn vocabulary
   (`generate_password`, `hash_password`, `notify`, `actions.*`, `row.X = v`,
   `row.save()`).
3. **`examples/surreal-bakery/action/action-schema-1.json`** — auto-generated; tells you
   every valid field on `action/<key>.yaml`. Created on first app boot after the new
   `Kind::Action` lands. If it's missing, restart vantage-ui once.

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing.

- [ ] **Task 1 — Add `password_hash` to the client schema.** Edit
      `table/bakery-surreal/client.yaml`. Add a new column entry:

      ```yaml
      password_hash: { type: string }
      ```

      No flags — it's plain string storage. SurrealDB is schemaless; no
      `DEFINE FIELD` needed. After save, confirm `list_logs(level="warn")` is empty.

- [ ] **Task 2 — Create the action.** Add a new file:
      `action/send-password-reset.yaml`. Use the shape from
      `references/actions.md`:

      ```yaml
      # yaml-language-server: $schema=./action-schema-1.json
      kind: http_request
      description: |
        Emails the customer a new temporary password. They must change it
        on first login.
      params:
        email:    { type: string, label: Email }
        name:     { type: string, label: "Customer name" }
        password: { type: string, label: "New password" }
      http:
        method: POST
        url: "${MAILER_URL}/password-reset"
        headers:
          Authorization: "Bearer ${MAILER_TOKEN}"
          Content-Type: "application/json"
        body:
          to: email
          name: name
          password: password
      ```

      Reminder: filename `send-password-reset.yaml` → Rhai callable
      `actions.send_password_reset(email, name, password)`. **Param declaration
      order is the public contract** — `email, name, password` in that order is
      load-bearing for the call site below.

- [ ] **Task 3 — Wire the row action.** Edit `page/clients.yaml`. Add a new entry
      to the existing `row_actions:` block on the `crud` element (right after the
      existing "Open" navigate action):

      ```yaml
      - label: Send password reset
        icon: Mail
        action: |
          let pwd = generate_password(12);
          actions.send_password_reset(row.email, row.name, pwd);
          row.password_hash = hash_password(pwd);
          row.save();
      ```

      Three things to verify by re-reading the snippet:
      1. **Generate** happens first (pure compute, no dialog).
      2. **Send** is next — opens the confirm dialog with the resolved
         params; throws if the user cancels or the HTTP fails.
      3. **Save** is last — only runs after a clean send, so a cancelled
         dialog leaves the row's old `password_hash` intact.

      Don't add `navigate:` on this entry. `navigate:` and `action:` are
      mutually exclusive — exactly one of them per row-action. The
      catalog validator will reject both-set.

### Discovering schema

```bash
surreal sql --endpoint ws://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty <<'SQL'
SELECT * FROM client LIMIT 3;
SQL
```

The seed has Marty, Doc, Biff. After Task 1 saves, hot-reload the page in vantage-ui;
the new column should appear in the grid (default-empty for existing rows).

For valid action shapes, see `.agents/skills/vantage-ui-builder/references/actions.md`.

## Acceptance criteria

- [ ] All three tasks ticked.
- [ ] `list_logs(level="warn", limit=20)` empty after every save.
- [ ] Right-click any client row in the Clients page → menu shows
      "Send password reset" below the auto-derived "Open <relation>" entries.
- [ ] Clicking it opens a dialog titled
      `Confirm: send-password-reset` showing the resolved Email, Customer name,
      and New password fields.
- [ ] Clicking **Cancel** closes the dialog and does NOT modify `password_hash`.
- [ ] Clicking **Confirm** (with `MAILER_URL=https://httpbin.org/post`) sends a
      POST to httpbin (the response body in vantage-ui logs should echo the JSON
      payload back), then writes `password_hash` to the client row. Re-running
      the surreal `SELECT` shows the new hash.

## Notes

Blockers, guesses, surprises, workarounds, suggestions. Better too much detail.

(Empty until you start.)
