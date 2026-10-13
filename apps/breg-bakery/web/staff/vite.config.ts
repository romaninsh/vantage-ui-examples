import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sortAtomicCssPlugin } from "./build/sortAtomicCss";

/**
 * Library code goes into vendor chunks, each under Vite's 500 kB warning,
 * that change less often than the app. The chunks are layers of the package
 * dependency graph, in this order: react → vendor (every other library) →
 * atlaskit → atlaskit-select. A chunk imports only from the layers before it,
 * so none runs before one it needs is initialised. A finer Atlaskit split
 * (as jiro has) made a cycle here: a base package imported a component
 * chunk, and the page failed at load ("reading 'tooltip'").
 *
 * The order of `LAYERS` is not the layer order: it only decides which regex
 * matches first (select before the `@atlaskit/` catch-all). A package that
 * matches none goes to `vendor`.
 */
const LAYERS: [chunk: string, packages: RegExp][] = [
  ["react", /^(react|react-dom|scheduler|react-router|cookie|set-cookie-parser)$/],
  ["atlaskit-select", /^(@atlaskit\/(select|react-select)|react-select)$/],
  ["atlaskit", /^@atlaskit\//],
];

function vendorChunk(id: string): string | undefined {
  // Theme stylesheets load on demand, one per theme; leave them separate.
  if (/\/node_modules\/@atlaskit\/tokens\/.*\/themes\//.test(id)) return undefined;
  const pkg = /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1];
  if (!pkg) return undefined;
  // Every other library (emotion, the vantage client, …): Atlaskit builds on them.
  return LAYERS.find(([, packages]) => packages.test(pkg))?.[0] ?? "vendor";
}

export default defineConfig({
  plugins: [react(), sortAtomicCssPlugin()],
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
    // One stylesheet, so the atomic-CSS ordering covers every rule.
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
