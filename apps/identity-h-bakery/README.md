# Identity scenario H: a bakery's scoped role

A bakery chain whose desktop admin checks what one shop's staff would see.
The shop tables (`product`, `client`, `order`) carry a `bakery_id` rule:
`must_be: session.bakery_id`, plus the spec's script, which removes the
`bakery_id` and `bakery_name` columns. Head office's `payroll` has a rule
on `session.office`, which no shop session carries, so a shop session is
refused it. The desktop's own session is lifted from both (the `vantage`
app's default exception). The identity menu has:
- `switch_role`: a dialog with role and bakery, which assumes
  `#{ app: "staff", fields: #{ role, bakery_id } }`;
- `view_bakery_3`: one click, a manager of bakery 3 (Breg Leeds);
- `restore_identity`.

Bakeries: 1 Breg HQ, 2 Breg Newcastle, 3 Breg Leeds. Bakery 3 has products
pr3 and pr4, clients c2 and c3, and orders o2 and o3.

## Set up

```sh
./ingress.sh          # makes data/directory.db, shop.db, hq.db, auth.db
```

Open the folder in Vantage UI. Products lists 4 rows, with Bakery and
Bakery name columns; Payroll lists 2.

## MCP checks

Turn on "Allow MCP agents to read data" and "Allow MCP agents to write data".
`<USER>` is your login name: with no `session.desktop` block, the desktop
session's `name` is the OS account.

1. `ui_tree {}`:
   - `session` is `{ "app": "vantage", "assumed": false, "via": null, "who":
     "<USER>", "fields": { "name": "<USER>", "assumed": false } }`;
   - the Products page's `access[0].lifted[0].exception` is `"app = vantage"`.
2. `ui_interact { "element": "identity:me", "action": "view_bakery_3" }`. After
   about a second, `ui_tree {}` gives `session.app == "staff"`,
   `session.assumed == true` and `session.who == "<USER> as manager (staff)"`.
3. `ui_navigate { "page": "products" }`, then `ui_tree {}`. The Products page's
   `access[0]` has:
   - `applied`: `[{ "column": "bakery_id", "condition": "bakery_id = 3", "source":
     { "datasource": "shop", "rule": "shop.invariants.bakery_id", "session_fields":
     ["bakery_id"], "origin": "MustBe", … } }]`;
   - `removed_columns`: `["bakery_id", "bakery_name"]`.

   On screen:
   - one locked chip `bakery_id = 3` sits above the grid;
   - the grid lists 2 products (Rye loaf, Iced bun);
   - it has no Bakery or Bakery name column.
4. `ui_navigate { "page": "payroll" }`, then `ui_tree {}`. The Payroll page's
   `access[0].refusal` is `{ "table": "payroll", "rule": "hq.invariants.office",
   "reason": "table `payroll`: the `office` rule has no value in this session" }`.
   On screen it reads:

   ```
   Viewing as manager in `staff`: no access to `payroll`
   Rule: `hq.invariants.office`
   Reason: table `payroll`: the `office` rule has no value in this session
   ```
5. The same reads without assuming:
   - `run_data_script { "script": "table(\"product\").count()", "app": "staff",
     "session": { "role": "manager", "bakery_id": 3 } }` → `{ "result": 2 }`;
   - the same with `table(\"payroll\")` fails with "table `payroll`: the `office`
     rule has no value in this session (forbidden: payroll, rule:
     hq.invariants.office, …)";
   - `explain_access { "table": "product", "app": "staff", "session": { "role":
     "manager", "bakery_id": 3 } }` gives the `applied` and `removed_columns` of
     check 3.
6. `ui_interact { "element": "identity:me", "action": "restore_identity" }`, then
   `ui_tree {}`:
   - `session.app == "vantage"` and `session.assumed == false`;
   - Products lists 4 rows again, with both bakery columns and the chip
     "full access: exception `app = vantage`";
   - Payroll lists 2 rows.
