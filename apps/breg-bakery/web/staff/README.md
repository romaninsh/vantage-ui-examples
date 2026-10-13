# Bakery staff web

The browser frontend for the `staff` API (`apps/breg-bakery/api/staff.yaml`): shops, their
products, clients, orders and invoices, served by the API at its own URL.

## Run it

Open the breg-bakery project in Vantage and start the API, then start its frontend:

- in Services, press Start on the `staff-web` row, or
- ask the agent, which calls `web_dev_start staff`.

A Docker container installs the packages, generates `src/vantage.gen.ts` from the schema
Vantage writes to `schema.json`, and rebuilds `dist/` on every save. Open the page from the
API's row (Open in browser); it reloads after each successful build. Build errors show on
the row and in the `web:staff` feed. Nothing runs on your machine's Node.

## Tests

- Unit tests: `web_run staff npm test`.
- Type-check and full build: `web_run staff npm run build`.
- End to end: start the container with the Playwright image (`web_dev_start staff
  playwright: true`), then `web_run staff npx playwright test`. The tests reach the API
  through `VANTAGE_URL`, which that image sets, and sign in as `leeds-token`, so the API
  must run under the `test` profile.

## Restocking

The panel at the bottom is a wizard over the bakeries page's "Restock bakery" row action
(`page/bakeries.yaml`): pick a bakery, tick its low-stock products, start, then confirm.
The run then bakes one product at a time; a progress bar follows it, a flag names each
product still low, and the summary shows at the end. A page reload follows the same run.

## The client package

`@vantage-ui/client` comes from `vendor/vantage-ui-client-0.4.1.tgz` until it is published
to npm. It lives inside this folder because the container sees only `web/staff/`.
