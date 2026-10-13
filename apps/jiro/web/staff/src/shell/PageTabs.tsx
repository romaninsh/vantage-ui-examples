// A page's horizontal navigation, as Jira draws it under a project's title:
// router links with a blue underline under the current one.
import { Link, useLocation } from "react-router";
import { token } from "@atlaskit/tokens";

export type Tab = { label: string; to: string };

export function PageTabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label} style={bar}>
      {tabs.map((t) => {
        const current = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={current ? "page" : undefined}
            style={{
              ...tab,
              color: current ? token("color.text.selected") : token("color.text.subtle"),
              borderBottomColor: current ? token("color.border.selected") : "transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const bar = {
  display: "flex",
  gap: token("space.200"),
  borderBottom: `2px solid ${token("color.border")}`,
  marginBottom: token("space.200"),
};
const tab = {
  padding: `${token("space.075")} 0`,
  marginBottom: -2,
  borderBottom: "2px solid",
  font: token("font.body"),
  fontWeight: token("font.weight.medium"),
  textDecoration: "none",
};
