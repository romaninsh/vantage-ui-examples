# Identity scenario B: admin desktop, staff web

Feature flags per environment. The desktop holds the database credentials
and opens with its own session (`session.desktop`:
`#{ name: env("USER") + "@desktop", role: "admin" }`) and full access. Staff
sign in with a password over the `flags` API. One rule script on the
`environment` column checks writes, deny by default:
- an admin changes anything;
- an editor changes only flags in the environments of `session.envs`: an
  insert is checked on the new row, an update on both the new row and the
  stored one (so a prod flag can't be moved into dev), and a delete on the
  stored row;
- any other role (a viewer, or one the script doesn't know) changes nothing.

The title bar's identity menu
lets the admin step into someone's shoes (`session.assume`) and back
(`session.restore`).

People (password `flags-demo-pw` for each):

| id | name | email | role | envs |
|---|---|---|---|---|
| p1 | Owen | owen@flags.test | admin | dev,test,prod |
| p2 | Eve | eve@flags.test | editor | dev,test |
| p3 | Vic | vic@flags.test | viewer | |

Flags: f1 `checkout-v2` dev, f2 `checkout-v2` prod, f3 `dark-mode` test,
f4 `new-pricing` prod.

## Set up

```sh
./ingress.sh          # makes data/auth.db (3 people) and data/main.db (4 flags)
```

Open the folder in Vantage UI. The title bar's identity button reads
`<your $USER>@desktop`. Its menu has `switch_person` and `switch_role` (a
dialog each), `as_editor` (one click: an editor of dev,test), `restore_identity`
and `set_password` (a dialog).

## MCP checks

Turn on "Allow MCP agents to read data" and "Allow MCP agents to write data".
`<USER>` below is your login name.

1. `ui_tree {}`:
   - `session` is `{ "app": "vantage", "assumed": false, "via": null, "who":
     "<USER>@desktop", "fields": { "name": "<USER>@desktop", "role": "admin",
     "assumed": false } }`;
   - `shell.title_bar.right[0]` has `"kind": "identity"`, `"id": "me"`,
     `"entries": ["switch_person", "switch_role", "as_editor", "restore_identity",
     "set_password"]` and `"values": { "text": "<USER>@desktop", "avatar": null }`.
2. `explain_access { "table": "feature_flag" }` returns `lifted`:
   `[{ "datasource": "main", "rule": "main.invariants.environment", "exception":
   "app = vantage", "default": true }]`, `applied` and `hooks` empty. The desktop
   has full access.
3. `explain_access { "table": "feature_flag", "app": "flags", "session": { "role":
   "editor", "envs": "dev,test" } }` returns `"app": "flags"`, `"assumed": true`,
   `"applied": []`, and `hooks`: `[{ "rule": "main.invariants.environment.script",
   "on": ["before_insert", "before_update", "before_delete"], "last_refusal": null }]`. These are the
   chips an editor's Flags page shows ("writes checked by …").
4. An editor's write outside their environments:
   `run_data_script { "script": "table(\"feature_flag\").insert(#{ id: \"f9\", name:
   \"x\", environment: \"prod\" })", "app": "flags", "session": { "role": "editor",
   "envs": "dev,test" } }` fails with
   `editors change only their environments (forbidden: feature_flag, rule:
   main.invariants.environment.script)`.
   - The same call with `environment: \"dev\"` and `id: \"f8\"` returns
     `{ "result": "f8" }`; run `./ingress.sh` again afterwards to reset.
5. Assume from the identity menu:
   `ui_interact { "element": "identity:me", "action": "as_editor" }` returns
   `"kind": "identity"`. After about a second, `ui_tree {}` gives:
   - `session.app == "flags"`, `session.assumed == true`,
     `session.via == "<USER>@desktop"` and `session.who == "<USER>@desktop as
     editor (flags)"`;
   - `session.fields == { "name": "editor", "role": "editor", "envs": "dev,test",
     "assumed": true }`;
   - the identity item's `values.text == "editor"`;
   - on the Flags page, `pages[…].access[0].hooks[0].rule ==
     "main.invariants.environment.script"`.
6. While assumed, `ui_navigate { "page": "people" }` and then `ui_tree {}`: the
   People page's `access[0].refusal` is `{ "table": "person", "rule":
   "session.identity", … }`. On screen it reads "Viewing as editor in `flags`: no
   access to `person`", then the Rule and Reason lines.
7. Restore: `ui_interact { "element": "identity:me", "action": "restore_identity" }`,
   then `ui_tree {}`: `session.app == "vantage"` and `session.assumed == false`, as
   in check 1.
8. With "Allow MCP agents to write data" off, `ui_interact { "element": "identity:me",
   "action": "as_editor" }` is refused (it can assume, which rebuilds the window).

## API checks

The `flags` API runs as app `flags`: no default exception applies, so the
rule script checks every staff write. Signed out, it runs only
`password_sign_in` (`auth.local.session.sign_in`).

Start it from a vantage-server checkout on the `identity-app-claims-host`
branch. It can run while the app is open in Vantage UI, because the two keep
separate caches.

```sh
./ingress.sh
cd ../../../vantage-server        # wherever vantage-server is checked out
cargo build -p vantage-server-bin
VANTAGE_PROJECT=<path>/apps/identity-b-flags VANTAGE_API=flags PORT=8091 \
  target/debug/vantage-server
```

Then, from this folder (Node 22 or later, for its built-in WebSocket):

```sh
node tests/api-check.mjs ws://127.0.0.1:8091/v1/ws
```

Expected output, all ✓:

```
✓ a tokenless hello is anonymous
✓ signed out, flags are not served
✓ a wrong password is refused
✓ password_sign_in hands back a token
✓ hello as Eve
✓ Eve reads the 4 flags
✓ Eve's prod insert → rejected, code forbidden, the rule and its reason
✓ Eve's dev insert → flashed
✓ Eve's patch moving prod flag f2 to dev → forbidden
✓ Eve's rename of dev flag f1 → flashed
✓ Eve's delete of prod flag f4 → forbidden
✓ Vic's insert → forbidden, this role changes nothing
✓ Vic's delete → forbidden
all checks passed
```

The two update checks (`f2` moved to dev, `f1` renamed) need vantage-lib to
hand the rule script's `before_update(|record, stored| …)` the stored row.
Until it does, `stored` is `()`: both patches are refused with "Unknown
property 'environment' … for type '()'". That fails closed, so no prod flag
moves, but an editor can't patch at all.

The frames it sends, in order:
1. `hello {protocol: 1}`;
2. `invoke {run, action: "password_sign_in", args: {email:
   "eve@flags.test", password: "flags-demo-pw"}}`, whose last `run` frame
   carries `result.token`;
3. `hello {protocol: 1, token}` on a new socket;
4. `open_table {table: "flags"}`, answered with `rows` and `total: 4`;
5. `flash {table: "flags", patch: {name: "eve-prod", environment: "prod"}}`,
   answered with `rejected {code: "forbidden", rule:
   "main.invariants.environment.script", reason: "editors change only their
   environments"}`;
6. `flash {table: "flags", rid: "f2", patch: {environment: "dev"}}`, answered
   with `rejected` and the same reason;
7. `delete {table: "flags", rid: "f4"}`, answered with `rejected` and the same
   reason.

The script writes one dev flag and renames f1; run `./ingress.sh` to reset.
