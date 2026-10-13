import { observer, useConnection } from "@vantage-ui/client/react";
import { useDb } from "./db";

export const Header = observer(function Header({ onSignOut }: { onSignOut: () => void }) {
  const { status, seq, principal } = useConnection();
  const db = useDb();
  return (
    <header>
      <h1>
        Breg 🥐 <span>live over vantage-server</span>
      </h1>
      <div className="who">
        <button title="Undo your last edit" onClick={() => void db.undo()}>
          ↶ Undo
        </button>
        <div className={`badge ${status}`}>
          {principal ?? "…"} · {status} · seq {seq}
        </div>
        <button onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
});
