// The product mark: a brand-blue tile with two stacked chevrons, alone (the
// icon) or followed by the name (the logo), in the shapes the top nav takes.
import { token } from "@atlaskit/tokens";

export function JiroIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill={token("color.background.brand.bold")} />
      <path d="M7 8.5 12 13.5 17 8.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 12.5 12 17.5 17 12.5" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function JiroLogo() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: token("space.075") }}>
      <JiroIcon />
      <span style={{ font: token("font.heading.small"), color: token("color.text") }}>Jiro</span>
    </span>
  );
}
