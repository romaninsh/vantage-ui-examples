// Who new comments are posted as. The staff app has no sign-in, so the
// person is picked from the team (first by name until someone picks) and
// remembered in this browser.
import { useMemo, useState } from "react";
import { useCollection, useRecord } from "@vantage-ui/client/react";
import { useDb } from "../db";

const STORAGE_KEY = "jiro.commentingAs";

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The team, the chosen person, and a setter that remembers the choice. Call inside an observer. */
export function useCommenter() {
  const db = useDb();
  const people = useCollection(db.users.sort("name", "asc"));
  const [chosen, setChosen] = useState(remembered);
  // A remembered person loads by id; someone since removed falls back to the first.
  const picked = useRecord(useMemo(() => db.users.ref(chosen ?? ""), [db, chosen]));
  const person = chosen && picked.status !== "missing" ? picked.value : people.items[0];

  const choose = (id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage can be off (private windows); the choice then lasts this page only.
    }
  };

  return { people: people.items, person, choose };
}
