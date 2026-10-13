import { describe, expect, it } from "vitest";
import { sortAtomicCssPlugin } from "../build/sortAtomicCss";

/** Runs the plugin's bundle hook over one CSS asset and returns its rules, one per line. */
function sorted(css: string): string[] {
  const bundle = { "style.css": { type: "asset", fileName: "style.css", source: css } };
  const hook = sortAtomicCssPlugin().generateBundle as (options: unknown, bundle: unknown) => void;
  hook({}, bundle);
  return String(bundle["style.css"].source).split(/(?<=\})(?=[.@])/);
}

describe("sortAtomicCssPlugin", () => {
  it("puts media queries after plain rules, narrow to wide", () => {
    const css = "@media (min-width:64rem){._b{display:initial}}@media (min-width:30rem){._c{display:block}}._a{display:none}";
    expect(sorted(css)).toEqual([
      "._a{display:none}",
      "@media (min-width:30rem){._c{display:block}}",
      "@media (min-width:64rem){._b{display:initial}}",
    ]);
  });

  it("orders pseudo-classes after the base, hover before active", () => {
    const css = "._x:active{color:red}._y:hover{color:blue}._z{color:green}._w:focus-visible{outline:0}";
    expect(sorted(css)).toEqual(["._z{color:green}", "._w:focus-visible{outline:0}", "._y:hover{color:blue}", "._x:active{color:red}"]);
  });

  it("puts a shorthand before its longhands", () => {
    const css = "._m{outline-color:red}._n{outline:0}";
    expect(sorted(css)).toEqual(["._n{outline:0}", "._m{outline-color:red}"]);
  });

  it("leaves other assets alone", () => {
    const bundle = { "main.js": { type: "chunk", fileName: "main.js", code: "x" } };
    (sortAtomicCssPlugin().generateBundle as (options: unknown, bundle: unknown) => void)({}, bundle);
    expect(bundle["main.js"].code).toBe("x");
  });
});
