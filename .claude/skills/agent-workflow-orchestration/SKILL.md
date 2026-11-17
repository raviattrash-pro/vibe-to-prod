---
name: agent-workflow-orchestration
description: Design and manage multi-phase AI agent workflows with plan-execute-verify loops, context window management (context rot prevention), multi-model fallback strategies, goal-driven execution loops, and automated code review gates.
---

# Agent Workflow Orchestration

## Purpose

Structure AI agent work into reliable, observable phases that prevent context rot, recover from model failures, and gate code quality before task completion — turning chaotic single-shot agent runs into disciplined engineering workflows.

## Activate when

When setting up AI agent workflows for a project, when agent runs produce inconsistent or degrading quality (context rot), when multi-model fallback is needed, or when automated review gates are required before merge. Select this capability only when it applies to the request.

## Inputs

- project requirements and task breakdown
- available AI agents and models (Codex, Claude Code, Antigravity, etc.)
- context window limits and token budgets
- code review criteria and quality gates
- existing CI/CD pipeline

## Procedure

1. Break the project into small, self-contained phases. Each phase should have: a clear objective, input context (files to read), output deliverables (files to create/modify), and a verification step. No phase should require more than 60% of the model's context window.
2. Define the Plan-Execute-Verify loop for each phase: (1) Plan — the agent reads requirements and proposes an implementation approach, (2) Execute — the agent writes code within the scoped phase, (3) Verify — run tests, linters, and type checks to confirm the phase output is correct before proceeding.
3. Implement context rot prevention: at the start of each phase, provide a fresh context summary (project structure, completed phases, current phase requirements) instead of relying on accumulated conversation history. Store phase summaries in a structured handoff document (e.g., HANDOFF.md or project memory JSON).
4. Configure multi-model fallback: define a primary model for each task type, a fallback model if the primary hits rate limits or quota, and rules for automatic switching. Record which model executed each phase for traceability. Never silently switch models without logging.
5. Set up goal-driven execution loops: for each phase, define a completion condition (all tests pass, linter clean, specific files created). The agent retries the execute-verify cycle up to a bounded limit (e.g., 3 attempts) before escalating to human review.
6. Define automated code review gates between phases: before the next phase begins, run static analysis (ESLint, TypeScript, Semgrep), test suites, and diff-based review checks. Block phase advancement if critical issues are found.
7. Create an agent run manifest: document each phase's agent, model, context files, deliverables, verification commands, retry limit, and fallback model. This manifest is the executable specification for the entire workflow.

## Avoid

- Running a single agent session for an entire project without phase breaks (guaranteed context rot).
- Assuming conversation history is a reliable context carrier beyond 50K tokens.
- Silently switching models without recording which model produced which output.
- Allowing unlimited retries — cap at 3-5 attempts per phase, then escalate.
- Skipping the verify step because the execute step 'looked correct' in the agent's output.

## Expected outputs

- phased execution plan
- context management strategy
- model fallback configuration
- review gate definitions
- agent run monitoring setup

## Validation

- each phase has plan-execute-verify defined
- context rot prevention documented (handoff strategy)
- model fallback chain configured and logged
- review gates defined with blocking criteria
- retry limits bounded
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
