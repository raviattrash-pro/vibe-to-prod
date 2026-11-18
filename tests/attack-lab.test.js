import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectSecurityHeaders,
  testAuthorizationAndIdor,
  testCsrfProtection,
  verifySessionSecurity,
  testRateLimiting,
  testInputValidation,
  verifyFileUploadControls,
  runAttackSimulation
} from '../src/security/attack-lab.js';

describe('Priority 5: Attack Simulation Lab', () => {
  it('strictly blocks execution without explicit authorization', async () => {
    const unauth = await runAttackSimulation({ authorized: false });
    assert.equal(unauth.authorized, false);
    assert.equal(unauth.status, 'unverified');
    assert.match(unauth.evidence, /Explicit authorization is strictly required/i);
  });

  it('safely blocks intrusive tests against production environment without allowProduction flag', async () => {
    const prodAttempt = await runAttackSimulation({
      authorized: true,
      environment: 'production',
      allowProduction: false
    });
    assert.equal(prodAttempt.status, 'unverified');
    assert.match(prodAttempt.evidence, /strictly blocked against production/i);
  });

  it('inspectSecurityHeaders identifies missing headers, unsafe policies, and dangerous CORS', () => {
    // Bad headers
    const badHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      'X-Content-Type-Options': 'text/html' // not nosniff
    };
    const findings = inspectSecurityHeaders(badHeaders);
    assert.ok(findings.some(f => f.control === 'cors-wildcard-credentials' && f.severity === 'critical'));
    assert.ok(findings.some(f => f.control === 'csp-unsafe-inline'));
    assert.ok(findings.some(f => f.control === 'csp-unsafe-eval'));
    assert.ok(findings.some(f => f.control === 'x-content-type-options'));
    assert.ok(findings.some(f => f.control === 'x-frame-options'));
    assert.ok(findings.some(f => f.control === 'hsts'));

    // Good headers
    const goodHeaders = {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-rAnd0m'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };
    const goodFindings = inspectSecurityHeaders(goodHeaders);
    assert.equal(goodFindings.length, 0);
  });

  it('detects unauthenticated access and IDOR vulnerabilities on protected routes', async () => {
    const routes = [
      { method: 'POST', path: '/api/projects/:id/delete', protected: true }
    ];

    // Mock probe that improperly allows unauthenticated access and cross-tenant access
    const vulnerableProbe = async ({ method, path, headers }) => {
      // Allows unauthenticated access
      if (!headers.Authorization) {
        return { status: 200, body: { deleted: true } };
      }
      // Allows cross-tenant access
      if (path.includes('unauthorized-foreign-tenant-id')) {
        return { status: 200, body: { victimData: 'sensitive-leaked-project' } };
      }
      return { status: 200, body: { ok: true } };
    };

    const findings = await testAuthorizationAndIdor({ probe: vulnerableProbe, routes });
    assert.ok(findings.some(f => f.control === 'unauthenticated-access' && f.severity === 'critical'));
    assert.ok(findings.some(f => f.control === 'cross-tenant-idor' && f.severity === 'critical'));
  });

  it('verifies CSRF protection blocks mutating requests lacking CSRF token from untrusted origin', async () => {
    const mutatingRoutes = [{ method: 'POST', path: '/api/account/transfer' }];

    // Vulnerable probe accepting CSRF
    const vulnProbe = async () => ({ status: 200, body: { success: true } });
    const vulnFindings = await testCsrfProtection({ probe: vulnProbe, mutatingRoutes });
    assert.ok(vulnFindings.some(f => f.control === 'csrf-token-enforcement' && f.status === 'fail'));

    // Secure probe requiring CSRF / origin check
    const secureProbe = async () => ({ status: 403, body: { error: 'Invalid CSRF token or origin mismatch' } });
    const secureFindings = await testCsrfProtection({ probe: secureProbe, mutatingRoutes });
    assert.equal(secureFindings.length, 0);
  });

  it('evaluates cookie attributes for session security (HttpOnly, Secure, SameSite)', () => {
    const insecureCookies = [
      'session_id=12345; Path=/; Domain=example.com'
    ];
    const findings = verifySessionSecurity(insecureCookies);
    assert.ok(findings.some(f => f.control === 'cookie-httponly'));
    assert.ok(findings.some(f => f.control === 'cookie-secure'));
    assert.ok(findings.some(f => f.control === 'cookie-samesite'));

    const secureCookies = [
      'session_id=12345; Path=/; HttpOnly; Secure; SameSite=Lax'
    ];
    const secureFindings = verifySessionSecurity(secureCookies);
    assert.equal(secureFindings.length, 0);
  });

  it('detects unhandled crashes on adversarial input injection payloads', async () => {
    const routes = [{ method: 'POST', path: '/api/search' }];

    // Crashy probe leaking SQL error
    const crashProbe = async () => ({
      status: 500,
      body: 'Fatal: SQL syntax error near OR 1=1'
    });

    const findings = await testInputValidation({ probe: crashProbe, routes });
    assert.ok(findings.some(f => f.scenario === 'input_validation' && f.status === 'fail'));
  });

  it('evaluates file upload handlers for extension whitelists and size limits', () => {
    const uploadHandlers = [
      { name: 'avatar-upload', path: '/api/uploads/avatar', hasExtensionWhitelist: false }
    ];
    const findings = verifyFileUploadControls({ uploadHandlers });
    assert.ok(findings.some(f => f.control === 'extension-allowlist'));
    assert.ok(findings.some(f => f.control === 'file-size-limit'));
  });

  it('runs complete authorized attack simulation suite and generates report', async () => {
    const result = await runAttackSimulation({
      authorized: true,
      environment: 'staging',
      headers: {
        'Content-Security-Policy': "default-src 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000'
      },
      cookies: ['session=token; HttpOnly; Secure; SameSite=Strict'],
      routes: [],
      uploadHandlers: [{ name: 'doc', hasExtensionWhitelist: true, maxFileSizeBytes: 5000000 }]
    });

    assert.equal(result.authorized, true);
    assert.equal(result.status, 'pass');
    assert.equal(result.summary.failed, 0);
    assert.ok(result.evidence.includes('Attack Simulation Lab executed'));
  });
});
