Feature: MCP data tools over a mock REST backend

  space-mock points its datasources at the in-process fake LL2 server, so
  these results are deterministic. Each "holds:" line is the actual Rhai an
  agent would run, written as a self-asserting expression that must be true —
  and the app must log no errors throughout.

  Scenario: discover, fetch, and drill down with no errors
    Given the vantage-ui app is launched
    When the app has finished starting up
    Then there are no error log entries
    When the data tools are ready
    Then the model list includes "launches"
    And the model list includes "agencies"
    And the model list includes "payload_flights"
    # Direct fetch from the (mock) API: full count + lazy window.
    And the data script holds: table("launches").count() == 5
    And the data script holds: table("launches").list().len() == 5
    # Query-filter drill-down: agencies -> launches via ?lsp__id=.
    And the data script holds: table("launches").add_condition_eq("lsp__id", 1).count() == 2
    # Client-filter drill-down: launches -> payload_flights via nested launch.id.
    And the data script holds: table("payload_flights").add_condition_eq("launch.id", "l1").list().len() == 2
    # ...and the dotted filter genuinely discriminates.
    And the data script holds: table("payload_flights").add_condition_eq("launch.id", "nope").list().len() == 0
    # Load-then-traverse: pick a flight, list all flights of its launch.
    And the data script holds: let pf = table("payload_flights").get_some(); table("payload_flights").add_condition_eq("launch.id", pf.launch.id).list().len() >= 1
    # Cache mode on a model whose page was never opened errors clearly.
    When the cache-mode data script fails: table("payloads").list()
    Then the error mentions "not currently open"
    # The whole exploration left no errors behind.
    Then there are no error log entries
