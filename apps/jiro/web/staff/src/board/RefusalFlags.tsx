// Atlaskit flags, bottom left, one per write the server refused. White flags
// with a red icon, as Jira shows them, so the message is visible unexpanded.
import { AutoDismissFlag, FlagGroup } from "@atlaskit/flag";
import ErrorIcon from "@atlaskit/icon/core/status-error";
import { token } from "@atlaskit/tokens";
import type { MoveRefusal } from "./useDragStatus";

export function RefusalFlags({ refusals, onDismiss }: { refusals: MoveRefusal[]; onDismiss: (id: number | string) => void }) {
  return (
    <FlagGroup onDismissed={onDismiss}>
      {refusals.map((r) => (
        <AutoDismissFlag
          key={r.id}
          id={r.id}
          icon={<ErrorIcon label="Error" color={token("color.icon.danger")} />}
          title={r.title}
          description={r.message}
        />
      ))}
    </FlagGroup>
  );
}
