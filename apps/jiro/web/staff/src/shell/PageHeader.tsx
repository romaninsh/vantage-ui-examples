// The top of every page, as Jira lays it out: breadcrumbs, then the title
// with anything the page puts beside it (a tile before, actions after).
import type { ReactNode } from "react";
import Heading from "@atlaskit/heading";
import { token } from "@atlaskit/tokens";
import { Crumbs, type Crumb } from "./Crumbs";

type Props = {
  title: ReactNode;
  crumbs: Crumb[];
  /** Shown before the title, such as a project tile or a person's avatar. */
  before?: ReactNode;
  /** Shown after the title, such as a status lozenge or a filter. */
  children?: ReactNode;
};

export function PageHeader({ title, crumbs, before, children }: Props) {
  return (
    <>
      <Crumbs items={crumbs} />
      <div style={row}>
        {before}
        <Heading size="large" as="h1">
          {title}
        </Heading>
        {children}
      </div>
    </>
  );
}

const row = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: token("space.150"),
  margin: `${token("space.100")} 0 ${token("space.200")}`,
};
