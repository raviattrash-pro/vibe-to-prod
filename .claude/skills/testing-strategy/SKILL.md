---
name: testing-strategy
description: Design and execute a testing strategy covering unit, integration, API, and end-to-end tests structured around critical user journeys, risk areas, and the testing pyramid, with recorded commands and outcomes.
---

# Testing Strategy

## Purpose

Define which tests to write, at which layer, and for which risk areas; then execute available tests and record the actual commands, pass/fail results, and coverage gaps.

## Activate when

When acceptance criteria need verification, new features are implemented, or test coverage gaps are identified. Select this capability only when it applies to the request.

## Inputs

- risk assessment
- critical user journeys
- tech stack and test frameworks
- existing test suites
- acceptance criteria

## Procedure

1. Inspect existing test suites: identify frameworks (Jest, Vitest, Mocha, Pytest, etc.), configuration, and current test count and pass rate by running the test command in dry-run or list mode if available.
2. Map critical user journeys: identify the 3-5 most important workflows (e.g., signup, login, core action, payment, data export) that must work for the product to be viable.
3. Design tests following the testing pyramid: unit tests for business logic and utilities, integration tests for API endpoints and database operations, E2E tests for critical journeys only.
4. For each layer, specify: what to test, what to mock/stub, expected assertions, and error cases. Prioritise tests by risk (what breaks causes the most damage).
5. Run the existing test suite and record: the exact command used, total tests, passed, failed, skipped, and execution time. Capture failure messages for failing tests.
6. Identify coverage gaps: untested error paths, missing edge cases, business logic without unit tests, API endpoints without integration tests.
7. Recommend specific tests to add, ordered by risk reduction value. Include the test description, layer, and what it validates.

## Avoid

- Claiming test coverage without running the test suite or a coverage tool.
- Writing E2E tests for everything instead of using the testing pyramid appropriately.
- Mocking so heavily that tests do not catch real integration failures.
- Reporting test results from a previous run without re-executing.

## Expected outputs

- test plan (by layer and priority)
- executed test commands and results
- coverage report or gaps
- recommended additional tests

## Validation

- actual commands and outcomes recorded
- critical journeys covered or gaps documented
- test layer matches risk level
- failing tests diagnosed with remediation
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
