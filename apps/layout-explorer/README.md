# Northwind Supply — a catalogue explorer

A small Vantage app that shows off a **data-driven tree** beside tabs, with a basket always on
screen: a product catalogue you browse like a file explorer. All the data is synthetic, so there
is nothing to install or connect.

## What to look at

- **A tree that follows the data.** `layout/explorer.yaml` builds the left tree from the category
  table (`source: { table: category }`). `parent: parent_id` nests each category under its
  parent. Branches run 2 to 5 levels deep: some aisles stop at a subcategory, others go down to
  narrow shelves such as Laptops → Accessories → Budget.
- **Click to open.** A category opens in a tab listing its products (`open: { page: category,
  args: … }`). The tree highlights the node whose tab is on screen.
- **Open a record.** In a category, double-click a product (or select it and press Open product)
  to open the product record: SKU, brand, price, stock, rating, launch date and description. The
  tab title reads the brand and product name.
- **A basket on the right.** `right: { view: basket }` keeps the basket in view whatever tab is
  open: its lines, the item count and the total, from `basket/basket_item.csv`.
- **A live count.** Low-stock alerts arrive every few seconds and clear again; the status bar
  counts them.
- **Live edits keep your place.** Change the tree's `caption:` and save: the open nodes stay open.

## Pages

- **Dashboard**: counts of categories, products and low-stock alerts.
- **Category**: one category's products, opened from the tree.
- **Product**: one product record.
- **All products**, **Stock alerts**, **About**: from the command palette (cmd-k).

## The data

- 5 top-level categories, branching 2 to 5 levels deep. A short script names them once at start,
  so every subcategory fits its category.
- 2 to 6 products in every category, at every level.
- A fixed basket of five catalogue products.
- A live feed of low-stock alerts, each kept for 25 to 45 seconds.
