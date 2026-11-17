---
name: application-security
description: Assess and harden application security: threat modeling, authentication and authorisation review, input validation, secret management, dependency vulnerabilities, security headers, and OWASP Top 10 coverage.
---

# Application Security

## Purpose

Identify, prioritise, and remediate security vulnerabilities across the application stack using evidence-based checks and established frameworks (OWASP Top 10, CWE).

## Activate when

For all applications; deepen for sensitive data, payment processing, or access control systems. Select this capability only when it applies to the request.

## Inputs

- data flows
- auth model
- deployment environment
- dependency manifests
- API surface

## Procedure

1. Map data flows to identify where sensitive data (credentials, PII, tokens, payment data) enters, is processed, stored, and transmitted. Mark trust boundaries.
2. Review authentication: check password hashing (bcrypt/scrypt/argon2 with sufficient rounds), session management (secure/httpOnly/sameSite cookies, token expiry), and MFA availability.
3. Review authorisation: verify server-side access control on every protected route and API endpoint. Check for IDOR (insecure direct object reference) patterns where user IDs are passed from the client.
4. Scan for secrets in the repository: search for hardcoded API keys, passwords, tokens, and connection strings using pattern matching (regex for common secret formats). Verify .gitignore covers .env files.
5. Run dependency vulnerability checks: npm audit (or pip-audit, cargo audit, etc.) and record findings with severity. Check for known CVEs in major dependencies.
6. Inspect HTTP security headers: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Referrer-Policy. Record which are present, missing, or misconfigured.
7. Validate input handling: check for SQL/NoSQL injection vectors (parameterised queries vs string concatenation), XSS (output encoding, CSP), CSRF (token or SameSite), and path traversal.
8. Document each finding in a table: Severity (P0-Critical, P1-High, P2-Medium, P3-Low), CWE ID, Location (file:line), Impact, and Remediation steps.

## Avoid

- Claiming an application is secure without running concrete checks.
- Ignoring server-side validation because client-side validation exists.
- Storing or logging secrets, tokens, or credentials in check outputs.
- Treating dependency audit warnings as resolved without verifying the fix.
- Making high-impact security changes (auth flow, encryption, access control) without explicit approval.

## Expected outputs

- threat model
- vulnerability findings table (severity, location, impact, remediation)
- security checks executed
- remediation plan

## Validation

- server-side controls verified on protected endpoints
- evidence recorded for each finding
- critical blockers (P0/P1) flagged as release gates
- dependency audit executed or marked unverified
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
