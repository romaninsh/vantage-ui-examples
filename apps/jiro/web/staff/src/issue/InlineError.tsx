// A server's refusal (or a field rule) shown right under the control it is about.
import type { ReactNode } from "react";
import ErrorIcon from "@atlaskit/icon/core/status-error";
import { token } from "@atlaskit/tokens";

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={style}>
      <ErrorIcon label="" color={token("color.icon.danger")} size="small" />
      {children}
    </p>
  );
}

const style = {
  display: "flex",
  alignItems: "center",
  gap: token("space.050"),
  margin: `${token("space.050")} 0 0`,
  color: token("color.text.danger"),
  font: token("font.body.small"),
};
