# Acceptance criteria §26 (9)–(12), re-mapped by ADR-0003 to the
# Claude Code GitHub Action (isolated GitHub-hosted runner replaces the
# spec's local worktree runner).

Feature: Constrained agent execution via GitHub

  Scenario: AC9 — an allowed agent job runs in an isolated environment
    Given a project whose execution mode permits agent work
    And a prepared intake for that project
    When the dispatch function creates a GitHub issue mentioning "@claude"
    Then the Claude Code Action runs in an isolated GitHub-hosted runner
    And it works on a new branch, never on the default branch

  Scenario: AC10 — the agent cannot touch an unregistered repository
    Given a capture routed to a project with no registered repository
    When dispatch evaluates the agent job
    Then no GitHub issue is created
    And the capture completes as store-only with an audit event

  Scenario: AC11 — nothing merges or deploys automatically
    Given an agent run has opened a pull request
    Then the pull request remains unmerged until a human merges it
    And branch protection on the default branch is enabled
    And the agent has no deployment credentials

  Scenario: AC12 — the user sees a useful final status
    Given a capture completes, fails, or needs attention
    Then a concise Slack reply is posted in the original capture thread
    And a failure message includes exactly one useful next action
