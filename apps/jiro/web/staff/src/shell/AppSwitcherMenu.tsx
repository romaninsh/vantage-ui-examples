// The app switcher's popup: the apps this site offers. Jiro is the only one,
// so its entry goes home and the rest of the menu is the app's own pages.
import { useNavigate } from "react-router";
import DropdownMenu, { DropdownItem, DropdownItemGroup } from "@atlaskit/dropdown-menu";
import { AppSwitcher } from "@atlaskit/navigation-system/top-nav-items";
import { JiroIcon } from "./JiroLogo";

const PAGES = [
  { label: "Issues", to: "/issues" },
  { label: "Board", to: "/board" },
  { label: "Sprints", to: "/sprints" },
  { label: "Activity", to: "/activity" },
  { label: "Projects", to: "/projects" },
  { label: "People", to: "/people" },
];

export function AppSwitcherMenu() {
  const navigate = useNavigate();
  return (
    <DropdownMenu<HTMLButtonElement>
      shouldRenderToParent
      trigger={({ triggerRef, ...props }) => <AppSwitcher {...props} ref={triggerRef} label="Switch apps" />}
    >
      <DropdownItemGroup title="Apps">
        <DropdownItem elemBefore={<JiroIcon />} description="Issues, boards and people" onClick={() => navigate("/")}>
          Jiro
        </DropdownItem>
      </DropdownItemGroup>
      <DropdownItemGroup title="Jiro" hasSeparator>
        {PAGES.map((p) => (
          <DropdownItem key={p.to} onClick={() => navigate(p.to)}>
            {p.label}
          </DropdownItem>
        ))}
      </DropdownItemGroup>
    </DropdownMenu>
  );
}
