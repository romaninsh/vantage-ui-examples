import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { VantageProvider, useConnection } from "@vantage-ui/client/react";
import { App } from "./App";
import type { Connect, Db, Forget } from "./db";
import { clearToken, readToken } from "./session";
import { SignIn } from "./SignIn";

/**
 * Holds the signed-in client. Without one, every page sends you to
 * `/sign-in`; with one, `/sign-in` sends you home. A token the server refuses
 * ends the session and goes to `/sign-in` too, carrying the server's message.
 * Signing out also wipes the rows stored for the token.
 */
export function Root({ connect, forget }: { connect: Connect; forget: Forget }) {
  const [db, setDb] = useState<Db | null>(() => {
    const token = readToken();
    return token ? connect(token) : null;
  });
  const [refusal, setRefusal] = useState<string | null>(null);

  const end = (message: string | null) => {
    db?.close();
    clearToken();
    setRefusal(message);
    setDb(null);
  };

  const signOut = () => {
    const token = readToken();
    end(null);
    if (token) forget(token);
  };

  const signedIn = (next: Db) => {
    if (db !== next) db?.close();
    setRefusal(null);
    setDb(next);
  };

  return (
    <Routes>
      <Route
        path="/sign-in"
        element={db ? <Navigate to="/" replace /> : <SignIn connect={connect} refusal={refusal} onSignedIn={signedIn} />}
      />
      <Route
        path="*"
        element={
          db ? (
            <VantageProvider db={db} fallback={<Connecting onSignOut={signOut} />}>
              <RefusalGate onRefused={end}>
                <App onSignOut={signOut} />
              </RefusalGate>
            </VantageProvider>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />
    </Routes>
  );
}

/** Shown until the stored token's client is ready; a down server keeps it here, so it offers a way out. */
function Connecting({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="splash">
      <p>Connecting…</p>
      <button onClick={onSignOut}>Sign out</button>
    </div>
  );
}

function RefusalGate({ onRefused, children }: { onRefused: (message: string) => void; children: ReactNode }) {
  const { status, halted, error } = useConnection();
  // A halted connection was either refused (the token) or is out of date (the protocol).
  const refused = status === "refused";
  useEffect(() => {
    if (refused) onRefused(error ?? "Sign-in refused");
  }, [refused, error, onRefused]);
  if (!halted) return children;
  if (refused) return null;
  return (
    <p className="splash" role="alert">
      This page is out of date. Reload it. ({error})
    </p>
  );
}
