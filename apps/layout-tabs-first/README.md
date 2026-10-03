# Northwind Support — tabs first

A small Vantage app with **no sidebar**: every page is a tab in the title bar, like a browser.
All the data comes from the `faker` datasource, so there is nothing to install or connect.

## What to look at

- **Tabs in the title bar.** `placement: title_bar`; "+" opens the launcher, whose buttons open
  pages in new tabs.
- **One tab per ticket.** `key: 'page + ":" + args.id'`: right-click a ticket in the queue and
  choose Open ticket — open the same one twice and its tab comes forward instead of duplicating.
- **Readable titles.** `title: 'args.name ?? page_title'`: the queue and a customer's ticket list
  pass the ticket's subject as the tab title; opened without one, a tab just reads "Ticket
  <id>".
- **At most six tabs.** A seventh closes the tab you used longest ago; pinned tabs never close.
  cmd-shift-t reopens the last closed tab.
- **The project switcher moved.** With no sidebar it sits at the left of the title bar, next to
  the environment marker (DEV, or PROD with VANTAGE_PROFILE=prod).
- **A live count in the status bar.** "New tickets waiting" reads off the `incoming` table, a
  `fifo` feed that keeps arriving and expiring on its own.

## The data

Customers, agents and tickets are all synthetic (`faker`). Every ticket fans out unevenly over
the customers (one to eight tickets each), so every customer has something to show; agents are
assigned to tickets in a fixed rotation. A separate `incoming` feed simulates tickets landing in
real time, independent of the queue.

## Pages

Launcher, Dashboard (live counts), Tickets (the queue — right-click a row to open it), Customers
(open one to see their tickets), Agents, New tickets (live, a fifo feed), About (this file).
