// Jira's comment box under the thread: "Add a comment…" opens a text area
// with Save and Cancel. Saving inserts a comment on the server; the new
// comment shows when the server adds it to the thread, in the server's
// order. A refusal keeps the text and shows the server's message.
import { useState } from "react";
import Button from "@atlaskit/button/new";
import Select from "@atlaskit/select";
import TextArea from "@atlaskit/textarea";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { UserAvatar } from "../jira/UserAvatar";
import { InlineError } from "./InlineError";
import { useCommenter } from "./useCommenter";

export const CommentComposer = observer(function CommentComposer({ issueId }: { issueId: string }) {
  const db = useDb();
  const { people, person, choose } = useCommenter();
  const [body, setBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setBody(null);
    setError(null);
  };
  const submit = async () => {
    if (!body?.trim() || !person) return;
    setSaving(true);
    setError(null);
    const result = await db.comments.create({ issue: issueId, author: person.id, body: body.trim(), created_at: new Date().toISOString() });
    setSaving(false);
    if (result.ok) close();
    else setError(Object.values(result.error.fieldErrors)[0] ?? result.error.message);
  };

  const options = people.map((p) => ({ value: p.id, label: p.name ?? p.id }));
  const current = person ? { value: person.id, label: person.name ?? person.id } : null;

  return (
    <div style={{ display: "flex", gap: token("space.150"), marginTop: token("space.250") }}>
      <UserAvatar name={person?.name ?? null} initials={person?.initials} size="medium" />
      <div style={{ flex: 1, minWidth: 0 }}>
        {body === null ? (
          <button type="button" onClick={() => setBody("")} style={collapsed}>
            Add a comment…
          </button>
        ) : (
          <>
            <TextArea aria-label="Comment" autoFocus minimumRows={3} value={body} onChange={(e) => setBody(e.currentTarget.value)} />
            {error && <InlineError>{error}</InlineError>}
            <div style={actions}>
              <Button appearance="primary" isLoading={saving} isDisabled={!body.trim() || !person} onClick={() => void submit()}>
                Save
              </Button>
              <Button appearance="subtle" onClick={close}>
                Cancel
              </Button>
            </div>
          </>
        )}
        <div style={as}>
          <span>Commenting as</span>
          <div style={{ width: 200 }}>
            <Select aria-label="Commenting as" spacing="compact" options={options} value={current} onChange={(o) => o && choose(o.value)} />
          </div>
        </div>
      </div>
    </div>
  );
});

const collapsed = {
  display: "block",
  width: "100%",
  padding: `${token("space.100")} ${token("space.150")}`,
  border: `1px solid ${token("color.border.input")}`,
  borderRadius: token("radius.small"),
  background: token("color.background.input"),
  color: token("color.text.subtlest"),
  font: token("font.body"),
  textAlign: "left" as const,
  cursor: "text",
};
const actions = { display: "flex", gap: token("space.100"), marginTop: token("space.100") };
const as = {
  display: "flex",
  alignItems: "center",
  gap: token("space.100"),
  marginTop: token("space.100"),
  color: token("color.text.subtle"),
  font: token("font.body.small"),
};
