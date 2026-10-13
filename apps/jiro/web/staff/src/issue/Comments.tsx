// The Activity section: the issue's comments, oldest first, each with the
// author's avatar, name and time, as Jira lists them.
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { PersonAvatar } from "../jira/PersonAvatar";
import { CommentComposer } from "./CommentComposer";
import { formatDateTime } from "../jira/format";
import type { Comments as Comment } from "../vantage.gen";

const CommentItem = observer(function CommentItem({ comment }: { comment: Comment }) {
  return (
    <li style={{ display: "flex", gap: token("space.150") }}>
      <PersonAvatar person={comment.author} name={comment.author_name} size="medium" />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: token("space.100"), alignItems: "baseline" }}>
          <strong>{comment.author_name ?? "Someone"}</strong>
          <span style={{ color: token("color.text.subtle"), font: token("font.body.small") }}>{formatDateTime(comment.created_at)}</span>
        </div>
        <p style={{ margin: `${token("space.050")} 0 0`, whiteSpace: "pre-wrap" }}>{comment.body}</p>
      </div>
    </li>
  );
});

export const Comments = observer(function Comments({ issueId }: { issueId: string }) {
  const db = useDb();
  const comments = useCollection(db.comments.where({ issue: issueId }).sort("created_at", "asc"));
  return (
    <section aria-label="Activity">
      <h2 style={heading}>Activity</h2>
      {comments.error ? (
        <p role="alert" style={{ color: token("color.text.danger") }}>
          {comments.error}
        </p>
      ) : comments.loadState === "loading" && comments.items.length === 0 ? (
        <Spinner size="small" label="Loading comments" />
      ) : comments.items.length === 0 ? (
        <p style={{ color: token("color.text.subtle") }}>No comments yet.</p>
      ) : (
        <ul style={list}>
          {comments.items.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </ul>
      )}
      <CommentComposer issueId={issueId} />
    </section>
  );
});

const heading = { font: token("font.heading.small"), margin: `${token("space.300")} 0 ${token("space.150")}` };
const list = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" as const, gap: token("space.250") };
