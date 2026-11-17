---
name: multi-agent-interview-panel
description: Spin up an adversarial panel of 5 specialized AI interviewers (System Architect, Security Lead, Product Manager, Senior QA/SRE, and Engineering Manager) to rigorously grill the developer on the completed project — preparing them for any technical, architectural, or behavioral interview question.
---

# Multi-Agent Technical & System Interview Panel

## Purpose

Equip the developer with deep, interview-ready mastery of their codebase by grilling them on architecture choices, security trade-offs, scaling bottlenecks, failure modes, and code walkthroughs before they present or interview.

## Activate when

When a project is built and ready for review, before job interviews or portfolio presentations, or when the developer wants to defend their architectural and implementation decisions. Select this capability only when it applies to the request.

## Inputs

- completed project codebase
- architecture decisions (ADRs)
- dependency list and data models
- target job role or presentation audience (e.g., Senior Full-Stack, Staff Architect, Tech Lead)

## Procedure

1. Initialize the 5-member interview panel with distinct agendas: (1) System Architect (system boundaries, scaling, data models), (2) Security Lead (threat model, secret hygiene, auth, injection), (3) Product Manager (user journeys, trade-offs, business value), (4) QA/SRE (test pyramid, failure modes, observability, outages), (5) Engineering Manager (ADR rationale, tech debt, team handoff).
2. Scan the completed codebase and git history to identify real vulnerabilities, missing indexes, unhandled async errors, or architectural shortcuts to use as interview ammunition.
3. Conduct Round 1 — System & Architecture Grill: challenge why particular frameworks, databases, and schema designs were selected over alternatives.
4. Conduct Round 2 — Failure Mode & Security Cross-Examination: ask what happens when third-party APIs fail, DB connections pool out, or malicious input bypasses client guards.
5. Conduct Round 3 — Code Walkthrough & Deep-Dive: pick specific complex functions or controllers in the project and ask the developer to explain time complexity, memory footprint, and concurrency handling.
6. Conduct Round 4 — Behavioral & Trade-off Defense: probe why certain features were cut, what technical debt was accepted, and what would be redesigned with double the timeline.
7. Score candidate answers on clarity, technical precision, and honesty about constraints. Highlight weak responses and provide polished, senior-level model answers for each topic.

## Avoid

- Asking superficial trivia questions rather than probing the actual code written in the repository.
- Letting the developer give vague non-answers without challenging them for specifics.
- Focusing only on theoretical knowledge instead of practical trade-offs made in this specific project.
- Providing scorecards without actionable model talking points.

## Expected outputs

- interview panel scorecard
- transcribed multi-round Q&A grill log
- architectural weak points exposed
- model answer talking points for portfolio defense
- readiness assessment score (1-10)

## Validation

- questions reference actual repository files and functions
- all 5 panelist personas ask distinct domain-relevant questions
- weak answers identified with concrete senior-level talking points
- readiness score backed by itemized evaluation criteria
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
