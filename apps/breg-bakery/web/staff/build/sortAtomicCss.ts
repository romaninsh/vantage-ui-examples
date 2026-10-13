// A Vite build plugin that orders the final stylesheet the way Compiled's own
// bundler extractors do, with Compiled's own `sort`. Atlaskit ships its styles
// as atomic classes, one declaration each, and relies on order to resolve
// clashes on one element: shorthands before longhands, plain rules before
// pseudo-classes (so :hover beats the base), then at-rules. Concatenating each
// component's stylesheet in import order breaks that. (The same plugin as
// apps/jiro/web/staff/build/sortAtomicCss.ts.)
import { sort } from "@compiled/css";
import type { Plugin } from "vite";

export function sortAtomicCssPlugin(): Plugin {
  return {
    name: "breg:sort-atomic-css",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css")) file.source = sort(String(file.source));
      }
    },
  };
}
