# Acceptance criteria §26 (5)–(8).

Feature: Structure and route a transcript to the correct project

  Scenario: AC5 — transcripts become validated structured intake
    Given a completed transcript
    When the structuring function runs
    Then the output validates against StructuredIntakeSchema version "1.0"
    And invalid model output is retried once with the validation errors included
    And repeated invalidity marks the capture "needs attention" without data loss

  Scenario: AC6 — an explicitly named project routes without user intervention
    Given a project "Voice Inbox" with alias "voice inbox" exists
    And the transcript begins "Project Voice Inbox."
    When routing runs
    Then the capture routes to "Voice Inbox" with route_method "explicit_alias"
    And no clarification is sent

  Scenario: AC7 — ambiguity produces a one-tap Slack clarification
    Given routing confidence is below the project threshold or margin
    When routing completes
    Then the capture status becomes "awaiting_route"
    And a Slack message with project buttons appears in the capture's thread
    And tapping one button resumes processing without retranscription
    And the correction is stored as labelled routing evidence

  Scenario: AC8 — the routed project receives one deterministic markdown intake
    Given a routed capture
    When intake preparation runs twice for the same capture
    Then exactly one §12-format markdown intake exists
    And rendering the same intake twice produces byte-identical output
