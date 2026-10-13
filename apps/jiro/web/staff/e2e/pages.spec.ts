// Every list page against the live jiro API: each shows the server's rows,
// and every sort and filter goes to the server as an `open_table`.
import { expect, test } from "@playwright/test";
import { column, openedTables, rows } from "./lists";
import { issueTotal } from "./liveDb";

test("shell: the sidebar and the top bar's icons show on a desktop screen", async ({ page }) => {
  await page.goto("/issues");
  const sidebar = page.getByRole("navigation", { name: "Jiro" });
  await expect(sidebar).toBeVisible();
  for (const name of ["Issues", "Board", "Sprints", "Activity", "Projects", "People"]) await expect(sidebar.getByRole("link", { name })).toBeVisible();
  for (const name of ["Notifications", "Help", "Settings"]) await expect(page.getByRole("button", { name })).toBeVisible();
  await sidebar.getByRole("link", { name: "Sprints" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sprints" })).toBeVisible();
});

test("footers: a count only when the server confirms it, otherwise N+", async ({ page }) => {
  const total = await issueTotal();
  await page.goto("/issues");
  const footer = page.getByText(/^\d+\+? issues$/);
  await expect(footer).toBeVisible();
  const text = await footer.innerText();
  // A whole-list count must be the real one; an estimate must say so.
  if (!text.endsWith("+ issues")) expect(text).toBe(`${total} issues`);
  await page.goto("/sprints");
  await expect(page.getByText("7 sprints", { exact: true })).toBeVisible();
});

test("projects: the server's order, re-sorted by the server", async ({ page }) => {
  const opened = openedTables(page);
  await page.goto("/projects");
  await expect(rows(page, "Projects")).toHaveCount(4);
  expect(await column(page, "Projects", 1)).toEqual(["BOOK", "DEPLOY", "PAY", "WEB"]);
  await page.getByRole("table", { name: "Projects" }).getByRole("button", { name: "Name" }).click();
  // A name cell is the project's tile letter, then its name.
  const names = async () => (await column(page, "Projects", 0)).map((cell) => cell.split("\n").pop());
  await expect.poll(names).toEqual(["Harbor Payments", "Kestrel Deploy", "Kestrel Website", "Northwind Booking App"]);
  expect(opened).toContainEqual(expect.objectContaining({ table: "projects", sort: ["name", "asc"] }));
});

test("project page: its issues and its sprints, through the project", async ({ page }) => {
  const opened = openedTables(page);
  await page.goto("/projects");
  await page.getByRole("table", { name: "Projects" }).getByRole("link", { name: "Northwind Booking App" }).click();
  await expect(page).toHaveURL(/\/projects\/BOOK$/);
  // The project is found by key on the server, not searched for in the browser.
  await expect.poll(() => opened.some((f) => f.table === "projects" && JSON.stringify(f.where) === '[["key","eq","BOOK"]]')).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Northwind Booking App" })).toBeVisible();
  await expect(rows(page, "Issues").first()).toBeVisible();
  for (const key of await column(page, "Issues", 1)) expect(key).toMatch(/^BOOK-\d+$/);
  expect(opened).toContainEqual(expect.objectContaining({ table: "issues", via: expect.objectContaining({ table: "projects", ref: "issues" }) }));

  await page.getByRole("navigation", { name: "Project views" }).getByRole("link", { name: "Sprints" }).click();
  await expect(rows(page, "Sprints")).toHaveCount(3);
  expect((await column(page, "Sprints", 0)).sort()).toEqual(["BOOK Sprint 6", "BOOK Sprint 7", "BOOK Sprint 8"]);
  expect(opened).toContainEqual(expect.objectContaining({ table: "sprints", via: expect.objectContaining({ table: "projects", ref: "sprints" }) }));
});

test("people: a card per person, opening their assigned issues", async ({ page }) => {
  const opened = openedTables(page);
  await page.goto("/people");
  const directory = page.getByRole("list", { name: "People" });
  await expect(directory.getByRole("listitem")).toHaveCount(9);
  await directory.getByRole("listitem", { name: "Ana Kovač" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/people\/mem-ana$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ana Kovač" })).toBeVisible();
  await expect(rows(page, "Issues").first()).toBeVisible();
  const assignees = await column(page, "Issues", 4);
  expect(assignees.length).toBeGreaterThan(0);
  for (const name of assignees) expect(name).toContain("Ana Kovač");
  expect(opened).toContainEqual(expect.objectContaining({ table: "issues", via: expect.objectContaining({ table: "users", ref: "assigned" }) }));
});

test("sprints: every project's sprints, narrowed by state on the server", async ({ page }) => {
  const opened = openedTables(page);
  await page.goto("/sprints");
  await expect(rows(page, "Sprints")).toHaveCount(7);
  await page.getByRole("group", { name: "Sprint state" }).getByRole("button", { name: "Active" }).click();
  await expect(rows(page, "Sprints")).toHaveCount(3);
  expect(new Set(await column(page, "Sprints", 2))).toEqual(new Set(["Active"]));
  expect(opened).toContainEqual(expect.objectContaining({ table: "sprints", where: [["state", "in", ["active"]]], sort: ["start_date", "desc"] }));
});

test("activity: recent comments across issues, newest first from the server", async ({ page }) => {
  const opened = openedTables(page);
  await page.goto("/activity");
  await expect(rows(page, "Activity").first()).toBeVisible();
  // The issue link reads "<type> <key> <summary>".
  await expect(rows(page, "Activity").first().getByRole("link", { name: /\b[A-Z]+-\d+\b/ })).toBeVisible();
  const posted = (await column(page, "Activity", 0)).map((t) => Date.parse(t));
  expect(posted.every((t, i) => i === 0 || t <= posted[i - 1]!)).toBe(true);
  expect(opened).toContainEqual(expect.objectContaining({ table: "comments", sort: ["created_at", "desc"] }));
});

test("board: cards in a column per status, from a collection per status", async ({ page }) => {
  const total = await issueTotal();
  const opened = openedTables(page);
  await page.goto("/board");
  const names = ["Backlog", "To Do", "In Progress", "In Review", "Done", "Won't Do"];
  for (const name of names) await expect(page.getByRole("region", { name })).toBeVisible();
  await expect(page.getByRole("region", { name: "In Progress" }).locator("[data-issue]").first()).toBeVisible();
  let cards = 0;
  for (const name of names) {
    const heading = await page.getByRole("region", { name }).getByRole("heading").innerText();
    cards += Number(heading.split(/\s+/).pop());
  }
  // Every issue has a status, so the columns hold every issue between them.
  expect(cards).toBe(total);
  expect(opened).toContainEqual(expect.objectContaining({ table: "issues", where: [["status", "eq", "in_progress"]] }));
});
