# Northwind Gym — drill-down

A small Vantage app with **no sidebar**: start on a hub of regions and drill down through the
gym chain. Each page opens on top of the one before; Back takes you out again. The data comes
from `faker`, fixed by a seed so it reads the same on every run.

- **Five levels deep.** Region › Club › Member › Visits › Payments. Every region runs 3–6
  clubs, every club has 6–12 members, every member 3–5 visits from the last four months, and
  every visit 1–2 charges. Each page lists only the children of the row you opened.
- **A stack of pages.** The header shows the trail, root first, for example
  `Regions › Peru › Iron Works › Ann Lee › Visits · Ann Lee`. Back (or a crumb) pops pages and
  unloads them. The status bar names the page on top and the id it was opened with.
- **Grids drill too.** On a member's visits, double-click a row (or select it and press
  *Payments*) to open what that visit was charged.
- **A modal that answers.** On a member, *Pick a colour*: the button you press is the answer,
  shown on the page.
- **A sheet.** *Notes* on a member slides in from the right; click beside it or press Escape
  to close it.
- **Jump anywhere.** cmd-k (or *Go to…* in the title bar) lists the menu's links and every
  page that needs no arguments.
- **Live edits keep your place.** Edit the layout file with a sheet open: stack and sheet stay.
