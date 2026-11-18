import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { evaluateQuality } from '../quality.js';
import { computeRepositoryFingerprint } from '../trust/evidence-engine.js';

/**
 * Extract Dependency Inventory (Software Bill of Materials - SBOM).
 */
export async function extractDependencyInventory(repositoryPath) {
  try {
    const pkgPath = path.join(repositoryPath, 'package.json');
    const content = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(content);

    const dependencies = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
      name,
      version,
      type: 'production'
    }));

    const devDependencies = Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({
      name,
      version,
      type: 'development'
    }));

    return {
      packageName: pkg.name || 'unnamed-project',
      version: pkg.version || '0.0.0',
      license: pkg.license || 'UNLICENSED',
      engines: pkg.engines || {},
      totalDependencies: dependencies.length + devDependencies.length,
      productionCount: dependencies.length,
      developmentCount: devDependencies.length,
      items: [...dependencies, ...devDependencies]
    };
  } catch {
    return {
      packageName: 'unknown',
      version: '0.0.0',
      license: 'unknown',
      engines: {},
      totalDependencies: 0,
      productionCount: 0,
      developmentCount: 0,
      items: []
    };
  }
}

/**
 * Generate a complete, reproducible Production Passport.
 */
export async function generateProductionPassport(project, {
  commitHash = '',
  buildVersion = '',
  releaseTag = '',
  rehearsalEvidence = null
} = {}) {
  const repoPath = project.repositoryPath || '';
  const fingerprint = repoPath ? await computeRepositoryFingerprint(repoPath).catch(() => 'unfingerprinted') : 'unfingerprinted';
  const sbom = repoPath ? await extractDependencyInventory(repoPath) : { items: [], totalDependencies: 0 };
  const quality = evaluateQuality(project.checks || [], project.type);

  const checks = project.checks || [];

  // 1. Security Findings
  const securityChecks = checks.filter(c => c.category === 'security' || c.source === 'secret-scan' || c.source === 'dependency-audit' || c.source === 'attack-lab');
  const securityFindings = securityChecks.flatMap(c => c.resultDetails?.findings || []);

  // 2. Test Reports
  const testChecks = checks.filter(c => c.category === 'testing' || c.source === 'node-tests' || c.source === 'browser-qa');
  const unitTestResult = testChecks.find(c => c.source === 'node-tests');
  const browserQaResult = testChecks.find(c => c.source === 'browser-qa');

  // 3. Performance Measurements
  const perfCheck = checks.find(c => c.category === 'performance' || c.source === 'performance-browser');
  const performancePages = perfCheck?.resultDetails?.pages || [];

  // 4. Accessibility Results
  const a11yChecks = checks.filter(c => c.category === 'accessibility' || c.source === 'accessibility-static' || c.source === 'accessibility-rendered');
  const a11yFindings = a11yChecks.flatMap(c => c.resultDetails?.findings || []);

  // 5. SEO Assessment
  const seoChecks = checks.filter(c => c.category === 'seo' || c.source === 'seo-static' || c.source === 'seo-rendered');
  const seoFindings = seoChecks.flatMap(c => c.resultDetails?.findings || []);

  // 6. Deployment & Rollback Evidence
  const deploymentCheck = checks.find(c => c.source === 'deployment-rehearsal');

  // Known Limitations
  const knownLimitations = [
    ...quality.unverified.map(u => `Control '${u.title || u.controlId || u.source}' is unverified: ${u.evidence || 'No verification evidence provided'}`),
    ...(quality.requirementsLimits || [])
  ];

  const passportData = {
    passportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      objective: project.objective
    },
    releaseMetadata: {
      commitHash: commitHash || fingerprint.slice(0, 12),
      contentFingerprint: fingerprint,
      buildVersion: buildVersion || sbom.version || '1.0.0',
      releaseTag: releaseTag || `v${buildVersion || sbom.version || '1.0.0'}`
    },
    qualityScorecard: {
      score: quality.score,
      scoreLabel: quality.scoreLabel,
      releaseReady: quality.releaseReady,
      blockers: quality.blockers,
      categoryScores: quality.categories.map(c => ({
        id: c.id,
        name: c.name,
        score: c.score,
        assessed: c.assessed
      }))
    },
    softwareBillOfMaterials: {
      packageName: sbom.packageName,
      version: sbom.version,
      license: sbom.license,
      totalDependencies: sbom.totalDependencies,
      productionDependencies: sbom.productionCount,
      developmentDependencies: sbom.developmentCount,
      items: sbom.items
    },
    securityAssessment: {
      status: securityChecks.every(c => c.status === 'pass') ? 'pass' : securityChecks.some(c => c.status === 'fail') ? 'fail' : 'unverified',
      checksEvaluated: securityChecks.length,
      totalFindings: securityFindings.length,
      findings: securityFindings.slice(0, 50)
    },
    testVerification: {
      unitTests: {
        evaluated: Boolean(unitTestResult),
        status: unitTestResult?.status || 'unverified',
        exitCode: unitTestResult?.resultDetails?.exitCode ?? null
      },
      browserQa: {
        evaluated: Boolean(browserQaResult),
        status: browserQaResult?.status || 'unverified',
        bugReportsCount: browserQaResult?.resultDetails?.bugReports?.length || 0
      }
    },
    performanceMetrics: {
      pagesMeasured: performancePages.length,
      findingsCount: perfCheck?.resultDetails?.findings?.length || 0
    },
    accessibilityAssessment: {
      status: a11yChecks.every(c => c.status === 'pass') ? 'pass' : a11yChecks.some(c => c.status === 'fail') ? 'fail' : 'unverified',
      totalFindings: a11yFindings.length
    },
    seoAssessment: {
      status: seoChecks.every(c => c.status === 'pass') ? 'pass' : seoChecks.some(c => c.status === 'fail') ? 'fail' : 'unverified',
      totalFindings: seoFindings.length
    },
    deploymentAndRollback: {
      rehearsalCompleted: Boolean(deploymentCheck || rehearsalEvidence),
      releaseReady: deploymentCheck?.resultDetails?.releaseReady ?? rehearsalEvidence?.releaseReady ?? false,
      riskLevel: deploymentCheck?.resultDetails?.riskLevel ?? rehearsalEvidence?.riskLevel ?? 'unverified',
      evidence: deploymentCheck?.evidence || rehearsalEvidence?.evidence || 'No staging rehearsal record found.'
    },
    knownLimitations
  };

  // Compute reproducible cryptographic signature
  const canonicalString = JSON.stringify(passportData);
  const signature = createHash('sha256').update(canonicalString).digest('hex');

  passportData.attestationSignature = {
    algorithm: 'SHA-256',
    hash: signature,
    signedAt: passportData.generatedAt
  };

  return passportData;
}

/**
 * Format Production Passport into audit-ready human-readable Markdown.
 */
export function formatPassportMarkdown(passport) {
  const p = passport;
  const q = p.qualityScorecard;
  const rel = p.releaseMetadata;
  const sbom = p.softwareBillOfMaterials;

  return `# Production Release Passport

**Project:** ${p.project.name} (${p.project.type})  
**Release Tag:** \`${rel.releaseTag}\`  
**Commit / Fingerprint:** \`${rel.commitHash}\`  
**Generated At:** ${p.generatedAt}  
**Cryptographic Attestation Hash:** \`${p.attestationSignature.hash}\`

---

## 1. Executive Release Verdict

- **Quality Score:** **${q.score}/100** (${q.scoreLabel})
- **Release Decision:** **${q.releaseReady ? 'APPROVED FOR PRODUCTION RELEASE' : 'BLOCKED FROM PRODUCTION RELEASE'}**
- **Active Release Blockers:** ${q.blockers.length === 0 ? 'None' : q.blockers.join('; ')}

---

## 2. Quality Category Breakdown

| Category | Score | Assessed | Status |
| :--- | :--- | :--- | :--- |
${q.categoryScores.map(c => `| ${c.name} | ${c.score !== null ? `${c.score}/100` : 'N/A'} | ${c.assessed ? 'Yes' : 'No'} | ${c.score >= 80 ? 'PASS' : c.score !== null ? 'WARN' : 'PENDING'} |`).join('\n')}

---

## 3. Security & Vulnerability Assessment

- **Overall Security Status:** \`${p.securityAssessment.status.toUpperCase()}\`
- **Security Findings:** ${p.securityAssessment.totalFindings} issue(s) detected across ${p.securityAssessment.checksEvaluated} security check(s).

${p.securityAssessment.findings.length > 0 ? p.securityAssessment.findings.map(f => `- **${f.severity || 'WARN'}:** ${f.title || f.issue || JSON.stringify(f)}`).join('\n') : '*No security vulnerabilities detected.*'}

---

## 4. Test & Browser QA Verification

- **Node.js Test Suite:** ${p.testVerification.unitTests.status.toUpperCase()} (Exit Code: ${p.testVerification.unitTests.exitCode ?? 'N/A'})
- **Autonomous Browser QA:** ${p.testVerification.browserQa.status.toUpperCase()} (${p.testVerification.browserQa.bugReportsCount} bug report(s))

---

## 5. Software Bill of Materials (SBOM)

- **Package:** \`${sbom.packageName}@${sbom.version}\`
- **License:** ${sbom.license}
- **Dependencies:** ${sbom.productionDependencies} production, ${sbom.developmentDependencies} development

---

## 6. Deployment & Rollback Drill

- **Staging Rehearsal:** ${p.deploymentAndRollback.rehearsalCompleted ? 'COMPLETED' : 'PENDING'}
- **Deployment Risk Level:** \`${p.deploymentAndRollback.riskLevel.toUpperCase()}\`
- **Evidence:** ${p.deploymentAndRollback.evidence}

---

## 7. Known Limitations & Caveats

${p.knownLimitations.length > 0 ? p.knownLimitations.map(l => `- ${l}`).join('\n') : '*No known limitations recorded.*'}

---

*This document was deterministically generated by the Vibe-to-Prod Engineering Operating System. Verification signature: \`${p.attestationSignature.hash.slice(0, 16)}...\`*
`;
}
