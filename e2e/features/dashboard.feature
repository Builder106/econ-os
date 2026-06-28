Feature: Dashboard boot and live kernel feed

  Scenario: Dashboard renders live kernel feed
    Given I am on the dashboard
    Then the macro chart is visible
    And the process explorer shows 12 agents
    And the kernel status shows LIVE
    And the macro values are populated
    And the step counter is advancing

  Scenario: Process Explorer shows correct role partition
    Given I am on the dashboard
    And the process explorer shows 12 agents
    Then there are 10 consumer agents
    And there are 2 producer agents

  Scenario: Macro chart canvas has been drawn to
    Given I am on the dashboard
    And the kernel status shows LIVE
    Then the chart canvas has visible data
