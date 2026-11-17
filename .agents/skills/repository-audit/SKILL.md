---
name: repository-audit
description: Audit a repository's structure, stack, scripts, dependencies, and existing architecture before making changes. Establishes a verified baseline of what exists, what works, and what constraints apply.
---

# Repository Audit

## Purpose

Produce a verified snapshot of the repository's technology stack, existing commands, dependency health, file organisation, and architectural constraints so that subsequent skills operate from facts rather than assumptions.

## Activate when

At the start of repository work, or when the current state of the codebase is unknown or unclear. Select this capability only when it applies to the request.

## Inputs

- repository tree
- local instructions
- package manifests
- CI/CD configuration

## Procedure

1. List the repository tree and identify the primary language, framework, and package manager from manifests (package.json, requirements.txt, go.mod, Cargo.toml, etc.).
2. Read local instruction files (README, CONTRIBUTING, AGENTS.md, CLAUDE.md, GEMINI.md) and extract project conventions, required tooling, and environment prerequisites.
3. Discover available scripts and commands (npm scripts, Makefile targets, CI workflows) and record which ones exist without running destructive commands.
4. Run safe, read-only checks: dependency audit (npm audit --audit-level=moderate, pip-audit, cargo audit), lockfile presence, and .env.example vs actual environment.
5. Identify existing test suites, linters, and formatters; record their configuration and last-known status if CI logs are available.
6. Summarise findings as: stack (language, framework, database, deployment), constraints (required Node version, OS, secrets), baseline (working commands, known issues), and dependency health (outdated, vulnerable, missing).

## Avoid

- Running build, deploy, migration, or seed commands during the audit phase.
- Replacing existing project structure or renaming files before understanding their purpose.
- Assuming a framework or tool is absent because its config file is not in the root directory.
- Reporting dependency counts or audit results without actually running the check.

## Expected outputs

- stack summary
- constraints
- baseline
- dependency health report
- available commands

## Validation

- existing work preserved
- commands discovered
- dependency audit executed or marked unverified
- stack summary matches actual manifests
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
