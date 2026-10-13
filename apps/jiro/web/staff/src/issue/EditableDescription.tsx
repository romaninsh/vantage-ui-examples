// The issue's description as Jira's issue view has it: the text (or a
// placeholder) that becomes a text area with Save and Cancel on click. A
// refusal keeps the editor open with the server's message, and the issue
// itself goes back to the old description.
import { useState } from "react";
import Button from "@atlaskit/button/new";
import TextArea from "@atlaskit/textarea";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import type { Issues } from "../vantage.gen";
import { InlineError } from "./InlineError";
import { useIssueEdit } from "./useIssueEdit";

export const EditableDescription = observer(function EditableDescription({ issue }: { issue: Issues }) {
  const { save, saving, error, clearError } = useIssueEdit(issue, "description");
  const [value, setValue] = useState<string | null>(null);

  const start = () => {
    clearError();
    setValue(issue.description ?? "");
  };
  const submit = async () => {
    if (value === null) return;
    const text = value.trim() ? value : null;
    if (text === issue.description || (await save(text))) setValue(null);
  };

  return (
    <section aria-label="Description">
      <h2 style={sectionHeading}>Description</h2>
      {value === null ? (
        <button type="button" aria-label="Edit description" onClick={start} style={view}>
          {issue.description ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{issue.description}</span>
          ) : (
            <span style={{ color: token("color.text.subtlest") }}>Add a description…</span>
          )}
        </button>
      ) : (
        <>
          <TextArea
            aria-label="Description"
            autoFocus
            minimumRows={5}
            resize="vertical"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Escape" && setValue(null)}
          />
          {error && <InlineError>{error}</InlineError>}
          <div style={actions}>
            <Button appearance="primary" isLoading={saving} onClick={() => void submit()}>
              Save
            </Button>
            <Button appearance="subtle" onClick={() => setValue(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </section>
  );
});

const sectionHeading = { font: token("font.heading.small"), margin: `0 0 ${token("space.100")}` };
const view = {
  display: "block",
  width: "100%",
  minHeight: 40,
  padding: token("space.100"),
  margin: `0 calc(-1 * ${token("space.100")})`,
  border: 0,
  borderRadius: token("radius.small"),
  background: "none",
  font: token("font.body"),
  color: token("color.text"),
  textAlign: "left" as const,
  cursor: "text",
};
const actions = { display: "flex", gap: token("space.100"), marginTop: token("space.100") };
