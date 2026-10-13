import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppProvider } from "@atlaskit/app-provider/app-provider";
import Spinner from "@atlaskit/spinner";
import { Layout } from "./shell/Layout";
import { RouterLink } from "./shell/RouterLink";

/** A page loaded on first visit, so each route is its own chunk. */
function page(load: () => Promise<Record<string, unknown>>, name: string) {
  const Page = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <Page />
    </Suspense>
  );
}

/**
 * The routes inside the app shell. AppProvider applies the Atlassian theme
 * and makes Atlaskit's own links (the sidebar's, the breadcrumbs') router
 * links, so they navigate without reloading the page.
 */
export function App() {
  return (
    <AppProvider defaultColorMode="light" routerLinkComponent={RouterLink}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/issues" replace />} />
          <Route path="issues" element={page(() => import("./pages/Issues"), "Issues")} />
          <Route path="issues/:key" element={page(() => import("./pages/IssueDetail"), "IssueDetail")} />
          <Route path="board" element={page(() => import("./pages/Board"), "Board")} />
          <Route path="sprints" element={page(() => import("./pages/Sprints"), "Sprints")} />
          <Route path="activity" element={page(() => import("./pages/Activity"), "Activity")} />
          <Route path="projects" element={page(() => import("./pages/Projects"), "Projects")} />
          <Route path="projects/:key" element={page(() => import("./pages/Project"), "Project")} />
          <Route path="projects/:key/sprints" element={page(() => import("./pages/Project"), "ProjectSprints")} />
          <Route path="people" element={page(() => import("./pages/People"), "People")} />
          <Route path="people/:id" element={page(() => import("./pages/Person"), "Person")} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
