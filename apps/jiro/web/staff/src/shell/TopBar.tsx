// Jira Cloud's top navigation: sidebar toggle, app switcher and logo on the
// left; the issue-key search and Create in the middle; connection state,
// notifications, help, settings and the signed-in person on the right.
import { lazy, Suspense, useState } from "react";
import { SideNavToggleButton } from "@atlaskit/navigation-system/layout/side-nav";
import { TopNav, TopNavEnd, TopNavMiddle, TopNavStart } from "@atlaskit/navigation-system/layout/top-nav";
import { CreateButton, CustomLogo, Help, Notifications, Profile, Settings } from "@atlaskit/navigation-system/top-nav-items";
import { useConnection } from "@vantage-ui/client/react";
import { AppSwitcherMenu } from "./AppSwitcherMenu";
import { ConnectionLozenge } from "./ConnectionState";
import { IssueKeySearch } from "./IssueKeySearch";
import { JiroIcon, JiroLogo } from "./JiroLogo";

const NoBadge = () => null;

// The Create dialog (with its form controls) loads on the first click.
const CreateIssueModal = lazy(() => import("../create/CreateIssueModal").then((m) => ({ default: m.CreateIssueModal })));

export function TopBar() {
  const { principal } = useConnection();
  const [creating, setCreating] = useState(false);
  return (
    <TopNav>
      <TopNavStart sideNavToggleButton={<SideNavToggleButton collapseLabel="Collapse sidebar" expandLabel="Expand sidebar" />}>
        <AppSwitcherMenu />
        <CustomLogo href="/" label="Jiro home" logo={JiroLogo} icon={JiroIcon} />
      </TopNavStart>
      <TopNavMiddle>
        <IssueKeySearch />
        <CreateButton onClick={() => setCreating(true)}>Create</CreateButton>
      </TopNavMiddle>
      <TopNavEnd>
        <ConnectionLozenge />
        <Notifications label="Notifications" badge={NoBadge} />
        <Help label="Help" />
        <Settings label="Settings" />
        <Profile label={principal ? `Your profile (${principal})` : "Your profile"} />
      </TopNavEnd>
      {creating && (
        <Suspense fallback={null}>
          <CreateIssueModal onClose={() => setCreating(false)} />
        </Suspense>
      )}
    </TopNav>
  );
}
