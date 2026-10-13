// A project's (Jira "space") avatar: its key's first letter on a tile whose
// accent colour is picked from the key.
import { token } from "@atlaskit/tokens";
import { accentOf } from "./accent";

export function ProjectTile({ projectKey, size = 20 }: { projectKey: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: token("radius.small"),
        background: accentOf(projectKey),
        color: token("color.text.inverse"),
        fontSize: Math.round(size * 0.55),
        fontWeight: 600,
      }}
    >
      {projectKey.slice(0, 1)}
    </span>
  );
}
