Feature: launch-control loads pre-seeded data through the bundled server

  launch-control points its single datasource at the bundled launch-control
  server (../server), an LL2-shaped REST API over a SQLite DB seeded from the
  committed fixtures. The harness builds, seeds, and serves it deterministically
  (--no-sim --error-rate 0), so these counts are exact and every read is stable.
  Each "holds:" line is the actual Rhai an agent would run, written as a
  self-asserting expression that must be true — and the app must log no errors
  throughout.

  Scenario: discover models and read seeded data with no errors
    Given the vantage-ui app is launched
    When the app has finished starting up
    Then there are no error log entries
    When the data tools are ready
    Then the model list includes "launches"
    And the model list includes "agencies"
    And the model list includes "payloads"
    And the model list includes "payload_flights"
    And the model list includes "astronauts"
    # Pre-seeded data is actually reachable through the app -> server -> SQLite.
    And the data script holds: table("launches").count() == 37
    And the data script holds: table("agencies").count() == 45
    And the data script holds: table("payloads").count() == 49
    And the data script holds: table("payload_flights").count() == 49
    And the data script holds: table("astronauts").count() == 40
    # The lazy window returns rows, capped at the test limit.
    And the data script holds: table("launches").list().len() > 0
    # Server-side drill-down: the bundled server honors ?lsp__id= (provider ->
    # launches), and the filter genuinely discriminates.
    And the data script holds: table("launches").add_condition_eq("lsp__id", 121).count() == 18
    And the data script holds: table("launches").add_condition_eq("lsp__id", "no-such-id").count() == 0
    # The whole exploration left no errors behind.
    Then there are no error log entries
