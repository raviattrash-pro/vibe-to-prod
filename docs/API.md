# Local HTTP API

All endpoints are served by the same process on `127.0.0.1:4173` by default. JSON requests and responses use UTF-8. Project records are persisted to `data/projects.json` by default (override with `AGENCYOS_DATA_FILE`) or to PostgreSQL when `DATABASE_URL` is set.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/auth/session` | Return authentication status and current shared-workspace user |
| POST | `/api/auth/login` | Sign in with `{username,password}`; sets HttpOnly session and readable CSRF cookies |
| POST | `/api/auth/logout` | Clear session cookies; requires the CSRF token when authentication is enabled |
| GET | `/api/health` | Local server status and version |
| GET | `/api/projects` | List projects with computed quality reports |
| POST | `/api/projects` | Create `{name, type?, objective?, requirements?, techPreferences?, priority?, repositoryPath?}` |
| GET | `/api/projects/:id` | Read a project and quality report |
| GET | `/api/projects/:id/export.json` | Download a versioned SHA-256 checksummed JSON backup including quality, checks, workflows, decisions, agent runs, and activity |
| POST | `/api/projects/import` | Import `{approved:true,backup}` as a new project (50 MB maximum); verifies schema v2 checksum, while legacy v1 is accepted as unchecked; active agent runs become orphaned with unknown outcome |
| PATCH | `/api/projects/:id` | Update name, profile, objective, requirements, technology preferences, priority, repository, or lifecycle status |
| DELETE | `/api/projects/:id` | Delete its local record and history |
| POST | `/api/projects/:id/workflow` | Create a persisted seven-task workflow snapshot; prior plans are retained and marked stale when project context changes |
| GET | `/api/projects/:id/workflow/:workflowId/prompt?task=:taskId` | Generate a scoped handoff for a dependency-ready task |
| POST | `/api/projects/:id/agents/codex/run` | Start explicitly approved Codex CLI run `{approved:true,workflowId,taskId}` |
| POST | `/api/projects/:id/agents/claude-code/run` | Start explicitly approved Claude Code run `{approved:true,workflowId,taskId}` with read/write tools only |
| POST | `/api/projects/:id/agents/antigravity/run` | Start explicitly approved Antigravity CLI run `{approved:true,workflowId,taskId}` with headless semantic events |
| GET | `/api/projects/:id/agents/runs/:runId` | Read persisted agent run status, bounded output, and up to 100 timestamped process or semantic events; prior-instance runs can be `orphaned` with unknown outcome |
| POST | `/api/projects/:id/checks` | Record `{category,title,status,evidence,critical?,controlId?}` as user-reported provenance; score uses latest result per source or normalized category/title, or explicit controlId |
| POST | `/api/remediation` | Persist plan generated from failed and unverified checks: `{projectId}` |
| GET | `/api/projects/:id/remediation` | Read project remediation plan history |
| PATCH | `/api/projects/:id/remediation/:planId/actions/:actionId` | Update an action `{status: "open"|"in_progress"|"completed", evidence?}`; completion requires evidence and moves the plan to `awaiting_verification` until its linked evaluator is rerun |
| POST | `/api/projects/:id/change-proposals` | Create a reviewable single-file text diff `{path,title,description,proposedContent}`; rejects traversal, symlinks, secrets, binary files, new files, oversized input, and stale reads |
| GET | `/api/projects/:id/change-proposals` | List proposals and diffs without returning full proposed file bodies |
| POST | `/api/projects/:id/change-proposals/:proposalId/apply` | Apply only with `{approved:true,approvalHash}` after checking the proposal fingerprint and original file hash |
| POST | `/api/projects/:id/decisions` | Record `{title,rationale,alternatives?,evidence?}` in project memory |
| POST | `/api/projects/:id/evaluations/secret-scan` | Run bounded read-only secret-marker scan on configured local repository |
| POST | `/api/projects/:id/evaluations/node-tests` | Run `node --test`; requires `{approved:true}` and configured repository path |
| POST | `/api/projects/:id/evaluations/seo-static` | Check static HTML title, description, and canonical metadata |
| POST | `/api/projects/:id/evaluations/accessibility-static` | Check static HTML language, image alt attributes, button/link names, and form control labels |
| POST | `/api/projects/:id/evaluations/deployment-config` | Audit baseline Dockerfile, Compose, Kubernetes, and partial provider config controls |
| POST | `/api/projects/:id/evaluations/rendered-browser` | Explicitly approved local Chrome run; executes page scripts and records rendered SEO and accessibility findings |
| POST | `/api/projects/:id/evaluations/visual-review` | Explicitly approved local Chrome captures of up to eight static HTML pages for human visual review |
| GET | `/api/projects/:id/reviews` | List retained visual review reports and screenshot URLs |
| GET | `/api/projects/:id/reviews/:reviewId/:filename` | Read one retained screenshot image |
| POST | `/api/projects/:id/evaluations/performance-browser` | Explicitly approved Chrome run; records local navigation/resource timing against named AgencyOS baselines |
| GET | `/api/projects/:id/evaluations/history` | Read evaluator-run history, status comparisons, and before/after aggregate score and release-gate snapshots; active score uses only the latest result per evaluator |
| GET | `/api/projects/:id/activity?limit=50&offset=0` | Read a bounded activity page; limits are capped at 100 and project activity retention is capped at 500 entries |
| POST | `/api/projects/:id/evaluations/dependency-audit` | Run `npm audit`; requires `{approved:true}` and a lockfile |
| GET | `/api/agents` | List registered specialized agents |
| GET | `/api/skills` | List registered modular skills |
| GET | `/api/providers` | List compatible skill discovery/handoff targets |

Evidence `status` must be `pass`, `fail`, `unverified`, or `na`. Categories are `design`, `interaction`, `accessibility`, `seo`, `security`, `auth`, `architecture`, `reliability`, `offline`, `performance`, `testing`, and `delivery`. Pass, fail, and N/A require an evidence reference or rationale; a claim without one is treated as unverified. The score is a **provisional score** over all applicable category weights; unassessed applicable categories contribute zero, and only N/A categories are removed from the denominator. The response shows assessed and applicable weight plus distinct control counts by pass, fail, unverified, and N/A. Built-in automated evaluators mark their provenance; human-entered checks remain user-reported. Profile-level required controls are selected from `references/quality-requirements.json`; missing runs are unverified, and manual N/A evidence is associated through `controlId`. Requirements are baseline prompts, not a full compliance checklist. Coverage is limited, so the API never marks production release ready in this release.

The secret scan traverses supported text files, skips symlinks and common generated/dependency directories, and has file/size limits. It detects only high-confidence private-key and AWS access-key markers; a clean scan is not a complete secrets audit. The Node test runner invokes `node --test` in the configured repository without a shell, with a 60-second timeout. Repository tests can execute arbitrary code; use only on repositories you trust and explicitly approve.

Static HTML checks scan bounded `.html` files and do not render applications. Pages that declare robots `noindex` are excluded from public metadata scoring; if all pages are noindex the SEO result is N/A, while route authorization remains a separate requirement. These checks do not evaluate JavaScript-rendered metadata, WCAG contrast, keyboard use, screen-reader output, or browser accessibility trees. A missing HTML corpus is recorded as unverified rather than a pass.

The dependency audit runs the installed npm CLI against `package-lock.json` or `npm-shrinkwrap.json`. After explicit approval, npm sends dependency metadata to the registry configured in the user’s npm settings. No lockfile, timeout, unparsable output, or unsupported npm configuration is unverified, never a pass. Critical vulnerabilities become release blockers.

The deployment configuration evaluator inspects Dockerfiles for an explicit non-latest base image, non-root user, and healthcheck; Kubernetes YAML is checked for non-root execution, disabled privilege escalation, and resource limits. Compose source patterns check for privileged mode, host network/PID namespaces, absolute host mounts, service healthchecks, and pinned images. Compose anchors, extensions, interpolation, and merged files are not resolved. Vercel, Netlify, Cloudflare Wrangler, Render, and Railway files receive partial provider-specific checks; they remain unverified when coverage is incomplete. Missing deployment configuration remains unverified. These source checks do not validate a live deployment or certify infrastructure security.

The bundled Compose file is a deployment starting point. It requires environment-provided database credentials, a session secret, and configured user hashes; it binds the application to loopback on the host and does not publish PostgreSQL. Place a TLS reverse proxy in front of it for remote access, and back up both named volumes. See the README for setup steps.

Remediation actions created from automated checks retain their evaluator ID and, when available, a finding key based on file and control. Marking an action complete records a claimed fix and requires new evidence. The next run of that evaluator verifies a finding-specific action only when its finding is absent from a complete result; remaining findings reopen their matching actions. Truncated or unverified results cannot verify finding-specific actions. Aggregate actions without individual findings require an evaluator pass. A fully passing plan becomes `verified_complete`. Manual checks without an evaluator ID cannot be automatically linked and remain user-verified.

The rendered browser evaluator requires `{approved:true}` because Chrome executes repository page scripts. It renders up to eight static HTML files with a temporary browser profile, applies host resolver restrictions, and records independent SEO and basic accessible-name results. Host resolver restrictions are not a full OS network sandbox. It does not start a development server, inspect dynamic routes, evaluate keyboard behavior or contrast, or produce a visual-quality report. Install Chrome or set `AGENCYOS_CHROME_PATH`; if unavailable, both results remain unverified.

The performance-browser evaluator also requires `{approved:true}` and records per-page DOMContentLoaded, load, LCP when available, resource count, and transfer size. Its explicit local baselines are 3 s DOMContentLoaded, 5 s page load, 2.5 s LCP, 100 resources, and 2 MB transferred. Missing timing values are retained as unavailable; limits are diagnostic budgets rather than production or real-user guarantees.

Rendered accessibility also records positive `tabindex`, focusable elements without a detectable name, and focus candidates that cannot receive focus programmatically. Profile requirements identify WCAG 2.2 A/AA as the reference, with linked W3C source; the current controls are a starter subset and cannot establish conformance. This is a rendered DOM heuristic; it does not dispatch real hardware key events or inspect Chrome's accessibility tree. The visual-review endpoint saves up to eight 1365×900 PNG files under the AgencyOS data directory and exposes them through the project API. Screenshots are evidence artifacts for a human reviewer, not an automated visual pass/fail score. Captures run page scripts and require explicit approval.

Studio includes a PWA manifest and an install button. The service worker caches the app shell only and keeps `/api/*` network-only. Phone installation requires a secure reachable origin; iOS users use Safari's Share → Add to Home Screen flow. This installs the web app and does not create a native APK/IPA package.

## Example

```sh
curl -X POST http://127.0.0.1:4173/api/projects -H "content-type: application/json" -d '{"name":"Customer Portal","type":"SaaS Application","objective":"Manage customer accounts"}'
```

Local mode has no authentication and binds to loopback by default. Non-loopback startup is refused unless authentication, PostgreSQL, and secure cookies are configured. Auth uses `AGENCYOS_USERS_JSON` user records with scrypt hashes, an `AGENCYOS_SESSION_SECRET` of at least 32 bytes, eight-hour signed sessions, same-site CSRF cookies, and admin/member/viewer roles. The viewer role is read-only. New activity entries carry the authenticated actor; older entries remain unattributed. This is a shared workspace: user/project tenancy, account lifecycle management, and session revocation remain open before hosted multi-tenant use.

When `DATABASE_URL` is set, PostgreSQL stores project records as JSONB and initializes migration `001-projects-jsonb`. To move the local JSON store into an empty database, set `AGENCYOS_DATA_FILE` if needed and run `npm run import:postgres`; the script refuses to overwrite a non-empty database. Generate password hashes by piping a password to `node scripts/hash-password.js`.

Project JSON backups include the configured local repository path and captured agent output. Store exported files with the same care as the underlying workspace data.
The SHA-256 checksum detects accidental changes; it is not a signature and does not authenticate the backup's author.

Change proposals support one existing UTF-8 text file per proposal, at most 200 KB and 1,000 lines. Credential and Git metadata paths are blocked. `package.json`, lockfiles, container/deployment files, migrations, and CI workflows are marked high impact. Applying any proposal requires explicit approval of the displayed hash; the original file hash is rechecked immediately before an atomic same-directory replacement. Review the diff and run relevant checks after application.

`npm run package:release` creates a tarball, SHA-256 file, and release manifest under `release/`; it creates a second package in a temporary directory and fails if the hashes differ. `.github/workflows/release.yml` runs on `v*` tags, runs tests/validation, packages, signs each artifact with a Sigstore bundle using GitHub's OIDC token, and creates a GitHub release. A real tag push and GitHub Actions run are required before a signed release is available.
