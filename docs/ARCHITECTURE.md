# Architecture

AgencyOS is split into two layers. **Core** contains domain behavior and provider-neutral capability definitions; **Studio** is a thin client of the Core HTTP API. In this local first release, Node's standard library serves the API and static app, while JSON file persistence keeps setup simple.

```text
Studio (public/)
   │ JSON over same-origin HTTP
   ▼
API (src/server.js)
   ├── project records and evidence ──► Store (src/store.js)
   ├── workflow planning ─────────────► Orchestrator (src/orchestrator.js)
   ├── remediation planning ──────────► Failed/unverified evidence follow-up
   ├── score and release gates ───────► Quality engine (src/quality.js)
   ├── bounded local checks ──────────► Evaluators (src/evaluators.js)
   ├── agent task handoff ────────────► Adapters (src/adapters.js)
   └── agent + skill registries ──────► agents/ and skills/
```

## Decisions and limits

- Local file persistence keeps zero-setup use simple. When `DATABASE_URL` is present, PostgreSQL stores shared projects as JSONB and applies updates in transactions under a database advisory lock, allowing multiple server processes to coordinate. `migrations/001-projects-jsonb.sql` defines the initial schema. PostgreSQL mode is required for non-loopback hosting.
- Optional environment-configured scrypt password hashes provide eight-hour signed sessions, CSRF tokens, admin/member/viewer roles, and actor labels on new activity events. Authenticated users share one workspace; per-project tenancy, account lifecycle management, and session revocation remain future work.
- Workflow creation combines a baseline task graph with deterministic, requirement-triggered checks for performance, offline behavior, and animation. The workflow records which rules matched so routing is explainable. AgencyOS generates evidence-oriented handoffs; Codex can be invoked only through an explicit workspace-write confirmation. Runs do not auto-complete workflow tasks.
- Optional workflow routes live in versioned `references/workflow-routing.json`; each match includes the trigger ID and matched phrase in the task handoff. The validation command checks all route agent, skill, and dependency references.
- Workflows store a fingerprint of project requirements and decisions. If that context changes, prior plans remain in history but become stale; task handoffs, completion, and agent execution require a new plan.
- Remediation plans derive actions from failed or unverified checks, retain the originating check identifier, and stay separate from score calculation. They suggest next evidence steps; they do not close checks automatically.
- The scoring engine computes from check records. User-entered evidence stays user-reported; built-in evaluators attach captured output for the checks they actually run.
- Built-in check adapters capture output from a bounded secret-marker scan and an explicitly approved Node.js test run. They cover a small part of the quality model and cannot clear release readiness.
- Provider compatibility uses native skill discovery directories and generated task prompts. Optional Codex CLI invocation relies on the user's existing CLI authentication; Claude Code and Antigravity are currently handoff-only.
- Loopback binding reduces exposure for local use. Network deployment requires authentication, CSRF defenses, proper secret/config handling, database transactions, backups, and a threat review.

## Data shape

Project records include identity/profile, objective, requirements, technology preferences, priority, local repository, status/timestamps, checks, workflow plans, decisions, agent runs, and activity. Workflow prompts include saved requirements and recent decisions. Each check is tagged to a weighted category, carries status, evidence, provenance, and an optional release-critical flag. Scores are computed on read to avoid stale derived values.
