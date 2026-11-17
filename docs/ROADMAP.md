# Release roadmap

## Delivered in 0.1.0 foundation

- Local project CRUD, API, persistence, capability registries, dependency-aware workflows, quality reports, transparent provisional scoring, release gates, and a responsive Studio interface.
- Workspace skill sync for Codex, Claude Code, and Antigravity, plus copyable dependency-ready task prompts.
- Target-project installer copies current skills and adds managed Codex, Claude Code, and Gemini/Antigravity repository instructions while preserving surrounding user content.
- Explicitly approved Codex, Claude Code, and Antigravity CLI runners with persisted run status/output and bounded semantic Antigravity step/tool events; bounded secret-marker scan and approved Node.js test evaluator.
- Bounded static HTML metadata and accessibility source checks with explicit unsupported/runtime limits.
- Approved lockfile-based npm vulnerability audit with severity-based critical release blocker handling.
- Baseline Dockerfile/Kubernetes and bounded Docker Compose deployment configuration checks with provider-config detection and explicit unsupported results; coverage registry version 6.
- Partial provider configuration checks for Vercel, Netlify, Cloudflare Wrangler, Render, and Railway, with source-heuristic limitations retained as unverified evidence.
- Explicitly approved local headless Chrome rendering for up to eight static HTML pages, with separate rendered SEO and accessibility evidence; coverage registry version 3.
- Rendered DOM keyboard focus order/name heuristics, with explicit limits around real key dispatch, browser accessibility trees, and screen readers; coverage registry version 6.
- Explicitly approved retained PNG captures for human visual review, surfaced in Studio without claiming an automated design score.
- Explicitly approved Chrome navigation/resource timing measurements with named local performance budgets and retained per-page metrics; coverage registry version 4.
- AgencyOS Studio PWA manifest, 192/512 phone icons, install prompt button, secure-scope service worker shell caching, and reusable mobile PWA skill routed from explicit project requirements.
- Explicitly approved single-file remediation proposals with bounded unified diffs, repository path guards, stale-file detection, impact labels, and atomic same-directory replacement.
- Deterministic, explainable routing of performance, offline/sync, and animation tasks from project requirements.
- Persisted remediation plans for failed/unverified checks and downloadable Markdown quality reports.
- Bounded timestamped Codex/Claude process output and Antigravity semantic events in project history.
- Versioned evaluator coverage registry surfaced by the quality API and Markdown report.
- Structured provenance on automated and user-reported checks, with evaluator identity/version, capture time, and bounded machine-readable findings retained in check history and exports.
- Evidence-required remediation action history with an explicit awaiting-verification plan state.
- Automated remediation actions retain evaluator identity; passing follow-up runs verify actions, while failing/unverified runs reopen them with evidence and activity history.
- Finding-backed remediation actions use file/control keys so partial evaluator improvements resolve only the findings no longer present in a complete follow-up result.
- Versioned required-control policies are applied by project profile and surfaced in API quality, Studio reports, and downloadable reports; absent required evidence remains unverified.
- PostgreSQL JSONB project persistence, startup migration, advisory-lock serialized transactions, guarded import from the local JSON store, environment-managed password sessions, CSRF tokens, role-based read-only viewers, actor-attributed new activity entries, and non-loopback hosting checks.
- Double-pack hash equality for release artifacts and a tag-triggered GitHub workflow for OIDC Sigstore signing and artifact publication.
- Hardened Docker image and Compose deployment baseline with non-root runtime, health checks, local-only host binding, secure cookie configuration, PostgreSQL, and persistent named volumes.
- Immutable evaluator-run history with improved/regressed/unchanged comparisons and latest-result scoring.
- Before/after aggregate score and release-gate snapshots attached to evaluator history records.
- Serialized single-process JSON store mutations with concurrent API/store regression coverage.
- Paginated project activity feed with stable identifiers, 500-event retention, and a Studio viewer.
- Resumable browser monitoring for active Codex runs with live event refresh and final-state notification.
- Startup reconciliation marks prior-instance runs with unknown outcomes as orphaned and blocks duplicate task runs until inspected.
- Context-fingerprinted workflows that gate stale handoffs and completion after project requirements or decisions change.
- Versioned data-driven routing with registered performance/offline specialist skills and trigger evidence in generated handoffs.
- Studio accessibility improvements: named navigation/dialog landmarks, visible keyboard focus styling, and static form-label checks.
- Quality scoring deduplicates manual controls by stable ID or normalized title; superseded submissions remain auditable but do not inflate scores or stale remediation lists.
- Quality API, Studio report, and Markdown export show effective per-category control outcome counts beside each provisional score.
- User-triggered, versioned JSON project backup with preserved workflow, evidence, agent-run, and activity history.
- Confirmed backup import that creates a new project identity and safely orphans process runs without verified outcomes.
- Version 2 project backups include SHA-256 integrity checks; restore preserves compatibility with legacy version 1 backups.
- CI verification across Node.js 20 and 22 with test, syntax/registry validation, skill generation, and generated-file drift checks.

## Next milestones

1. Browser accessibility-tree/real-keyboard and screen-reader checks; deeper managed-provider deployment validation.
2. Standards-backed evaluator requirements per project type, with human review and project-specific criteria mapped into each profile.
3. Browser automation for dynamic routes, interaction journeys, and repeatable per-target review suites.
4. Per-project tenancy, account lifecycle management, revocable sessions, and database-native backup/restore before hosted multi-tenant use.
5. External deployment smoke tests, verified HTTPS hosting, phone installation checks on target devices, and production threat review.

These milestones are intentionally not represented as shipped features in the current Studio.
