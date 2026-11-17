# AgencyOS quality model

Use this initial 100-point model when applicable. Adapt only with explicit, documented rationale.

| Category | Weight |
|---|---:|
| UI/UX and visual design | 12 |
| Animation and interaction | 6 |
| Responsive design and accessibility | 10 |
| SEO and AI discoverability | 10 |
| Application security | 14 |
| Authentication and authorization | 8 |
| Architecture and system design | 10 |
| Scalability and reliability | 8 |
| Offline and synchronization | 5 |
| Performance | 6 |
| Testing and QA | 7 |
| Deployment and observability | 4 |
| **Total** | **100** |

## Evidence rules

- Each check records category, criterion, applicable status, result, points earned/possible, verification state, evidence reference, and remediation when needed.
- Verification states: **verified**, **partially verified**, **unverified**, or **N/A**.
- A claim from an AI agent alone is not evidence. Prefer actual test output, tool reports, code/config inspection, measured performance, or inspected screenshots.
- N/A requires a reason. Remove its weight from the denominator and scale earned points proportionally; show both the adjusted score and applicability so the change is transparent.
- Unverified checks cannot be presented as passed. Missing evidence is not a pass.
- Report category scores, failed checks, warnings, evidence links, and recommended fixes. Preserve before/after records after remediation.
- Score only the latest result for each named control. Built-in evaluator runs are keyed by source; manual checks use category plus normalized title unless a stable `controlId` is supplied. Preserve superseded submissions in history without letting them alter current scoring or remediation recommendations.
- Show distinct effective control counts for pass, fail, unverified, and N/A beside every category score. A category with no submitted control is unassessed; the count does not claim that all possible criteria in that category were enumerated.

## Release blockers

Regardless of the numerical score, production readiness is blocked by critical security vulnerabilities, exposed secrets, broken authentication or authorization, critical user journey failures, data-loss risks, failed mandatory tests, or unsafe deployment configuration. State the blocker and evidence directly.
