// A Vite build plugin that orders the final stylesheet the way Compiled's own
// bundler extractors do, with Compiled's own `sort`. Atlaskit ships its styles
// as atomic classes, one declaration each, and relies on order to resolve
// clashes on one element: shorthands before longhands, plain rules before
// pseudo-classes (so :hover beats the base), then at-rules, with `min-width`
// media queries from narrow to wide (so a desktop rule beats the mobile
// default). Concatenating each component's stylesheet in import order breaks
// that: a later component's `display:none` lands after an earlier one's
// `@media (min-width:64rem){…display:initial}`, and the side navigation never
// shows.
import { sort } from "@compiled/css";
import type { Plugin } from "vite";

export function sortAtomicCssPlugin(): Plugin {
  return {
    name: "jiro:sort-atomic-css",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css")) file.source = sort(String(file.source));
      }
    },
  };
}
