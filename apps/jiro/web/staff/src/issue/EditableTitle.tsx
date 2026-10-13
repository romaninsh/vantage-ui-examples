// The issue's summary as Jira's issue view has it: a heading that turns into
// a text field on click. Enter or leaving the field saves, Esc cancels. An
// empty summary isn't saved; a refusal shows the server's message under it
// and the heading goes back to the old summary.
import { useRef, useState } from "react";
import Heading from "@atlaskit/heading";
import Spinner from "@atlaskit/spinner";
import Textfield from "@atlaskit/textfield";
import { token } from "@atlaskit/tokens";
import { observer } from "@vantage-ui/client/react";
import type { Issues } from "../vantage.gen";
import { InlineError } from "./InlineError";
import { useIssueEdit } from "./useIssueEdit";

export const EditableTitle = observer(function EditableTitle({ issue }: { issue: Issues }) {
  const { save, saving, error, clearError } = useIssueEdit(issue, "title");
  const [value, setValue] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const editing = value !== null;

  // Enter and Esc close the field, which then blurs; this stops that blur
  // from saving a second time, or saving after a cancel.
  const closed = useRef(true);

  const start = () => {
    clearError();
    closed.current = false;
    setValue(issue.title ?? "");
  };
  const cancel = () => {
    closed.current = true;
    setEmpty(false);
    setValue(null);
  };
  const commit = async () => {
    if (closed.current || value === null) return;
    const title = value.trim();
    if (!title) return setEmpty(true);
    cancel();
    if (title !== issue.title) await save(title);
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {editing ? (
        <Textfield
          aria-label="Summary"
          autoFocus
          value={value}
          isInvalid={empty}
          onChange={(e) => setValue(e.currentTarget.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") cancel();
          }}
          style={{ font: token("font.heading.large") }}
        />
      ) : (
        <button type="button" aria-label="Edit summary" onClick={start} style={heading}>
          <Heading size="large" as="h1">
            {issue.title}
          </Heading>
          {saving && <Spinner size="small" label="Saving summary" />}
        </button>
      )}
      {empty && <InlineError>Summary is required.</InlineError>}
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
});

const heading = {
  display: "flex",
  alignItems: "center",
  gap: token("space.100"),
  width: "100%",
  padding: `${token("space.025")} ${token("space.050")}`,
  margin: `0 calc(-1 * ${token("space.050")})`,
  border: 0,
  borderRadius: token("radius.small"),
  background: "none",
  textAlign: "left" as const,
  cursor: "text",
};
