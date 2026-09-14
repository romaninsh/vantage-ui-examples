# Smith Requirements — `foundation`

> You are Agent Smith. You edit YAML files in `examples/surreal-bakery/`. Read this top to bottom
> first. Fill in "Notes" as you work.

## What you're building

Hill Valley Bakeries franchise admin dashboard — bare-bones. SurrealDB datasource, four tables
(bakery, client, product, order), list pages with row-click → detail-card navigation, left sidebar
menu. No filters, no dialogs, no dashboard KPIs — just data flowing.

## Prerequisites

- [ ] **SurrealDB reachable.** `surreal isready --endpoint cbor://localhost:8000`
- [ ] **SurrealDB has seed data.**
  ```
  surreal sql --endpoint cbor://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty \
    -e "SELECT count() AS c FROM bakery GROUP ALL"
  ```
- [ ] **vantage-ui running** with this inventory (`examples/surreal-bakery/`).

If any fails, stop and write in Notes. **Prerequisites not verified — no MCP tool available.**

### MCP tools

- `list_logs(level, limit)` — always available

## Tasks

After every save, call `list_logs(level="warn", limit=20)`. Fix errors before continuing.

### Datasource

- [x] **Task 1.** Create `datasource/bakery-surreal.yaml`.
      `examples/test1/datasource/bakery-surreal.yaml` (same connection). Add schema header:
      `# yaml-language-server: $schema=./datasource-schema-1.json`

### Tables

- [x] **Task 2.** Create `table/bakery.yaml`. Columns: id (string, id), name (string, title,
      searchable), profit_margin (int). has_many: client, product, order (foreign_key: bakery).
      Datasource: bakery-surreal. Model: `examples/test1/table/client.yaml`.

- [x] **Task 3.** Create `table/client.yaml`. Columns: id (string, id), name (string, title,
      searchable), email (string, searchable), contact_details (string), is_paying_client (bool,
      default false), balance (decimal, default 0), bakery (string, references bakery), metadata
      (any, optional). Datasource: bakery-surreal.

- [x] **Task 4.** Create `table/product.yaml`. Columns: id (string, id), name (string, title,
      searchable), calories (int), price (int), bakery (string, references bakery), is_deleted
      (bool, default false), inventory (any, optional — embedded {stock: int}). Datasource:
      bakery-surreal.

- [x] **Task 5.** Create `table/order.yaml`. Columns: id (string, id), bakery (string, references
      bakery), is_deleted (bool, default false), created_at (datetime), lines (any — embedded
      array). Datasource: bakery-surreal. No client reference (graph-edge, §2b).

### Pages — lists

- [x] **Task 6.** Create `page/bakeries.yaml`. Crud, spot: body, table: bakery. Row action: Open
      (primary, navigate bakery-detail, args: { id: row.id }). Model:
      `examples/test1/page/clients.yaml`.

- [x] **Task 7.** Create `page/clients.yaml`. Same shape, table: client, navigate: client-detail.

- [x] **Task 8.** Create `page/products.yaml`. Same shape, table: product, navigate: product-detail.

- [x] **Task 9.** Create `page/orders.yaml`. Same shape, table: order, navigate: order-detail.

### Pages — details

- [x] **Task 10.** Create `page/bakery-detail.yaml`. Title: Bakery. Args: id (string, required).
      Card, spot: body, table: bakery, record_id: args.id. Model:
      `examples/test1/page/client-overview.yaml`.

- [x] **Task 11.** Create `page/client-detail.yaml`. Same, table: client.

- [x] **Task 12.** Create `page/product-detail.yaml`. Same, table: product.

- [x] **Task 13.** Create `page/order-detail.yaml`. Same, table: order.

### Menu

- [x] **Task 14.** Create `menu/left.yaml`. Title: Hill Valley Bakeries. Items: Bakeries (Inbox),
      Clients (User), Products (Star), Orders (ChevronRight). Model:
      `examples/spacex/menu/left.yaml`.

### Discovering schema

```
surreal sql --endpoint cbor://localhost:8000 --user root --pass root --ns bakery --db v2 --pretty \
  -e "SELECT * FROM <table> LIMIT 3"
```

Prefer `SELECT * LIMIT 3` over `INFO FOR TABLE`. Don't add `DEFINE FIELD`.

## Reference files

| File                                            | What it shows                   |
| ----------------------------------------------- | ------------------------------- |
| `examples/test1/datasource/bakery-surreal.yaml` | SurrealDB datasource            |
| `examples/test1/table/client.yaml`              | SurrealDB table with references |
| `examples/test1/page/clients.yaml`              | Crud list with row_actions      |
| `examples/test1/page/client-overview.yaml`      | Detail card with args           |
| `examples/spacex/table/capsules.yaml`           | Table-level has_many            |
| `examples/spacex/menu/left.yaml`                | Sidebar menu                    |
| `datasource/datasource-schema-1.json`           | Datasource schema               |
| `table/table-schema-1.json`                     | Table schema                    |
| `page/page-schema-1.json`                       | Page schema                     |
| `menu/menu-schema-1.json`                       | Menu schema                     |

## Acceptance criteria

- [x] All 14 tasks ticked.
- [ ] `list_logs(level="warn", limit=20)` empty.
- [ ] Four sidebar items visible: Bakeries, Clients, Products, Orders.
- [ ] Each opens a list page with rows from SurrealDB.
- [ ] Row click opens detail card.
- [ ] No WARN/ERROR in logs.

## Follow-up: type fixes needed

Vantage rejects `type: any` columns. These three tables need `any` → `string`:

- [x] **Fix 1.** `table/client.yaml` — column `metadata`: change `type: any` to `type: string`
- [x] **Fix 2.** `table/product.yaml` — column `inventory`: change `type: any` to `type: string`
- [x] **Fix 3.** `table/order.yaml` — column `lines`: change `type: any` to `type: string`

After fixing, check MCP: `list_logs(level="warn", limit=20)`. Should be empty of errors.

## Notes

Blockers, guesses, surprises, workarounds, suggestions.

(Empty until you start.)
