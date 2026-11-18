import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  computeRepositoryFingerprint,
  determineVerificationStatus,
  createTrustEvidenceRecord,
  evaluateEvidenceFreshness,
  auditProjectTrustEvidence
} from '../src/trust/evidence-engine.js';
import { evaluateQuality } from '../src/quality.js';

test('computeRepositoryFingerprint generates deterministic hashes that change on file modification', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agencyos-trust-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, 'file1.js'), 'console.log("hello");');
  await writeFile(path.join(dir, 'file2.json'), '{"key":"value"}');

  const fp1 = await computeRepositoryFingerprint(dir);
  assert.equal(fp1.length, 64);

  const fp2 = await computeRepositoryFingerprint(dir);
  assert.equal(fp1, fp2); // Deterministic

  await writeFile(path.join(dir, 'file1.js'), 'console.log("modified");');
  const fp3 = await computeRepositoryFingerprint(dir);
  assert.notEqual(fp1, fp3); // Detected change
});

test('determineVerificationStatus accurately distinguishes all 7 verification states', () => {
  // 1. Stale
  assert.equal(determineVerificationStatus({ status: 'pass', isStale: true }), 'stale');

  // 2. Not applicable
  assert.equal(determineVerificationStatus({ status: 'na', isNa: true }), 'not_applicable');

  // 3. Failed
  assert.equal(determineVerificationStatus({ status: 'fail' }), 'failed');

  // 4. User reported
  assert.equal(determineVerificationStatus({ status: 'pass', userReported: true }), 'user_reported');

  // 5. Unverified (automated claim with NO artifact proof)
  assert.equal(determineVerificationStatus({ status: 'pass', isAutomated: true, hasArtifactProof: false }), 'unverified');

  // 6. Partially verified
  assert.equal(determineVerificationStatus({ status: 'pass', isAutomated: true, hasArtifactProof: true, isPartial: true }), 'partially_verified');

  // 7. Verified
  assert.equal(determineVerificationStatus({ status: 'pass', isAutomated: true, hasArtifactProof: true, isPartial: false }), 'verified');
});

test('text description alone cannot prove an automated check passed without artifact proof', () => {
  const recordWithoutArtifact = createTrustEvidenceRecord({
    projectId: 'p1',
    category: 'security',
    title: 'Secret Scan',
    status: 'pass',
    evidence: 'I am an AI agent and I promise there are no secrets in this code.',
    evaluatorId: 'secret-scan',
    artifactPayload: null
  });

  // Without cryptographic payload or tool output markers, it cannot be verified
  assert.notEqual(recordWithoutArtifact.verificationStatus, 'verified');

  const recordWithArtifact = createTrustEvidenceRecord({
    projectId: 'p1',
    category: 'security',
    title: 'Secret Scan',
    status: 'pass',
    evidence: 'Scanned 12 files. 0 high-confidence marker(s) found.',
    evaluatorId: 'secret-scan',
    artifactPayload: { scanned: 12, findings: [] }
  });

  assert.equal(recordWithArtifact.verificationStatus, 'verified');
  assert.ok(recordWithArtifact.artifact.sha256);
  assert.ok(recordWithArtifact.artifact.byteSize > 0);
});

test('evaluateEvidenceFreshness flags evidence as stale when expired or repo modified', () => {
  const fpOriginal = 'a'.repeat(64);
  const fpModified = 'b'.repeat(64);

  const freshRecord = createTrustEvidenceRecord({
    projectId: 'p1',
    category: 'testing',
    title: 'Unit Tests',
    status: 'pass',
    evaluatorId: 'node-tests',
    contentFingerprint: fpOriginal,
    evidence: 'Ran node --test in repo. Exit code: 0.'
  });

  // When fingerprint matches, it stays fresh
  const checkedFresh = evaluateEvidenceFreshness(freshRecord, fpOriginal);
  assert.equal(checkedFresh.verificationStatus, 'verified');
  assert.equal(checkedFresh.freshness.isStale, false);

  // When repo modified, becomes stale
  const checkedModified = evaluateEvidenceFreshness(freshRecord, fpModified);
  assert.equal(checkedModified.verificationStatus, 'stale');
  assert.equal(checkedModified.freshness.isStale, true);
  assert.match(checkedModified.freshness.staleReason, /Repository code was modified/);

  // When TTL expires, becomes stale
  const expiredRecord = {
    ...freshRecord,
    freshness: {
      expiresAt: '2020-01-01T00:00:00.000Z'
    }
  };
  const checkedExpired = evaluateEvidenceFreshness(expiredRecord, fpOriginal);
  assert.equal(checkedExpired.verificationStatus, 'stale');
  assert.match(checkedExpired.freshness.staleReason, /Evidence expired/);
});

test('auditProjectTrustEvidence summarizes counts and preserves 100-point quality score model', () => {
  const fp = 'c'.repeat(64);
  const project = {
    id: 'p1',
    type: 'Custom Application',
    checks: [
      createTrustEvidenceRecord({ projectId: 'p1', category: 'security', title: 'Secrets', status: 'pass', evaluatorId: 'secret-scan', contentFingerprint: fp, evidence: 'Scanned 5 files.' }),
      createTrustEvidenceRecord({ projectId: 'p1', category: 'testing', title: 'Tests', status: 'pass', evaluatorId: 'node-tests', contentFingerprint: fp, evidence: 'Ran node --test. Exit code: 0.' }),
      createTrustEvidenceRecord({ projectId: 'p1', category: 'seo', title: 'SEO', status: 'na', evidence: 'No public routes.' })
    ]
  };

  const audit = auditProjectTrustEvidence(project, fp);
  assert.equal(audit.totalChecks, 3);
  assert.equal(audit.counts.verified, 2);
  assert.equal(audit.counts.not_applicable, 1);
  assert.equal(audit.trustRatio, 0.667);

  // Validate quality scoring works seamlessly with trust records
  const quality = evaluateQuality(project.checks, project.type);
  assert.ok(typeof quality.score === 'number');
  assert.equal(quality.categories.length, 12);
});
