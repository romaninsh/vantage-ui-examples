import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Connect, Db } from "./db";
import { saveToken } from "./session";

/** How long to wait for the server before giving up on a sign-in. */
const WAIT_MS = 10_000;

/**
 * Paste a token from the `test` profile of breg-bakery's `api/staff.yaml`
 * (`hq-token`, `leeds-token`, `newcastle-token`). The client connects once;
 * a refusal is final, so a wrong token shows the server's message and
 * nothing retries. A server that doesn't answer within `WAIT_MS` is given up
 * on, and the wait can be cancelled.
 */
export function SignIn({ connect, refusal, onSignedIn }: { connect: Connect; refusal: string | null; onSignedIn: (db: Db) => void }) {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [error, setError] = useState(refusal);
  // The client still waiting for the server. Cancelling, giving up or leaving
  // the page clears it, so an answer arriving afterwards is ignored.
  const attempt = useRef<Db | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => abandon(), []);

  function abandon() {
    attempt.current?.close();
    attempt.current = null;
  }

  function stop(message: string | null) {
    abandon();
    setError(message);
    setBusy(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    const db = connect(value);
    attempt.current = db;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `ready` settles with the connection: open, or halted by a refusal.
    const connection = await Promise.race([
      db.ready,
      new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), WAIT_MS))),
    ]);
    clearTimeout(timer);
    if (attempt.current !== db) return;
    if (!connection) return stop("Can't reach the server");
    if (connection.halted) return stop(connection.error ?? connection.status);
    attempt.current = null;
    saveToken(value);
    onSignedIn(db);
    navigate("/", { replace: true });
  }

  return (
    <div className="signin">
      <form onSubmit={submit}>
        <h1>Breg 🥐 staff</h1>
        <p className="notice">Placeholder sign-in: paste a test-profile token. Real sign-in comes later.</p>
        <label>
          Token
          <input value={token} onChange={(e) => setToken(e.target.value)} autoFocus autoComplete="off" />
        </label>
        <button type="submit" disabled={busy || !token.trim()}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {busy && (
          <button type="button" onClick={() => stop(null)}>
            Cancel
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
