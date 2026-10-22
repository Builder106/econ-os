Feature: One shared economy with an admin boundary
  Every viewer watches the same kernel. Only a session that passed sudo can change it,
  and its change reaches every other viewer within one tick.

  Scenario: An admin tax change reaches another viewer within one tick
    Given two viewers have the desktop open
    When the first viewer runs "sudo test-token" in the shell
    And the first viewer runs "tax 25" in the shell
    Then the second viewer's bar shows "tax 25.00%" within one tick
    And the second viewer's events show "tax rate 25.00% by admin"
    And the first viewer's shell shows "tax_rate → 25.00%"

  Scenario: An admin shock is broadcast to every viewer
    Given two viewers have the desktop open
    When the first viewer runs "sudo test-token" in the shell
    And the first viewer runs "shock price 10" in the shell
    Then the second viewer's events show "price shock +10.00% by admin"
    And the second viewer's bar notice mentions "shock applied"

  Scenario: A wrong token leaves the session read-only
    Given one viewer has the desktop open
    When the first viewer runs "sudo not-the-token" in the shell
    Then the first viewer's shell shows "invalid token"
    And the first viewer's shell never shows "not-the-token"
    And the first viewer is a visitor with locked policy controls
    When the first viewer runs "tax 40" in the shell
    Then the first viewer's shell shows "'tax' requires admin"

  Scenario: A reconnect drops admin elevation
    Given one viewer has the desktop open with a socket the test can drop
    When the first viewer runs "sudo test-token" in the shell
    Then the first viewer is an admin with unlocked policy controls
    When the socket drops and the desktop reconnects
    Then the first viewer is a visitor with locked policy controls
    And the first viewer's shell shows "admin dropped"
