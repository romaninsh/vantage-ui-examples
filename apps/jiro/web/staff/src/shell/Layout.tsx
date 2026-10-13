// The page frame, from Atlaskit's navigation system: the top nav across, an
// error banner under it when the server has refused the connection, the
// collapsible sidebar, and the routed page in the main area.
import { Suspense } from "react";
import { Outlet } from "react-router";
import { Banner } from "@atlaskit/navigation-system/layout/banner";
import { Main } from "@atlaskit/navigation-system/layout/main";
import { Root } from "@atlaskit/navigation-system/layout/root";
import Spinner from "@atlaskit/spinner";
import { token } from "@atlaskit/tokens";
import { ConnectionBanner, useConnectionRefused } from "./ConnectionState";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import "./shell.css";

/**
 * For pages that fill the main area and scroll inside themselves (the issue
 * list, the board); other pages scroll the main area.
 */
export const fullHeight = { display: "flex", flexDirection: "column" as const, height: "100%", minHeight: 0 };

export function Layout() {
  const refused = useConnectionRefused();
  return (
    <Root>
      {refused && (
        <Banner>
          <ConnectionBanner />
        </Banner>
      )}
      <TopBar />
      <SideNav />
      <Main>
        <div className="jiro-main" style={main}>
          <Suspense fallback={<Spinner label="Loading page" />}>
            <Outlet />
          </Suspense>
        </div>
      </Main>
    </Root>
  );
}

const main = {
  height: "100%",
  boxSizing: "border-box" as const,
  padding: `${token("space.300")} ${token("space.400")} 0`,
  overflow: "auto",
};
