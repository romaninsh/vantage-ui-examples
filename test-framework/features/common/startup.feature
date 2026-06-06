Feature: App startup is clean

  Every example app must launch against its inventory, bring up the MCP
  server, finish loading the catalog, and log no ERROR-level events. This
  feature runs against every app under apps/.

  Scenario: launching the app produces no errors
    Given the vantage-ui app is launched
    When the app has finished starting up
    Then there are no error log entries
