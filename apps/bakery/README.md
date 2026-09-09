# Breg

The back office of a bakery chain — six shops, a few hundred trade accounts,
a year of orders — and the example that exercises the widest slice of Vantage
in one app. This page is the repository's `README.md`, rendered by a
`kind: markdown` component.

## The process it models

An account **orders** from its shop. At the start of each month, everything
it took is consolidated into one **invoice**, payable in thirty days.
**Payments** arrive against invoices — in full, in part, or in instalments —
and what is still owed is never stored: it is worked out from the payments
every time it is read.

| Table | Holds | Derived on read |
|---|---|---|
| `order` | the lines (product, quantity, price in pence), fulfilment status | — |
| `invoice` | number, dates, the *frozen* total billed | `paid`, `outstanding`, `settlement` |
| `payment` | amount, method, date, the invoice it settles | — |
| `client` | the account | `order_count`, `invoice_count`, `balance` |

An issued invoice's `total` is stored on purpose: editing an order in March
must not change what was billed in January. Everything that genuinely
changes — what has been paid — is an `expr:` column, a correlated subquery
the database evaluates on every read.

## What each page shows off

- **Dashboard** — query-sourced tables (`revenue_by_day`, `product_units`,
  `client_balances`) feeding charts and lists; the aggregation is SurrealQL,
  the page only renders.
- **Clients** — `expr:` roll-up columns on a writable table; reference
  columns shown by title (`bakery.name`) rather than id; the **filter
  panel** (funnel, left of the search box) generated from
  `filter: [bakery, "~name"]`; a `send-password-reset` row action making an
  HTTP request with a Rhai-built body.
- **Products** — money columns (`unit: { currency: "£", minor_units: true }`);
  form, confirm and terminal actions; the CSV **import wizard** whose worker
  lives in `action/import-products.rhai`, spliced in with `!include`.
- **Orders** — lifecycle row actions gated by `when:` on the row's status;
  the `enum:` on `status` is what makes the form field a dropdown.
- **Invoices** — the settlement chips (`open` / `part_paid` / `overdue` /
  `settled`) coloured from a derived column; drill-downs to the invoice's
  orders and payments; a filter with a fixed operator (`">outstanding"`).
- **Payments** — the simplest table here, which is the point: a payment is
  one row against one invoice.

Right-click any row for its relations; column widths remember themselves;
applied filters come back as chips when a page reopens.

## Layout

The project root is the app directory itself: the kind directories sit
directly under it.

```
apps/bakery/
├── datasource/bakery-surreal.yaml
├── table/bakery-surreal/*.yaml     # 6 stored tables + 4 query-sourced
├── page/{dashboard,bakeries,clients,products,orders,invoices,payments,readme}.yaml
├── action/*.yaml                   # one per action kind, plus the worker .rhai
├── menu/left.yaml
├── scripts/bake-muffins.py         # what the terminal action runs
├── seed.py                         # the data generator
├── import-products.csv             # the wizard's input
└── README.md                       # this page
```

## Run it

The datasource connects on startup, so bring the database up first.

```sh
surreal start --user root --pass root
python3 apps/bakery/seed.py m        # 6 shops, 90 accounts, 4000 orders, a year
```

Then open the app:

```sh
vantage-ui apps/bakery
```

`seed.py xs` is a smoke-sized dataset and `seed.py xl` a stress one; `--wipe`
clears every generated table first. The seed also defines the foreign-key
indexes the `expr:` columns depend on — without them, opening the invoices
page took eighteen seconds.

Because it needs a database, this app carries a `.bdd-skip` and is left out
of the `--all` CI sweep. Run its scenarios explicitly once the database is up:

```sh
cargo run -p test-framework -- apps/bakery
```
