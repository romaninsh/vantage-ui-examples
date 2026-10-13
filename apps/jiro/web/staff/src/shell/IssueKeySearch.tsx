// The top bar's search field. The API has no text search, so it jumps to an
// issue by key: Enter on "JIR-12" opens /issues/JIR-12.
import { useState } from "react";
import { useNavigate } from "react-router";
import SearchIcon from "@atlaskit/icon/core/search";
import Textfield from "@atlaskit/textfield";
import { token } from "@atlaskit/tokens";

export function IssueKeySearch() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();
  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <Textfield
        aria-label="Go to issue key"
        placeholder="Go to issue key"
        isCompact
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          const key = value.trim().toUpperCase();
          if (e.key !== "Enter" || !key) return;
          navigate(`/issues/${encodeURIComponent(key)}`);
          setValue("");
        }}
        elemBeforeInput={
          <span style={{ display: "inline-flex", paddingInlineStart: token("space.100") }}>
            <SearchIcon label="" color={token("color.icon.subtle")} />
          </span>
        }
      />
    </div>
  );
}
