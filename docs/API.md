# Local HTTP API

All endpoints are served by the same process on `127.0.0.1:4173` by default. JSON requests and responses use UTF-8. Project records are persisted to `data/projects.json` by default (override with `AGENCYOS_DATA_FILE`) or to PostgreSQL when `DATABASE_URL` is set.

## Core Project & Workflow Endpoints

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/auth/session` | Return authentication status and current shared-workspace user |
| POST | `/api/auth/login` | Sign in with `{username,password}`; sets HttpOnly session and readable CSRF cookies |
| POST | `/api/auth/logout` | Clear session cookies; requires CSRF token when authentication is enabled |
| GET | `/api/health` | Local server status, product version, and health |
| GET | `/api/projects` | List projects with computed quality reports |
| POST | `/api/projects` | Create `{name, type?, objective?, requirements?, techPreferences?, priority?, repositoryPath?}` |
| GET | `/api/projects/:id` | Read a project and quality report |
| GET | `/api/projects/:id/export.json` | Download a versioned SHA-256 checksummed JSON backup |
| POST | `/api/projects/import` | Import `{approved:true,backup}` as a new project |
| PATCH | `/api/projects/:id` | Update project metadata, requirements, repository, or lifecycle status |
| DELETE | `/api/projects/:id` | Delete local record and history |
| POST | `/api/projects/:id/workflow` | Create a persisted multi-task workflow snapshot |
| GET | `/api/projects/:id/workflow/:workflowId/prompt?task=:taskId` | Generate a scoped handoff for a dependency-ready task |
| POST | `/api/projects/:id/agents/:provider/run` | Start single task run for `codex`, `claude-code`, or `antigravity` |

## Next-Generation Engineering OS Endpoints (Priorities 1 - 10)

### Priority 1: Real Agent Execution Engine
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/projects/:id/executions` | Start a DAG-ordered, idempotent multi-task execution session `{workflowId, approved?, approvalCheckpoints?, provider?}` |
| GET | `/api/projects/:id/executions` | List all execution sessions for the project |
| GET | `/api/projects/:id/executions/:sessionId` | Inspect real-time execution session state, task metrics, retries, and errors |
| POST | `/api/projects/:id/executions/:sessionId/approve` | Approve a paused approval checkpoint and resume execution |
| POST | `/api/projects/:id/executions/:sessionId/cancel` | Cancel an in-flight execution session gracefully |

### Priority 2: Evidence Trust Engine
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/:id/trust` | Audit repository fingerprint, verify evidence freshness, and inspect 7-state verification taxonomy |

### Priority 3: Engineering Digital Twin
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/:id/twin` | Retrieve the continuously updated Digital Twin graph (modules, APIs, DB entities, boundaries, ADRs, tests) |
| POST | `/api/projects/:id/twin/impact` | Analyze change impact for modified files and get recommended verification suite |

### Priority 4: Autonomous Browser QA
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/projects/:id/evaluations/browser-qa` | Run autonomous route discovery, critical journeys, responsive screenshot captures (360/768/1280px), and accessibility auditing |

### Priority 5: Attack Simulation Lab
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/projects/:id/evaluations/attack-lab` | Run authorized threat simulation (`{authorized: true}`): security headers, IDOR, CSRF, session flags, rate limits, injection probes, upload controls |

### Priority 6: Reality Check Engine
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/projects/:id/reality-check` | Multi-tier empirical market validation separating synthetic hypothesis from real customer interviews, landing page smoke tests, and usage telemetry |

### Priority 7: Cost and Scale Forecaster
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/:id/forecast` | Retrieve default infrastructure cost forecast across 100, 1k, 10k, and 100k active users |
| POST | `/api/projects/:id/forecast` | Generate customized cost forecast with user assumptions, verified rate cards, and bottleneck mitigations |

### Priority 8: Deployment Rehearsal
| Method | Path | Behavior |
|---|---|---|
| POST | `/api/projects/:id/rehearsal` | Execute staging preflight rehearsal: configuration, secrets, reversible migrations, backups, health probes, rollback drill, and release risk scorecard |

### Priority 9: Production Passport
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/:id/passport.json` | Download machine-readable release evidence package with SBOM, test/security findings, and SHA-256 attestation signature |
| GET | `/api/projects/:id/passport.md` | Download audit-ready human-readable Markdown release passport |
| POST | `/api/projects/:id/passport` | Generate, record, and sign a reproducible release passport |

### Priority 10: Agent Reliability Observatory
| Method | Path | Behavior |
|---|---|---|
| GET | `/api/observatory/metrics` | Read global agent reliability metrics: success rates, completion durations, retry frequencies, tool errors, handoff failures, and skill rankings |
| POST | `/api/observatory/events` | Record an agent execution telemetry event |
