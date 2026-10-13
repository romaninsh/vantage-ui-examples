// A person's avatar as Jira draws it without a photo: their initials on a
// colour picked from their name, so one person keeps one colour everywhere.
import Avatar from "@atlaskit/avatar";
import { token } from "@atlaskit/tokens";
import { accentOf } from "./accent";

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => w!.charAt(0).toUpperCase()).join("");
}

type Size = "xsmall" | "small" | "medium" | "large" | "xlarge";
/** Atlaskit's avatar diameters, and an initials size that fits each. */
const PIXELS: Record<Size, number> = { xsmall: 16, small: 24, medium: 32, large: 40, xlarge: 96 };
const FONT: Record<Size, number> = { xsmall: 7, small: 10, medium: 12, large: 15, xlarge: 34 };

type Props = {
  name: string | null;
  /** The person's initials from the API; made from `name` when not known. */
  initials?: string | null;
  size?: Size;
};

export function UserAvatar({ name, initials, size = "small" }: Props) {
  if (!name) return <Avatar size={size} label="Unassigned" />;
  return (
    <Avatar size={size} name={name} label={name}>
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: PIXELS[size],
          height: PIXELS[size],
          borderRadius: "50%",
          background: accentOf(name),
          color: token("color.text.inverse"),
          fontSize: FONT[size],
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {initials || initialsOf(name)}
      </span>
    </Avatar>
  );
}
