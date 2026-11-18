import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const defaultIgnored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', 'vendor']);

export async function computeRepositoryFingerprint(repositoryPath) {
  if (!repositoryPath || typeof repositoryPath !== 'string') {
    return '0'.repeat(64);
  }

  try {
    const fileHashes = [];
    async function walk(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!defaultIgnored.has(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          // Bounded hash of first 500KB of each file for performance
          const stats = await stat(fullPath);
          if (stats.size > 2_000_000) continue; // skip huge binaries
          const buf = await readFile(fullPath);
          const hash = createHash('sha256').update(buf).digest('hex');
          const relPath = path.relative(repositoryPath, fullPath).replace(/\\/g, '/');
          fileHashes.push(`${relPath}:${hash}`);
        }
      }
    }

    await walk(repositoryPath);
    fileHashes.sort();
    return createHash('sha256').update(fileHashes.join('\n')).digest('hex');
  } catch {
    return createHash('sha256').update(repositoryPath).digest('hex');
  }
}

export function determineVerificationStatus({
  status,
  isAutomated = false,
  hasArtifactProof = false,
  isPartial = false,
  isStale = false,
  userReported = false,
  isNa = false
}) {
  if (isStale) return 'stale';
  if (isNa) return 'not_applicable';
  if (status === 'fail') return 'failed';
  if (userReported) return 'user_reported';
  if (!isAutomated || !hasArtifactProof) return 'unverified';
  if (isPartial) return 'partially_verified';
  return 'verified';
}

export function createTrustEvidenceRecord({
  checkId = randomUUID(),
  projectId,
  controlId,
  category,
  title,
  status = 'unverified',
  evidence = '',
  contentFingerprint = '0'.repeat(64),
  commitHash = '',
  evaluatorId = 'unknown',
  evaluatorVersion = '1.0.0',
  executionMode = 'local-process',
  artifactPath = null,
  artifactPayload = null,
  limitations = [],
  isPartial = false,
  maxAgeHours = 168 // 7 days default
}) {
  const now = new Date();
  const capturedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + maxAgeHours * 3600 * 1000).toISOString();

  let artifactSha256 = null;
  let artifactByteSize = 0;

  if (artifactPayload) {
    const buf = Buffer.isBuffer(artifactPayload) ? artifactPayload : Buffer.from(typeof artifactPayload === 'string' ? artifactPayload : JSON.stringify(artifactPayload));
    artifactSha256 = createHash('sha256').update(buf).digest('hex');
    artifactByteSize = buf.length;
  }

  const isAutomated = ['secret-scan', 'node-tests', 'seo-static', 'accessibility-static', 'deployment-config', 'performance-browser', 'dependency-audit', 'rendered-browser', 'playwright-qa', 'attack-lab'].includes(evaluatorId);
  const hasArtifactProof = Boolean(artifactSha256 || (isAutomated && evidence && (artifactPath || evidence.includes('Exit code') || evidence.includes('finding(s)') || evidence.includes('Scanned'))));

  const verificationStatus = determineVerificationStatus({
    status,
    isAutomated,
    hasArtifactProof,
    isPartial,
    isStale: false,
    userReported: !isAutomated,
    isNa: status === 'na'
  });

  return {
    id: checkId,
    projectId,
    controlId: controlId || evaluatorId,
    category,
    title,
    status,
    score: status === 'pass' ? 100 : 0,
    evidence: String(evidence || '').slice(0, 2000),
    verificationStatus,
    provenance: {
      kind: isAutomated ? 'automated' : 'user-reported',
      evaluatorId,
      evaluatorVersion,
      executionMode,
      capturedAt
    },
    fingerprint: {
      content: contentFingerprint,
      commit: commitHash || null
    },
    artifact: {
      path: artifactPath,
      sha256: artifactSha256,
      byteSize: artifactByteSize
    },
    freshness: {
      maxAgeHours,
      capturedAt,
      expiresAt,
      isStale: false
    },
    limitations: [...limitations],
    createdAt: capturedAt
  };
}

export function evaluateEvidenceFreshness(evidenceRecord, currentFingerprint) {
  if (!evidenceRecord) return null;
  const now = new Date().toISOString();
  let isStale = false;
  const reasons = [];

  // Expiration by TTL
  if (evidenceRecord.freshness?.expiresAt && now > evidenceRecord.freshness.expiresAt) {
    isStale = true;
    reasons.push(`Evidence expired on ${evidenceRecord.freshness.expiresAt}`);
  }

  // Fingerprint mismatch (code modified since check)
  if (currentFingerprint && evidenceRecord.fingerprint?.content && evidenceRecord.fingerprint.content !== currentFingerprint && evidenceRecord.fingerprint.content !== '0'.repeat(64)) {
    isStale = true;
    reasons.push('Repository code was modified since this evidence was captured.');
  }

  if (isStale) {
    return {
      ...evidenceRecord,
      verificationStatus: 'stale',
      freshness: {
        ...(evidenceRecord.freshness || {}),
        isStale: true,
        staleReason: reasons.join(' ')
      }
    };
  }

  return {
    ...evidenceRecord,
    freshness: {
      ...(evidenceRecord.freshness || {}),
      isStale: false
    }
  };
}

export function auditProjectTrustEvidence(project, currentFingerprint) {
  const checks = project.checks || [];
  const evaluated = checks.map(c => evaluateEvidenceFreshness(c, currentFingerprint));

  const counts = {
    verified: 0,
    partially_verified: 0,
    user_reported: 0,
    unverified: 0,
    failed: 0,
    not_applicable: 0,
    stale: 0
  };

  for (const check of evaluated) {
    const vStatus = check.verificationStatus || 'unverified';
    if (counts[vStatus] !== undefined) {
      counts[vStatus]++;
    } else {
      counts.unverified++;
    }
  }

  return {
    projectId: project.id,
    currentFingerprint,
    totalChecks: evaluated.length,
    counts,
    trustRatio: evaluated.length ? Number(((counts.verified + counts.partially_verified) / evaluated.length).toFixed(3)) : 0,
    evaluatedChecks: evaluated
  };
}
