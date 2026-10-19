// API checks for scenario G, over raw WebSocket frames (Node 22+).
//   node tests/api-check.mjs staff  [ws://127.0.0.1:8092/v1/ws]
//   node tests/api-check.mjs public [ws://127.0.0.1:8092/v1/ws]
// Checks the one API the server on that URL serves (see README.md: two
// servers of one project can't run at once). Needs a fresh ./ingress.sh.
// Exits 1 when a check fails.
const api = process.argv[2];
if (api !== "staff" && api !== "public") {
  console.error("usage: node tests/api-check.mjs staff|public [ws url]");
  process.exit(2);
}
const url = process.argv[3] ?? "ws://127.0.0.1:8092/v1/ws";
let failures = 0;
const check = (ok, what, got) => {
  console.log(`${ok ? "✓" : "✗"} ${what}${ok ? "" : ` — got ${JSON.stringify(got)}`}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const c = { ws, next: 1, pending: new Map(), runs: new Map() };
    c.send = (frame) =>
      new Promise((res) => {
        const id = c.next++;
        c.pending.set(id, res);
        ws.send(JSON.stringify({ ...frame, id }));
      });
    ws.onmessage = (m) => {
      const f = JSON.parse(m.data);
      if (f.t === "run") c.runs.set(f.run, [...(c.runs.get(f.run) ?? []), f]);
      else if (f.id && c.pending.has(f.id)) {
        c.pending.get(f.id)(f);
        c.pending.delete(f.id);
      }
    };
    c.ended = async (run) => {
      for (let i = 0; i < 160; i++) {
        const last = (c.runs.get(run) ?? []).findLast((f) => f.status && f.status !== "running");
        if (last) return last;
        await sleep(50);
      }
      return { status: "timeout" };
    };
    ws.onerror = reject;
    ws.onopen = async () => {
      c.welcome = await c.send({ t: "hello", protocol: 1, token, features: ["runs:1"] });
      resolve(c);
    };
  });
}

/** Invoke `action` signed out on `url`: the run's last frame, or the refusal. */
async function signedOut(url, action, args) {
  const anon = await connect(url, undefined);
  const run = crypto.randomUUID();
  const started = await anon.send({ t: "invoke", run, action, args });
  const end = started.t === "result" ? await anon.ended(run) : started;
  anon.ws.close();
  return end;
}

const sam = { email: "sam@tickets.test", password: "flags-demo-pw" };
const cleo = { email: "cleo@tickets.test", password: "flags-demo-pw" };

// Each API runs only its own `sign_in:` list signed out. A staff session
// sees every ticket (`app = staff` lifts the rule); a public session sees
// its own.
const [mine, other, who, total] =
  api === "staff"
    ? [["staff_sign_in", sam], ["customer_sign_in", cleo], "Sam", 3]
    : [["customer_sign_in", cleo], ["staff_sign_in", sam], "Cleo", 2];
const refused = await signedOut(url, other[0], other[1]);
check(refused.t === "error" && refused.code === "forbidden", `${api} refuses ${other[0]} signed out (code forbidden)`, refused);
const signed = await signedOut(url, mine[0], mine[1]);
check(signed.status === "done" && typeof signed.result?.token === "string", `${api} allows ${mine[0]}`, signed);
const session = await connect(url, signed.result?.token);
check(session.welcome.principal === who, `hello as ${session.welcome.principal}`, session.welcome);
const rows = await session.send({ t: "open_table", table: "tickets" });
check(rows.t === "rows" && rows.total === total, `${who} on ${api} sees ${total} tickets`, rows);
session.ws.close();

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
