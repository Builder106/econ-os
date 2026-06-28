Feature: Admin shell and Policy Manager

  Background:
    Given I am on the dashboard with the shell open

  Scenario: Visitor is denied admin commands until sudo elevates
    When I run the command "tax 50"
    Then the shell output contains "requires admin"
    When I elevate with the admin token
    Then the shell output contains "admin enabled"

  Scenario: Admin tax command propagates to Policy Manager UI
    Given I have elevated with the admin token
    When I run the command "tax 25"
    Then the shell output contains "tax_rate"
    And the Policy Manager shows "25.00%"
    And the Policy Manager shows admin auth status

  Scenario: Admin shock fires a broadcast event
    Given I have elevated with the admin token
    When I run the command "shock wage 10"
    Then the shell output contains "queued wage shock"
    And the shell output contains "[ADMIN] shock_applied"

  Scenario: Policy Manager slider issues tax command
    Given I have elevated with the admin token
    And the Policy Manager is open
    When I set the tax slider to "40"
    Then the Policy Manager shows "40.00%"

  Scenario: Unknown command returns a helpful error
    When I run the command "frobnicate the kernel"
    Then the shell output contains "unknown command"

  Scenario: Sudo with wrong token does not elevate
    When I run the command "sudo definitely-wrong"
    Then the shell output contains "invalid token"
    When I run the command "tax 5"
    Then the shell output contains "requires admin"
