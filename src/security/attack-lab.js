import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scanForSecrets } from '../evaluators.js';

export const ATTACK_SCENARIOS = [
  'security_headers',
  'authorization_boundaries',
  'idor_scenarios',
  'csrf_verification',
  'session_security',
  'rate_limiting',
  'input_validation',
  'file_upload_validation',
  'secret_scans'
];

/**
 * Inspect HTTP security headers for best-practice configurations.
 */
export function inspectSecurityHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = String(value || '');
  }

  const findings = [];

  // Content-Security-Policy
  const csp = normalized['content-security-policy'];
  if (!csp) {
    findings.push({
      scenario: 'security_headers',
      control: 'csp',
      severity: 'high',
      status: 'fail',
      title: 'Missing Content-Security-Policy header',
      issue: 'No Content-Security-Policy header found; application is vulnerable to cross-site scripting (XSS) and data injection.',
      remediation: "Configure a strict Content-Security-Policy (e.g. default-src 'self'; script-src 'self'; object-src 'none')."
    });
  } else {
    if (csp.includes("'unsafe-inline'") && !csp.includes("'nonce-") && !csp.includes("'sha256-")) {
      findings.push({
        scenario: 'security_headers',
        control: 'csp-unsafe-inline',
        severity: 'medium',
        status: 'fail',
        title: "Content-Security-Policy allows 'unsafe-inline'",
        issue: "CSP includes 'unsafe-inline' without nonces or hashes, significantly weakening XSS defense.",
        remediation: "Remove 'unsafe-inline' and use cryptographic nonces or SHA-256 hashes for necessary inline scripts."
      });
    }
    if (csp.includes("'unsafe-eval'")) {
      findings.push({
        scenario: 'security_headers',
        control: 'csp-unsafe-eval',
        severity: 'medium',
        status: 'fail',
        title: "Content-Security-Policy allows 'unsafe-eval'",
        issue: "CSP includes 'unsafe-eval', allowing dynamic string execution via eval() or Function().",
        remediation: "Refactor dynamic code execution and remove 'unsafe-eval' from CSP."
      });
    }
  }

  // X-Content-Type-Options
  if (normalized['x-content-type-options'] !== 'nosniff') {
    findings.push({
      scenario: 'security_headers',
      control: 'x-content-type-options',
      severity: 'medium',
      status: 'fail',
      title: 'Missing or invalid X-Content-Type-Options header',
      issue: "Header must be set to 'nosniff' to prevent MIME-sniffing attacks.",
      remediation: "Set 'X-Content-Type-Options: nosniff' on all HTTP responses."
    });
  }

  // X-Frame-Options
  const xfo = normalized['x-frame-options']?.toUpperCase();
  if (xfo !== 'DENY' && xfo !== 'SAMEORIGIN') {
    findings.push({
      scenario: 'security_headers',
      control: 'x-frame-options',
      severity: 'medium',
      status: 'fail',
      title: 'Missing or weak X-Frame-Options header',
      issue: "X-Frame-Options header is missing or not set to DENY or SAMEORIGIN, creating clickjacking exposure.",
      remediation: "Set 'X-Frame-Options: DENY' or 'SAMEORIGIN', or use CSP 'frame-ancestors'."
    });
  }

  // Strict-Transport-Security (HSTS)
  const hsts = normalized['strict-transport-security'];
  if (!hsts) {
    findings.push({
      scenario: 'security_headers',
      control: 'hsts',
      severity: 'medium',
      status: 'fail',
      title: 'Missing Strict-Transport-Security (HSTS) header',
      issue: 'HSTS is not enforced; connections can be downgraded to unencrypted HTTP.',
      remediation: "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'."
    });
  }

  // CORS Wildcard with Credentials
  const corsOrigin = normalized['access-control-allow-origin'];
  const corsCreds = normalized['access-control-allow-credentials'];
  if (corsOrigin === '*' && corsCreds === 'true') {
    findings.push({
      scenario: 'security_headers',
      control: 'cors-wildcard-credentials',
      severity: 'critical',
      status: 'fail',
      title: 'Dangerous CORS: Wildcard origin with credentials',
      issue: "Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true is disallowed by standard browsers and represents an exploitable cross-origin data exposure.",
      remediation: 'Specify an explicit trusted origin instead of wildcard when credentials are supported.'
    });
  }

  return findings;
}

/**
 * Verify authorization boundaries and test for Insecure Direct Object Reference (IDOR) vulnerabilities.
 */
export async function testAuthorizationAndIdor({ probe, routes = [] }) {
  if (!probe) {
    return [{
      scenario: 'authorization_boundaries',
      control: 'unauthenticated-probing',
      severity: 'info',
      status: 'unverified',
      title: 'No live probe runner available',
      issue: 'Authorization boundary and IDOR testing requires an active target probe or mock probe runner.',
      remediation: 'Provide a live targetUrl or probe adapter to run active authorization tests.'
    }];
  }

  const findings = [];

  for (const route of routes) {
    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(route.method?.toUpperCase());
    const isProtected = route.protected !== false;

    if (!isProtected) continue;

    // Test 1: Unauthenticated request to protected endpoint
    try {
      const res = await probe({
        method: route.method || 'GET',
        path: route.path,
        headers: {},
        body: isMutating ? { test: 'payload' } : undefined
      });

      if (res.status >= 200 && res.status < 300) {
        findings.push({
          scenario: 'authorization_boundaries',
          control: 'unauthenticated-access',
          severity: isMutating ? 'critical' : 'high',
          status: 'fail',
          title: `Protected endpoint allowed unauthenticated ${route.method} request`,
          target: `${route.method} ${route.path}`,
          issue: `Endpoint returned HTTP ${res.status} without any authentication token or credentials.`,
          remediation: 'Enforce authentication middleware or token verification before handling this route.'
        });
      }
    } catch {
      // Network or connection errors
    }

    // Test 2: IDOR scenario with tampered / mismatched entity identifier
    if (route.path.includes(':id') || route.path.includes('/user-') || route.path.includes('/project-')) {
      try {
        const tamperedPath = route.path.replace(/:id|\/user-[\w-]+|\/project-[\w-]+/, '/unauthorized-foreign-tenant-id');
        const res = await probe({
          method: route.method || 'GET',
          path: tamperedPath,
          headers: { Authorization: 'Bearer valid-user-token-for-tenant-a' },
          body: isMutating ? { data: 'tampered-update' } : undefined
        });

        if (res.status >= 200 && res.status < 300) {
          findings.push({
            scenario: 'idor_scenarios',
            control: 'cross-tenant-idor',
            severity: 'critical',
            status: 'fail',
            title: `IDOR vulnerability: Cross-tenant data accessed on ${route.method} ${tamperedPath}`,
            target: `${route.method} ${tamperedPath}`,
            issue: `Caller with Tenant A credentials accessed or modified Tenant B resource (HTTP ${res.status}).`,
            remediation: 'Verify entity ownership and tenant bounds in database query, not just token validity.'
          });
        }
      } catch {
        // Ignored
      }
    }
  }

  return findings;
}

/**
 * Verify CSRF protection on mutating HTTP endpoints.
 */
export async function testCsrfProtection({ probe, mutatingRoutes = [] }) {
  if (!probe || !mutatingRoutes.length) {
    return [];
  }

  const findings = [];

  for (const route of mutatingRoutes) {
    try {
      // Send mutating request with session cookie but missing/invalid CSRF token header
      const res = await probe({
        method: route.method || 'POST',
        path: route.path,
        headers: {
          Cookie: 'session=valid_authenticated_cookie',
          Origin: 'http://malicious-attacker-site.com',
          Referer: 'http://malicious-attacker-site.com/attack.html'
        },
        body: { amount: 1000, recipient: 'attacker' }
      });

      // If server processes mutation successfully (200, 201, 204) without CSRF token or origin check
      if (res.status >= 200 && res.status < 300) {
        findings.push({
          scenario: 'csrf_verification',
          control: 'csrf-token-enforcement',
          severity: 'high',
          status: 'fail',
          title: `Missing CSRF protection on mutating route ${route.method} ${route.path}`,
          target: `${route.method} ${route.path}`,
          issue: `Mutating request from untrusted origin with cookie authentication succeeded without a valid CSRF token (HTTP ${res.status}).`,
          remediation: 'Implement SameSite=Lax/Strict cookies and verify CSRF token headers (or validate Origin/Referer headers) on all mutating requests.'
        });
      }
    } catch {
      // Ignored
    }
  }

  return findings;
}

/**
 * Test session security attributes and expiration policies.
 */
export function verifySessionSecurity(cookies = []) {
  const findings = [];

  for (const cookie of cookies) {
    const raw = typeof cookie === 'string' ? cookie : cookie.raw || '';
    const name = cookie.name || raw.split('=')[0]?.trim() || 'session';

    const isHttpOnly = /;\s*HttpOnly\b/i.test(raw) || cookie.httpOnly === true;
    const isSecure = /;\s*Secure\b/i.test(raw) || cookie.secure === true;
    const sameSiteMatch = raw.match(/;\s*SameSite=([A-Za-z]+)/i);
    const sameSite = cookie.sameSite || sameSiteMatch?.[1]?.toLowerCase();

    if (!isHttpOnly) {
      findings.push({
        scenario: 'session_security',
        control: 'cookie-httponly',
        severity: 'high',
        status: 'fail',
        title: `Session cookie '${name}' missing HttpOnly flag`,
        issue: 'Session cookie is readable by JavaScript, exposing it to exfiltration via XSS.',
        remediation: "Set 'HttpOnly' flag on all authentication and session cookies."
      });
    }

    if (!isSecure) {
      findings.push({
        scenario: 'session_security',
        control: 'cookie-secure',
        severity: 'high',
        status: 'fail',
        title: `Session cookie '${name}' missing Secure flag`,
        issue: 'Cookie may be transmitted over unencrypted HTTP connections.',
        remediation: "Set 'Secure' flag so cookie is only transmitted over HTTPS."
      });
    }

    if (!sameSite || sameSite === 'none') {
      findings.push({
        scenario: 'session_security',
        control: 'cookie-samesite',
        severity: 'medium',
        status: 'fail',
        title: `Session cookie '${name}' has missing or weak SameSite attribute`,
        issue: `Cookie SameSite is '${sameSite || 'missing'}', increasing risk of CSRF attacks.`,
        remediation: "Set 'SameSite=Lax' or 'SameSite=Strict' on session cookies."
      });
    }
  }

  return findings;
}

/**
 * Test rate limiting on sensitive routes.
 */
export async function testRateLimiting({ probe, sensitiveRoutes = [] }) {
  if (!probe || !sensitiveRoutes.length) {
    return [];
  }

  const findings = [];

  for (const route of sensitiveRoutes) {
    let triggeredRateLimit = false;
    let hasRateLimitHeaders = false;

    // Send a controlled, bounded burst of 12 requests
    const burstSize = 12;
    for (let i = 0; i < burstSize; i++) {
      try {
        const res = await probe({
          method: route.method || 'POST',
          path: route.path,
          headers: { 'X-Forwarded-For': '198.51.100.42' },
          body: { username: 'testuser', password: 'badpassword' }
        });

        if (res.status === 429) {
          triggeredRateLimit = true;
          break;
        }

        const headers = res.headers || {};
        if (headers['ratelimit-limit'] || headers['x-ratelimit-limit'] || headers['retry-after']) {
          hasRateLimitHeaders = true;
        }
      } catch {
        break;
      }
    }

    if (!triggeredRateLimit && !hasRateLimitHeaders) {
      findings.push({
        scenario: 'rate_limiting',
        control: 'rate-limit-enforcement',
        severity: 'medium',
        status: 'fail',
        title: `No rate limiting detected on sensitive endpoint ${route.method} ${route.path}`,
        target: `${route.method} ${route.path}`,
        issue: `Endpoint accepted ${burstSize} consecutive requests without returning 429 Too Many Requests or rate-limiting headers.`,
        remediation: 'Implement rate limiting (e.g. token bucket or leaky bucket per IP/account) to defend against brute-force and credential stuffing.'
      });
    }
  }

  return findings;
}

/**
 * Test input validation against SQL injection, path traversal, and malicious strings.
 */
export async function testInputValidation({ probe, routes = [] }) {
  if (!probe || !routes.length) {
    return [];
  }

  const payloads = [
    { type: 'sqli', name: 'SQL Injection probe', value: "' OR '1'='1' --" },
    { type: 'traversal', name: 'Path Traversal probe', value: '../../../../etc/passwd' },
    { type: 'xss', name: 'Stored/Reflected XSS probe', value: '<script>alert(1)</script>' }
  ];

  const findings = [];

  for (const route of routes) {
    if (route.method !== 'POST' && route.method !== 'PUT') continue;

    for (const payload of payloads) {
      try {
        const res = await probe({
          method: route.method,
          path: route.path,
          headers: { 'Content-Type': 'application/json' },
          body: { query: payload.value, name: payload.value, input: payload.value }
        });

        // If the server crashes with 500 Unhandled Exception or leaks SQL / system errors
        if (res.status === 500) {
          const bodyStr = typeof res.body === 'string' ? res.body : JSON.stringify(res.body || '');
          const errorLeaked = /syntax error|sql|sqlite|postgres|mysql|unhandled|fatal/i.test(bodyStr);

          findings.push({
            scenario: 'input_validation',
            control: `${payload.type}-unhandled-crash`,
            severity: 'high',
            status: 'fail',
            title: `Unhandled 500 Server Error on ${payload.name}`,
            target: `${route.method} ${route.path}`,
            issue: `Sending ${payload.name} triggered an unhandled 500 Internal Server Error.${errorLeaked ? ' Stack trace or internal database syntax details leaked in response.' : ''}`,
            remediation: 'Validate input against strict schemas, use parameterized queries, and catch errors cleanly without returning internal diagnostics.'
          });
        }
      } catch {
        // Ignored
      }
    }
  }

  return findings;
}

/**
 * Validate file upload controls (extension allowlists, MIME checks, size limits).
 */
export function verifyFileUploadControls({ uploadHandlers = [] }) {
  const findings = [];

  for (const handler of uploadHandlers) {
    if (!handler.hasExtensionWhitelist && !handler.allowedExtensions?.length) {
      findings.push({
        scenario: 'file_upload_validation',
        control: 'extension-allowlist',
        severity: 'high',
        status: 'fail',
        title: `File upload handler '${handler.name || handler.path}' lacks an explicit extension allowlist`,
        issue: 'Upload endpoint accepts arbitrary file extensions, creating risk of executable file upload (.exe, .php, .sh, .bat).',
        remediation: 'Enforce a strict whitelist of allowed file extensions and verify magic bytes on the server.'
      });
    }

    if (!handler.maxFileSizeBytes && !handler.maxSizeLimit) {
      findings.push({
        scenario: 'file_upload_validation',
        control: 'file-size-limit',
        severity: 'medium',
        status: 'fail',
        title: `File upload handler '${handler.name || handler.path}' lacks maximum file size limit`,
        issue: 'Upload endpoint allows unbounded upload payloads, creating risk of denial of service via disk exhaustion.',
        remediation: 'Configure a strict payload limit (e.g. 5MB) in upload middleware.'
      });
    }
  }

  return findings;
}

/**
 * Run safe, authorized Attack Simulation Lab suite.
 */
export async function runAttackSimulation({
  authorized = false,
  environment = 'staging',
  allowProduction = false,
  targetUrl = '',
  repositoryPath = '',
  headers = {},
  cookies = [],
  routes = [],
  uploadHandlers = [],
  probe = null,
  outputDirectory = ''
} = {}) {
  // STRICT SAFETY GUARD
  if (authorized !== true) {
    return {
      runId: randomUUID(),
      timestamp: new Date().toISOString(),
      authorized: false,
      environment,
      status: 'unverified',
      findings: [],
      summary: { totalScenarios: 0, passed: 0, failed: 0, unverified: 1, criticalCount: 0, highCount: 0 },
      evidence: 'Attack simulation was NOT executed. Explicit authorization is strictly required (set authorized: true).'
    };
  }

  // STRICT PRODUCTION GUARD
  if (environment.toLowerCase() === 'production' && allowProduction !== true) {
    return {
      runId: randomUUID(),
      timestamp: new Date().toISOString(),
      authorized: true,
      environment,
      status: 'unverified',
      findings: [],
      summary: { totalScenarios: 0, passed: 0, failed: 0, unverified: 1, criticalCount: 0, highCount: 0 },
      evidence: 'Attack simulation aborted: Intrusive security testing is strictly blocked against production environments without explicit allowProduction: true.'
    };
  }

  const runId = randomUUID();
  const timestamp = new Date().toISOString();
  const allFindings = [];
  const scenariosTested = [];

  // 1. Security Headers
  if (headers && Object.keys(headers).length > 0) {
    scenariosTested.push('security_headers');
    allFindings.push(...inspectSecurityHeaders(headers));
  }

  // 2. Session Security
  if (cookies && cookies.length > 0) {
    scenariosTested.push('session_security');
    allFindings.push(...verifySessionSecurity(cookies));
  }

  // 3. Authorization Boundaries and IDOR
  if (routes.length > 0 || probe) {
    scenariosTested.push('authorization_boundaries');
    scenariosTested.push('idor_scenarios');
    const authFindings = await testAuthorizationAndIdor({ probe, routes });
    allFindings.push(...authFindings);
  }

  // 4. CSRF Verification
  const mutatingRoutes = routes.filter(r => ['POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method?.toUpperCase()));
  if (mutatingRoutes.length > 0 && probe) {
    scenariosTested.push('csrf_verification');
    const csrfFindings = await testCsrfProtection({ probe, mutatingRoutes });
    allFindings.push(...csrfFindings);
  }

  // 5. Rate Limiting
  const sensitiveRoutes = routes.filter(r => /login|auth|password|token|register|checkout/i.test(r.path));
  if (sensitiveRoutes.length > 0 && probe) {
    scenariosTested.push('rate_limiting');
    const rateFindings = await testRateLimiting({ probe, sensitiveRoutes });
    allFindings.push(...rateFindings);
  }

  // 6. Input Validation
  if (routes.length > 0 && probe) {
    scenariosTested.push('input_validation');
    const inputFindings = await testInputValidation({ probe, routes });
    allFindings.push(...inputFindings);
  }

  // 7. File Upload Validation
  if (uploadHandlers.length > 0) {
    scenariosTested.push('file_upload_validation');
    allFindings.push(...verifyFileUploadControls({ uploadHandlers }));
  }

  // 8. Secret Scans if repositoryPath is provided
  if (repositoryPath) {
    scenariosTested.push('secret_scans');
    try {
      const secretResult = await scanForSecrets(repositoryPath);
      if (secretResult.findings?.length) {
        for (const item of secretResult.findings) {
          allFindings.push({
            scenario: 'secret_scans',
            control: 'committed-secrets',
            severity: 'critical',
            status: 'fail',
            title: `Secret found in repository: ${item.file}:${item.line}`,
            target: `${item.file}:${item.line}`,
            issue: item.kind || 'High-confidence secret marker discovered in code.',
            remediation: 'Revoke and rotate the exposed secret immediately, remove from git history, and use environment variables.'
          });
        }
      }
    } catch {
      // Ignored
    }
  }

  const failedFindings = allFindings.filter(f => f.status === 'fail');
  const criticalCount = failedFindings.filter(f => f.severity === 'critical').length;
  const highCount = failedFindings.filter(f => f.severity === 'high').length;

  const status = criticalCount > 0 || highCount > 0 ? 'fail' : failedFindings.length > 0 ? 'fail' : 'pass';

  const summary = {
    totalScenarios: scenariosTested.length,
    passed: scenariosTested.length - (failedFindings.length ? 1 : 0),
    failed: failedFindings.length,
    unverified: allFindings.filter(f => f.status === 'unverified').length,
    criticalCount,
    highCount
  };

  const evidence = `Attack Simulation Lab executed across ${scenariosTested.length} scenario(s) in '${environment}' environment. Findings: ${failedFindings.length} failed (${criticalCount} critical, ${highCount} high). Status: ${status}.`;

  const report = {
    runId,
    timestamp,
    authorized: true,
    environment,
    targetUrl,
    scenariosTested,
    findings: allFindings,
    summary,
    status,
    evidence
  };

  if (outputDirectory) {
    try {
      await mkdir(outputDirectory, { recursive: true });
      const reportFile = path.join(outputDirectory, `attack-lab-${runId}.json`);
      await writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
      report.artifactPath = reportFile;
    } catch {
      // Non-fatal
    }
  }

  return report;
}
