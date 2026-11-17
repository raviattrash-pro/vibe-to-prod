---
name: hld
description: Produce a High-Level Design (HLD) covering system boundaries, component responsibilities, data flows, API contracts, infrastructure choices, and architectural trade-offs with an evolution path.
---

# High-Level Design

## Purpose

Define the system architecture at a level sufficient for implementation: components, their responsibilities, communication patterns, data flows, and the trade-offs behind each choice.

## Activate when

When system boundaries or architecture choices matter, or when a new feature spans multiple components or services. Select this capability only when it applies to the request.

## Inputs

- requirements
- scale expectations
- constraints (budget, team size, timeline)
- existing architecture
- non-functional requirements

## Procedure

1. Review existing architecture documentation, code structure, and deployment topology before proposing changes. Identify what already works and must be preserved.
2. Define system boundaries: list each component or service, its single responsibility, its inputs and outputs, and its deployment unit.
3. Draw a component diagram using Mermaid (flowchart or C4-style) showing components, their dependencies, data stores, and external integrations.
4. Map critical data flows end-to-end: request entry, authentication, business logic, data persistence, response. Identify where failures propagate.
5. For each significant architecture decision, write an ADR: context, decision, alternatives considered, trade-offs (cost, complexity, latency, team skill), and evolution path.
6. Validate that the proposed architecture matches the actual scale: do not introduce microservices, message queues, or distributed caches without evidence of load that requires them.
7. Identify integration points that need API contracts (REST, GraphQL, gRPC, events) and document request/response shapes, authentication, error codes, and rate limits.

## Avoid

- Over-engineering with microservices, event buses, or distributed systems when a monolith or modular monolith meets demonstrated load.
- Proposing architecture without understanding current deployment, infrastructure budget, or team capabilities.
- Drawing diagrams without explaining the rationale behind component boundaries.
- Ignoring the evolution path: every architecture choice should state what changes when scale doubles.

## Expected outputs

- component diagram (Mermaid)
- data flow diagram
- API contract summaries
- trade-off analysis
- Architecture Decision Records (ADRs)

## Validation

- complexity justified by demonstrated requirements
- evolution path included for each major decision
- diagrams match actual component structure
- ADRs recorded for significant choices
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
