---
name: release-readiness
description: Pre-flight release gate assessment: verify test results, security findings, dependency health, environment configuration, deployment scripts, rollback procedures, and documentation before production deployment.
---

# Release Readiness

## Purpose

Determine whether the application meets the criteria for production deployment by systematically checking every release gate and producing a go/no-go recommendation with evidence.

## Activate when

Before release, deployment, or handoff to production. Select this capability only when it applies to the request.

## Inputs

- test results
- security findings
- dependency audit results
- deployment context (environment, infrastructure)
- documentation status

## Procedure

1. Collect results from all prior skill assessments (testing, security, performance, SEO) and compile them into a gate checklist.
2. Verify critical release gates: no P0/P1 security vulnerabilities open, all critical user journey tests passing, no exposed secrets in the repository, authentication and authorisation functioning.
3. Check deployment readiness: environment variables documented and configured, database migrations tested, deployment scripts present and functional, rollback procedure defined.
4. Verify dependency health: no known critical CVEs in production dependencies, lockfile is committed and up to date, no phantom or unused dependencies.
5. Review documentation: README has setup instructions, API documentation matches implementation, CHANGELOG or release notes prepared, breaking changes documented.
6. Produce a gate-by-gate status table: Gate Name, Status (Pass/Fail/Unverified), Evidence, and Remediation Required. Flag any gate marked Unverified as a risk.
7. Issue a go/no-go recommendation. No-go if any critical gate fails. Conditional-go if non-critical gates fail with accepted risk. Document limitations and known issues for all outcomes.

## Avoid

- Claiming release readiness without evidence for each gate.
- Marking gates as Pass based on agent assertions rather than executed checks.
- Approving release when critical security vulnerabilities or failing critical tests exist.
- Skipping rollback procedure verification.

## Expected outputs

- gate status (go/no-go for each gate)
- blocking issues with severity
- limitations and known issues
- next steps for remediation

## Validation

- no unsupported readiness claim
- each gate backed by evidence or marked unverified
- critical blockers prevent go recommendation
- rollback procedure documented
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
