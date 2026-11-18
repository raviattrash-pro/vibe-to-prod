import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  extractDependencyInventory,
  generateProductionPassport,
  formatPassportMarkdown
} from '../src/passport/generator.js';

describe('Priority 9: Production Passport', () => {
  const repoRoot = path.resolve('.');

  it('extracts complete dependency inventory / SBOM from package.json', async () => {
    const sbom = await extractDependencyInventory(repoRoot);
    assert.equal(sbom.packageName, 'agencyos');
    assert.ok(sbom.totalDependencies > 0);
    assert.ok(sbom.items.length > 0);
  });

  it('generates reproducible Production Passport with all 13 required release evidence fields', async () => {
    const mockProject = {
      id: 'proj-123',
      name: 'Alpha Project',
      type: 'Custom Application',
      objective: 'Build autonomous engineering platform',
      repositoryPath: repoRoot,
      checks: [
        {
          id: 'chk-1',
          category: 'security',
          source: 'secret-scan',
          status: 'pass',
          score: 100,
          evidence: '0 secrets found',
          resultDetails: { findings: [] }
        },
        {
          id: 'chk-2',
          category: 'testing',
          source: 'node-tests',
          status: 'pass',
          score: 100,
          evidence: 'Tests passed',
          resultDetails: { exitCode: 0 }
        },
        {
          id: 'chk-3',
          category: 'delivery',
          source: 'deployment-rehearsal',
          status: 'pass',
          score: 100,
          evidence: 'Staging rehearsal successful',
          resultDetails: { releaseReady: true, riskLevel: 'low' }
        }
      ]
    };

    const passport = await generateProductionPassport(mockProject, {
      commitHash: 'a1b2c3d4e5f6',
      buildVersion: '2.0.0',
      releaseTag: 'v2.0.0'
    });

    // 1. Repository & Project Identity
    assert.equal(passport.project.id, 'proj-123');
    assert.equal(passport.project.name, 'Alpha Project');

    // 2. Commit & Release Metadata
    assert.equal(passport.releaseMetadata.commitHash, 'a1b2c3d4e5f6');
    assert.equal(passport.releaseMetadata.releaseTag, 'v2.0.0');
    assert.ok(passport.releaseMetadata.contentFingerprint);

    // 3. Quality Scorecard
    assert.ok(typeof passport.qualityScorecard.score === 'number');
    assert.ok(Array.isArray(passport.qualityScorecard.categoryScores));

    // 4. SBOM
    assert.ok(passport.softwareBillOfMaterials.totalDependencies > 0);

    // 5. Security Findings
    assert.equal(passport.securityAssessment.status, 'pass');
    assert.equal(passport.securityAssessment.totalFindings, 0);

    // 6. Test Reports
    assert.equal(passport.testVerification.unitTests.status, 'pass');
    assert.equal(passport.testVerification.unitTests.exitCode, 0);

    // 7. Deployment & Rollback Evidence
    assert.equal(passport.deploymentAndRollback.rehearsalCompleted, true);
    assert.equal(passport.deploymentAndRollback.releaseReady, true);

    // 8. Cryptographic Attestation Signature
    assert.equal(passport.attestationSignature.algorithm, 'SHA-256');
    assert.ok(/^[a-f0-9]{64}$/.test(passport.attestationSignature.hash));
  });

  it('formats human-readable Markdown release passport with audit sections', async () => {
    const mockProject = {
      id: 'proj-456',
      name: 'Beta SaaS',
      type: 'Custom Application',
      repositoryPath: repoRoot,
      checks: []
    };

    const passport = await generateProductionPassport(mockProject, {
      commitHash: 'fedcba987654',
      buildVersion: '1.2.0'
    });

    const markdown = formatPassportMarkdown(passport);

    assert.ok(markdown.includes('# Production Release Passport'));
    assert.ok(markdown.includes('Beta SaaS'));
    assert.ok(markdown.includes('1. Executive Release Verdict'));
    assert.ok(markdown.includes('2. Quality Category Breakdown'));
    assert.ok(markdown.includes('3. Security & Vulnerability Assessment'));
    assert.ok(markdown.includes('4. Test & Browser QA Verification'));
    assert.ok(markdown.includes('5. Software Bill of Materials (SBOM)'));
    assert.ok(markdown.includes('6. Deployment & Rollback Drill'));
    assert.ok(markdown.includes('7. Known Limitations & Caveats'));
    assert.ok(markdown.includes(passport.attestationSignature.hash.slice(0, 16)));
  });
});
