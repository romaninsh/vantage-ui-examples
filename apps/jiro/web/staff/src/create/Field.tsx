// A labelled form row with the server's message for that field under it.
import { useId, type ReactNode } from "react";
import { token } from "@atlaskit/tokens";

type Props = { label: string; required?: boolean; error?: string; children: (id: string) => ReactNode };

export function Field({ label, required, error, children }: Props) {
  const id = useId();
  return (
    <div style={{ marginBottom: token("space.200") }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: token("space.050"), font: token("font.body.small"), fontWeight: 600, color: token("color.text.subtle") }}>
        {label}
        {required && <span style={{ color: token("color.text.danger") }}> *</span>}
      </label>
      {children(id)}
      {error && <div style={{ marginTop: token("space.050"), color: token("color.text.danger"), font: token("font.body.small") }}>{error}</div>}
    </div>
  );
}
