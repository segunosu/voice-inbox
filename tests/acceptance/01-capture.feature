# Acceptance criteria §26 (1)–(4), re-mapped by ADR-0003 to Slack capture.

Feature: Capture a spoken note via Slack
  The user speaks once into a Slack audio clip; the pipeline takes over.

  Scenario: AC1 — capture requires only recording and sending a clip
    Given the Voice Inbox Slack app is installed in the workspace
    When the user records a Slack audio clip in "#voice-inbox" and sends it
    Then a capture is created without any further user action
    And no project selection is required at capture time

  Scenario: AC2 — the recording is durable once sent
    Given the user has sent an audio clip to "#voice-inbox"
    When the slack-ingest function processes the event
    Then the original audio file is copied to the private Supabase bucket
    And the stored object's checksum is recorded on the capture
    And the capture survives independently of Slack's retention

  Scenario: AC3 — duplicate delivery never duplicates captures
    Given Slack retries an events delivery for the same message
    When slack-ingest receives the same (channel, message_ts) twice
    Then exactly one capture row exists for that message
    And the second delivery is acknowledged without side effects

  Scenario: AC4 — original audio and raw transcript are retained per policy
    Given a capture has been transcribed
    Then the audio object and the versioned raw transcript both remain stored
    And retention periods are configurable, not hard-coded
