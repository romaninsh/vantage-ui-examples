# Vantage 0.41.1

## Filters on SurrealDB `expr:` columns match nothing
- **Wanted:** filter Users by a derived email status (verified / unverified) and Articles by a
  derived "new / edited" state, from the binder filter panel.
- **Tried:**
  ```yaml
  # table/user.yaml
  email_status: { type: string, flags: [label], enum: [verified, unverified],
                  expr: 'expr("IF email_verified_at != NONE THEN ''verified'' ELSE ''unverified'' END")' }
  # page/users.yaml → binder params
  filter: [email_status]
  ```
- **Happened:** no log line, 0 rows. `preview_query` for
  `table("user").add_condition_eq("email_status", "unverified")` renders
  `SELECT …, (IF … END) AS email_status, … FROM user WHERE email_status = "unverified"` —
  the condition names the projection alias, which SurrealDB evaluates against the stored
  record (no such field), so nothing matches. The same happens with `like`. The column is
  offered as an enum picker in the filter panel, so users hit it.
- **Workaround:** left `expr:` columns out of every `filter:` list; they are display-only
  pills. Pushing the expression itself into `WHERE` would fix it.

## A query table's `order_by` is lost on dashboard lists
- **Wanted:** a "Top authors" list ranked by favorites.
- **Tried:** a SurrealDB query table ending `.order_by(ident("favorites"), "desc").limit(8, 0)`,
  observed directly — the pattern `vantage-dashboards/references/recipe-surrealdb.md` shows for
  `top_customers`:
  ```yaml
  - kind: list
    observe: author_stats
    params: { text: '${ username }', label: '${ favorites.to_string() }', bar: bar_pct }
  ```
- **Happened:** no log line; rows rendered in id order (aiko, grace.h, hannah.s, …).
  `run_data_script` in `cache` mode returns the same id order, while `direct` mode returns the
  query's order.
- **Workaround:** `observe: { script: 'scenery("author_stats").sort("favorites", "desc")' }`.
