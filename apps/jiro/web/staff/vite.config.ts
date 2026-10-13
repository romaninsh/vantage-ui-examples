import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sortAtomicCssPlugin } from "./build/sortAtomicCss";

/**
 * Library code goes into vendor chunks, each under Vite's 500 kB warning,
 * that change less often than the app. The chunks are layers of the package
 * dependency graph: a chunk imports only from the chunks listed before it.
 * (Chunks that import each other can run a module before one it needs is
 * initialised, which fails at load with "Cannot access … before initialization".)
 */
const LAYERS: [chunk: string, packages: RegExp][] = [
  ["react", /^(react|react-dom|scheduler|react-router|cookie|set-cookie-parser)$/],
  // Atlaskit components built on the base: buttons, icons, avatars, popups.
  [
    "atlaskit-ui",
    /^@atlaskit\/(heading|focus-ring|badge|spinner|banner|blanket|link|portal|textfield|layering|tile|top-layer|popper|menu|icon|motion|popup|avatar|tooltip|button)$/,
  ],
  // Components built on those: the navigation shell, menus, dialogs, flags, drag and drop.
  [
    "atlaskit-nav",
    /^@atlaskit\/(pragmatic-drag-and-drop|side-nav-items|lozenge|tag|flag|dropdown-menu|modal-dialog|breadcrumbs|navigation-system)$/,
  ],
  // Select and react-select: the filter bars and the Create dialog. (Their
  // emotion runtime stays in the base: some base components use it too.)
  ["atlaskit-select", /^(@atlaskit\/(select|react-select)|react-select)$/],
];

function vendorChunk(id: string): string | undefined {
  // Theme stylesheets load on demand, one per theme; leave them separate.
  if (/\/node_modules\/@atlaskit\/tokens\/.*\/themes\//.test(id)) return undefined;
  const pkg = /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1];
  if (!pkg) return undefined;
  // The base layer: tokens, primitives, the feature-flag client and every
  // other library the layers above build on.
  return LAYERS.find(([, packages]) => packages.test(pkg))?.[0] ?? "atlaskit-base";
}

export default defineConfig({
  plugins: [react(), sortAtomicCssPlugin()],
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
    // One stylesheet, so the atomic-CSS ordering below covers every rule:
    // a clash between two stylesheets would be decided by load order instead.
    cssCodeSplit: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // Atlaskit packages import their extracted CSS; let Vite handle those
    // imports instead of Node.
    server: { deps: { inline: [/@atlaskit\//, /@compiled\//] } },
  },
});
