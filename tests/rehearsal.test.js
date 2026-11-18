import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  validateConfiguration,
  checkDeploymentSecrets,
  validateMigrations,
  verifyBackupAvailability,
  verifyHealthEndpoints,
  checkDeploymentDependencies,
  executeDeploymentRehearsal
} from '../src/deployment/rehearsal.js';

describe('Priority 8: Deployment Rehearsal', () => {
  const repoRoot = path.resolve('.');

  it('strictly blocks deployment rehearsal against production without explicit allowProductionDeployment', async () => {
    const result = await executeDeploymentRehearsal({
      repositoryPath: repoRoot,
      environment: 'production',
      allowProductionDeployment: false
    });

    assert.equal(result.releaseReady, false);
    assert.equal(result.riskLevel, 'critical');
    assert.ok(result.blockers.some(b => b.includes('prohibited without explicit allowProductionDeployment')));
  });

  it('validates configuration and package entrypoints', async () => {
    const configCheck = await validateConfiguration(repoRoot);
    assert.equal(configCheck.passed, true);
    assert.equal(configCheck.hasDeployConfig, true);
  });

  it('verifies backup availability and flags missing or stale backups', () => {
    // Missing backup
    const missing = verifyBackupAvailability({});
    assert.equal(missing.passed, false);
    assert.ok(missing.issues.some(i => i.issue.includes('No verified database or project backup')));

    // Fresh backup (2 hours old)
    const freshTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fresh = verifyBackupAvailability({ lastBackupTimestamp: freshTime });
    assert.equal(fresh.passed, true);
    assert.equal(fresh.issues.length, 0);

    // Stale backup (48 hours old)
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const stale = verifyBackupAvailability({ lastBackupTimestamp: staleTime });
    assert.ok(stale.issues.some(i => i.issue.includes('exceeds recommended 24h RPO')));
  });

  it('verifies health endpoints and catches non-200 responses', async () => {
    // Healthy probe
    const healthyProbe = async () => ({ status: 200, responseTimeMs: 35 });
    const healthy = await verifyHealthEndpoints({ healthProbe: healthyProbe });
    assert.equal(healthy.passed, true);

    // Failing probe
    const failingProbe = async () => ({ status: 503 });
    const failing = await verifyHealthEndpoints({ healthProbe: failingProbe });
    assert.equal(failing.passed, false);
    assert.ok(failing.issues.some(i => i.issue.includes('returned status 503')));
  });

  it('flags unhealthy or unreachable downstream deployment dependencies', () => {
    const dependencies = [
      { name: 'PostgreSQL Database', healthy: true },
      { name: 'Redis Cache', healthy: false, status: 'unreachable' }
    ];

    const result = checkDeploymentDependencies({ dependencies });
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(i => i.issue.includes("Downstream dependency 'Redis Cache'")));
  });

  it('executes full rehearsal in staging and reports Release Risk Scorecard', async () => {
    const freshBackup = new Date(Date.now() - 3600 * 1000).toISOString();
    const healthyProbe = async () => ({ status: 200, responseTimeMs: 25 });

    const rehearsal = await executeDeploymentRehearsal({
      repositoryPath: repoRoot,
      environment: 'staging',
      healthProbe: healthyProbe,
      lastBackup: { lastBackupTimestamp: freshBackup },
      dependencies: [{ name: 'PostgreSQL', healthy: true }],
      rollbackConfig: { previousArtifactTag: 'v1.4.2', rollbackScript: 'deploy-rollback.sh' }
    });

    assert.equal(rehearsal.environment, 'staging');
    assert.equal(rehearsal.releaseReady, true);
    assert.equal(rehearsal.riskLevel, 'low');
    assert.equal(rehearsal.blockers.length, 0);
    assert.ok(rehearsal.evidence.includes('RELEASE READY'));
    assert.equal(rehearsal.checkpoints.configuration.passed, true);
    assert.equal(rehearsal.checkpoints.secrets.passed, true);
    assert.equal(rehearsal.checkpoints.backups.passed, true);
    assert.equal(rehearsal.checkpoints.health.passed, true);
    assert.equal(rehearsal.checkpoints.dependencies.passed, true);
    assert.equal(rehearsal.checkpoints.rollback.passed, true);
  });
});
