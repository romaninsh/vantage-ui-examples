# Jiro staff web

The browser frontend for the `staff` API (`apps/jiro/api/staff.yaml`): issues, projects,
people, comments and sprints, served by the API at its own URL.

## Run it

Open the jiro project in Vantage and start the API, then start its frontend:

- in Services, press Start on the `staff-web` row, or
- ask the agent, which calls `web_dev_start staff`.

A Docker container installs the packages, generates `src/vantage.gen.ts` from the schema
Vantage writes to `schema.json`, and rebuilds `dist/` on every save. Open the page from the
API's row (Open in browser); it reloads after each successful build. Build errors show on
the row and in the `web:staff` feed. Nothing runs on your machine's Node.

## Actions

Both run on the server as runs:

- **Close issue** (the issue page, beside the status): asks first, then runs the issues
  page's `close_issue` row action.
- **Recalculate estimates** (a project's page): `action/recalculate-estimates.yaml` sets each
  epic's estimate to the sum of its children's points. A progress bar follows it, and its
  closing `notify` shows as a flag. A reload follows the same run.

## Tests

- Unit tests: `web_run staff npm test`.
- Type-check and full build: `web_run staff npm run build`.
- End to end: start the container with the Playwright image (`web_dev_start staff
  playwright: true`), then `web_run staff npx playwright test`. The tests reach the API
  through `VANTAGE_URL`, which that image sets.

## The client package

`@vantage-ui/client` comes from `vendor/vantage-ui-client-0.4.1.tgz` until it is published
to npm. It lives inside this folder because the container sees only `web/staff/`.
