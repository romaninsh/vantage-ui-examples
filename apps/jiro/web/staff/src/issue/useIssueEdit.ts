// Saving one field of an issue through an edit draft. The model shows the new
// value at once; if the server refuses, the model rolls back to the old value
// and `error` holds the server's message (with its per-field message, if any).
import { useCallback, useState } from "react";
import type { Issues } from "../vantage.gen";

type Editable = "title" | "description";

export function useIssueEdit(issue: Issues, field: Editable) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Saves `value`; resolves true when the server accepted it. */
  const save = useCallback(
    async (value: string | null) => {
      setSaving(true);
      setError(null);
      const draft = issue.edit();
      draft[field] = value;
      const result = await draft.$flash();
      setSaving(false);
      if (result.ok) return true;
      const detail = result.error.fieldErrors[field];
      setError(detail && detail !== result.error.message ? `${result.error.message}: ${detail}` : result.error.message);
      return false;
    },
    [issue, field],
  );

  return { save, saving, error, clearError: () => setError(null) };
}
