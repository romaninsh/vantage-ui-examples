# Identity scenario G: web and API only

Support tickets served by two APIs over one table and one session table,
each API with its own sign-in. Customers sign in to `public` and see the
tickets they own. Staff sign in to `staff` and see every ticket. The desktop
has one status page.

A session is valid only on the API that issued it:
- each sign-in stamps the session's `app` field (`"public"` or `"staff"`);
- `session.valid` is `session.app == app.name && (session.assumed ||
  session.expires_at > now())`, and the server loads a token for its own API
  key, so a `public` token is an unknown token on `staff`;
- the `owner_id` rule is `must_be: session.person_id`, with a
  `{ type: app, name: staff, when: 'session.role == "staff" && session.app ==
  "staff"' }` exception that lifts it only for a staff member signed in to
  `staff`.

People (password `flags-demo-pw` for each):

| id | name | email | role |
|---|---|---|---|
| p1 | Sam | sam@tickets.test | staff |
| p2 | Cleo | cleo@tickets.test | customer |
| p3 | Carl | carl@tickets.test | customer |

Tickets: t1 and t2 are Cleo's, t3 is Carl's.

| API | signed out, runs only | a session sees |
|---|---|---|
| `public` | `customer_sign_in` | its own tickets (Cleo: 2) |
| `staff` | `staff_sign_in` (staff only) | all 3 (`app = staff` exception); a `public` token is refused at `hello` |

## Set up

```sh
./ingress.sh          # makes data/auth.db (3 people) and data/main.db (3 tickets)
```

Opened in Vantage UI, the Status page shows `Tickets 3`: the desktop has
full access.

## API checks

Start one API at a time from a vantage-server checkout on the
`identity-app-claims-host` branch. Two vantage-server processes on one
project share its row cache, and the second can't open it (see the
phase report).

Run `public` first: it saves Cleo's token in `data/public-token.txt`, and
the `staff` run tries it.

```sh
./ingress.sh
cd ../../../vantage-server        # wherever vantage-server is checked out
cargo build -p vantage-server-bin
VANTAGE_PROJECT=<path>/apps/identity-g-api VANTAGE_API=public PORT=8092 target/debug/vantage-server
```

From this folder (Node 22 or later):

```sh
node tests/api-check.mjs public ws://127.0.0.1:8092/v1/ws
```

```
✓ public refuses staff_sign_in signed out (code forbidden)
✓ public allows customer_sign_in
✓ hello as Cleo
✓ Cleo on public sees 2 tickets
all checks passed
```

Stop the server, start it again with `VANTAGE_API=staff` on the same port,
and run:

```sh
node tests/api-check.mjs staff ws://127.0.0.1:8092/v1/ws
```

```
✓ staff refuses customer_sign_in signed out (code forbidden)
✓ staff allows staff_sign_in
✓ hello as Sam
✓ Sam on staff sees 3 tickets
✓ Cleo's public token on staff isn't seated at hello
all checks passed
```

Each run sends:
1. a tokenless `hello`;
2. `invoke {action: "<other API's sign-in>"}`, answered with `error {code:
   "forbidden"}`;
3. `invoke {action: "<own sign-in>", args: {email, password}}`, whose last
   `run` frame carries `result.token`;
4. `hello {token}`;
5. `open_table {table: "tickets"}`, whose `rows` has `total` 3 (staff) or
   2 (public).

The `staff` run then sends `hello {token: <Cleo's public token>}`. It is
answered with an `error`, not a `welcome`: Cleo's session fails `valid:` on
`staff`, and the server log shows `refused … frame: hello, reason: unknown
token`. (Had it been welcomed as anonymous, the script would also check that
`open_table` is `forbidden`.)

## MCP checks

Turn on "Allow MCP agents to read data". These reproduce the API counts
from the desktop.

1. `run_data_script { "script": "table(\"ticket\").count()" }` → `{ "result": 3 }`
   (the desktop).
2. `run_data_script { "script": "table(\"ticket\").count()", "app": "public",
   "session": { "person_id": "p2", "name": "Cleo", "role": "customer", "app": "public" } }`
   → `{ "result": 2 }`.
3. `run_data_script { "script": "table(\"ticket\").count()", "app": "staff",
   "session": { "person_id": "p1", "name": "Sam", "role": "staff", "app": "staff" } }`
   → `{ "result": 3 }`.
4. Cleo's session read on `staff`: the call of check 2 with the outer `"app":
   "staff"` (the session's `app` still `"public"`) fails with "`session.assume`:
   the session fails `session.valid`", as her token does on the `staff` API.
5. `explain_access { "table": "ticket", "app": "public", "session": { "person_id":
   "p2", "name": "Cleo", "role": "customer", "app": "public" } }` returns:
   - `applied`: `[{ "column": "owner_id", "condition": "owner_id = 'p2'", "source": {
     "datasource": "main", "rule": "main.invariants.owner_id", "session_fields":
     ["person_id"], … } }]`;
   - `lifted`: `[]`.
6. The same with `"app": "staff"` and Sam's session returns `applied: []` and
   `lifted: [{ "rule": "main.invariants.owner_id", "exception": "app = staff",
   "default": false, … }]`.
7. With `"app": "staff"` and Cleo's `public` session, `explain_access` fails with
   the same "the session fails `session.valid`".
