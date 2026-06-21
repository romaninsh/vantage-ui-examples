Feature: space loads live data from the Launch Library 2 REST API

  space is the REST integration the launch-control example was modelled on: its
  datasources point at The Space Devs' Launch Library 2 dev API
  (https://lldev.thespacedevs.com) — a public, unauthenticated, paginated
  JSON API. Because the data is live and grows over time, these assertions are
  deliberately lower bounds (`> 0`), not exact counts: they prove the app
  reaches the API and reads real rows through it, while staying stable as the
  upstream catalogue changes. Reads are server-side (ll2, filter_strategy:
  query) to avoid the client-filtered join endpoints.

  Scenario: discover models and read live data with no errors
    Given the vantage-ui app is launched
    When the app has finished starting up
    Then there are no error log entries
    When the data tools are ready
    Then the model list includes "launches"
    And the model list includes "agencies"
    And the model list includes "astronauts"
    And the model list includes "pads"
    And the model list includes "payloads"
    # The API is actually reachable through the app and returns real rows.
    And the data script holds: table("launches").count() > 0
    And the data script holds: table("agencies").count() > 0
    And the data script holds: table("launches").list().len() > 0
    # Server-side drill-down: ll2 honors ?lsp__id= (provider -> launches), and
    # the filter genuinely discriminates. SpaceX (121) always has launches; a
    # large non-existent provider id is a valid integer that matches nothing
    # (so the API returns an empty set rather than a 400).
    And the data script holds: table("launches").add_condition_eq("lsp__id", 121).count() > 0
    And the data script holds: table("launches").add_condition_eq("lsp__id", 999999999).count() == 0
    # The whole exploration left no errors behind.
    Then there are no error log entries
