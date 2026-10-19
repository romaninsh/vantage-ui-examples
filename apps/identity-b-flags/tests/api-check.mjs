// API checks for scenario B, over raw WebSocket frames (Node 22+).
//   node tests/api-check.mjs [ws://127.0.0.1:8090/v1/ws]
// Needs the `flags` API running on this app (see README.md) and a fresh
// ./ingress.sh. Exits 1 when a check fails.
const url = process.argv[2] ?? "ws://127.0.0.1:8090/v1/ws";
let failures = 0;
const check = (ok, what, got) => {
  console.log(`${ok ? "✓" : "✗"} ${what}${ok ? "" : ` — got ${JSON.stringify(got)}`}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(token) {
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
    // A run's last frame, once it has ended.
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

async function signIn(email, password) {
  const anon = await connect(undefined);
  const run = crypto.randomUUID();
  const started = await anon.send({ t: "invoke", run, action: "password_sign_in", args: { email, password } });
  const end = started.t === "result" ? await anon.ended(run) : started;
  anon.ws.close();
  return end;
}

// 1. Signed out, the socket is anonymous; a wrong password signs nobody in.
const anon = await connect(undefined);
check(anon.welcome.principal_id?.startsWith("anonymous:"), "a tokenless hello is anonymous", anon.welcome);
const denied = await anon.send({ t: "open_table", table: "flags" });
check(denied.t === "error" && denied.kind === "forbidden", "signed out, flags are not served", denied);
anon.ws.close();
const wrong = await signIn("eve@flags.test", "not her password");
check(wrong.status === "failed" && /Wrong email or password/.test(JSON.stringify(wrong.error)), "a wrong password is refused", wrong);

// 2. Eve (editor of dev,test) signs in with her password.
const signed = await signIn("eve@flags.test", "flags-demo-pw");
const token = signed.result?.token;
check(signed.status === "done" && typeof token === "string", "password_sign_in hands back a token", signed);
const eve = await connect(token);
check(eve.welcome.principal === "Eve", `hello as ${eve.welcome.principal}`, eve.welcome);

// 3. An editor reads every flag.
const rows = await eve.send({ t: "open_table", table: "flags" });
check(rows.t === "rows" && rows.total === 4, "Eve reads the 4 flags", rows);

// 4. A write outside her environments is refused by the rule script.
const prod = await eve.send({ t: "flash", table: "flags", patch: { name: "eve-prod", environment: "prod", enabled: true } });
check(
  prod.t === "rejected" &&
    prod.code === "forbidden" &&
    prod.rule === "main.invariants.environment.script" &&
    prod.reason === "editors change only their environments",
  "Eve's prod insert → rejected, code forbidden, the rule and its reason",
  prod,
);

// 5. One inside them is written.
const dev = await eve.send({ t: "flash", table: "flags", patch: { name: "eve-dev", environment: "dev", enabled: true } });
check(dev.t === "flashed", "Eve's dev insert → flashed", dev);

// 6. An update is judged on where the row is going and where it was: moving
//    the prod flag f2 into dev is refused; renaming the dev flag f1 is not.
const move = await eve.send({ t: "flash", table: "flags", rid: "f2", patch: { environment: "dev" } });
check(
  move.t === "rejected" && move.code === "forbidden" && move.reason === "editors change only their environments",
  "Eve's patch moving prod flag f2 to dev → forbidden",
  move,
);
const rename = await eve.send({ t: "flash", table: "flags", rid: "f1", patch: { name: "checkout-v3" } });
check(rename.t === "flashed", "Eve's rename of dev flag f1 → flashed", rename);

// 7. A delete is judged on the stored row: the prod flag f4 stays.
const del = await eve.send({ t: "delete", table: "flags", rid: "f4" });
check(
  del.t === "rejected" && del.code === "forbidden" && del.reason === "editors change only their environments",
  "Eve's delete of prod flag f4 → forbidden",
  del,
);
eve.ws.close();

// 8. Any other role (here a viewer) changes nothing.
const vic = await connect((await signIn("vic@flags.test", "flags-demo-pw")).result?.token);
const vicWrite = await vic.send({ t: "flash", table: "flags", patch: { name: "vic", environment: "dev" } });
check(vicWrite.t === "rejected" && vicWrite.code === "forbidden" && vicWrite.reason === "this role changes nothing", "Vic's insert → forbidden, this role changes nothing", vicWrite);
const vicDel = await vic.send({ t: "delete", table: "flags", rid: "f1" });
check(vicDel.t === "rejected" && vicDel.code === "forbidden", "Vic's delete → forbidden", vicDel);
vic.ws.close();

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
