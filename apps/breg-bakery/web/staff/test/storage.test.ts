import { describe, expect, it } from "vitest";
import { storageName } from "../src/storage";

describe("principal storage", () => {
  it("names the database after a SHA-256 of the token, never the token", async () => {
    const name = await storageName("leeds-token");
    expect(name).toMatch(/^breg-[0-9a-f]{32}$/);
    expect(name).not.toContain("leeds");
    expect(await storageName("leeds-token")).toBe(name);
    expect(await storageName("hq-token")).not.toBe(name);
  });
});
