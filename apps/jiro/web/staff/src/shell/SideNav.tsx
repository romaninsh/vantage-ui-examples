// The left sidebar: the app's pages, then every project as a space link.
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import BoardIcon from "@atlaskit/icon/core/board";
import FeedIcon from "@atlaskit/icon/core/feed";
import PeopleGroupIcon from "@atlaskit/icon/core/people-group";
import ProjectIcon from "@atlaskit/icon/core/project";
import SprintIcon from "@atlaskit/icon/core/sprint";
import WorkItemsIcon from "@atlaskit/icon/core/work-items";
import { SideNav as NavSideNav, SideNavBody } from "@atlaskit/navigation-system/layout/side-nav";
import { LinkMenuItem } from "@atlaskit/side-nav-items/link-menu-item";
import { MenuList } from "@atlaskit/side-nav-items/menu-list";
import { MenuSection, MenuSectionHeading } from "@atlaskit/side-nav-items/menu-section";
import { token } from "@atlaskit/tokens";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { ProjectTile } from "../jira/ProjectTile";

function NavLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const selected = pathname === to || pathname.startsWith(`${to}/`);
  return (
    <LinkMenuItem href={to} elemBefore={icon} isSelected={selected}>
      {children}
    </LinkMenuItem>
  );
}

const ProjectLinks = observer(function ProjectLinks() {
  const projects = useCollection(useDb().projects.all);
  if (projects.error) {
    return (
      <p role="alert" style={{ color: token("color.text.danger"), font: token("font.body.small"), padding: token("space.100") }}>
        Projects didn't load: {projects.error}
      </p>
    );
  }
  return (
    <MenuList>
      {projects.items.map((p) => (
        <NavLink key={p.id} to={`/projects/${p.key}`} icon={<ProjectTile projectKey={p.key ?? "?"} />}>
          {p.name}
        </NavLink>
      ))}
    </MenuList>
  );
});

const icon = (Icon: typeof BoardIcon) => <Icon label="" color={token("color.icon")} />;

export function SideNav() {
  return (
    <NavSideNav label="Jiro">
      <SideNavBody>
        <MenuList>
          <NavLink to="/issues" icon={icon(WorkItemsIcon)}>
            Issues
          </NavLink>
          <NavLink to="/board" icon={icon(BoardIcon)}>
            Board
          </NavLink>
          <NavLink to="/sprints" icon={icon(SprintIcon)}>
            Sprints
          </NavLink>
          <NavLink to="/activity" icon={icon(FeedIcon)}>
            Activity
          </NavLink>
          <NavLink to="/projects" icon={icon(ProjectIcon)}>
            Projects
          </NavLink>
          <NavLink to="/people" icon={icon(PeopleGroupIcon)}>
            People
          </NavLink>
        </MenuList>
        <MenuSection>
          <MenuSectionHeading>Spaces</MenuSectionHeading>
          <ProjectLinks />
        </MenuSection>
      </SideNavBody>
    </NavSideNav>
  );
}
