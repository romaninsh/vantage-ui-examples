# Agent skill (future)

`.rules` is the short working agreement for now. A fuller Claude **agent skill**
should supersede it once the suite matures, covering:

- end-to-end workflow for adding an app (inventory shape, offline-clean rule,
  schema references) and a scenario (step reuse, gherkin style);
- the MCP control surface as it grows (new tools beyond `list_logs`) and how to
  wrap them in the engine + steps;
- how to run, debug a failing scenario (child stderr, readiness timeouts), and
  interpret CI failures;
- the black-box constraint and why TestAppContext is out of bounds here.

Until then, keep `.rules` authoritative and in sync with how the repo actually
works.
