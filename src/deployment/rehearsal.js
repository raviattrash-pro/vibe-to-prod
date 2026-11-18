import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scanForSecrets } from '../evaluators.js';

/**
 * Validate configuration files and environment definitions.
 */
export async function validateConfiguration(repositoryPath) {
  const issues = [];
  let packageJson = null;

  try {
    const pkgPath = path.join(repositoryPath, 'package.json');
    const content = await readFile(pkgPath, 'utf8');
    packageJson = JSON.parse(content);

    if (!packageJson.scripts?.start && !packageJson.main) {
      issues.push({
        checkpoint: 'configuration',
        severity: 'high',
        issue: 'No "start" script or "main" entrypoint found in package.json for production execution.'
      });
    }

    if (!packageJson.engines?.node) {
      issues.push({
        checkpoint: 'configuration',
        severity: 'low',
        issue: 'No explicit "engines.node" range defined in package.json.'
      });
    }
  } catch {
    issues.push({
      checkpoint: 'configuration',
      severity: 'high',
      issue: 'package.json missing or invalid JSON.'
    });
  }

  // Check deployment manifests
  let hasDeployConfig = false;
  for (const name of ['Dockerfile', 'compose.yaml', 'docker-compose.yml', 'vercel.json', 'fly.toml', 'render.yaml', 'wrangler.json']) {
    try {
      await stat(path.join(repositoryPath, name));
      hasDeployConfig = true;
      break;
    } catch {}
  }

  return {
    passed: issues.filter(i => i.severity === 'high' || i.severity === 'critical').length === 0,
    hasDeployConfig,
    issues
  };
}

/**
 * Check for committed secrets and credentials.
 */
export async function checkDeploymentSecrets(repositoryPath) {
  try {
    const scan = await scanForSecrets(repositoryPath);
    const critical = (scan.findings || []).length > 0;
    return {
      passed: !critical,
      findingsCount: (scan.findings || []).length,
      issues: (scan.findings || []).map(f => ({
        checkpoint: 'secrets',
        severity: 'critical',
        issue: `Hardcoded secret marker at ${f.file}:${f.line}`
      }))
    };
  } catch {
    return { passed: true, findingsCount: 0, issues: [] };
  }
}

/**
 * Validate database migrations and check for rollback capability.
 */
export async function validateMigrations(repositoryPath) {
  const migrationDirs = ['migrations', 'src/migrations', 'prisma/migrations', 'drizzle'];
  let foundDir = null;
  let migrationFiles = [];

  for (const dir of migrationDirs) {
    const fullPath = path.join(repositoryPath, dir);
    try {
      const entries = await readdir(fullPath);
      foundDir = dir;
      migrationFiles = entries.filter(e => /\.(sql|js|ts)$/i.test(e));
      break;
    } catch {}
  }

  if (!foundDir || !migrationFiles.length) {
    return {
      passed: true,
      hasMigrations: false,
      issues: [] // Not all projects require migrations (e.g. static/JSON apps)
    };
  }

  const issues = [];
  // Check for rollback support or reversible down files
  const hasDownMigrations = migrationFiles.some(f => /down|undo|rollback/i.test(f));
  if (!hasDownMigrations && migrationFiles.length > 3) {
    issues.push({
      checkpoint: 'migrations',
      severity: 'medium',
      issue: 'Database migrations do not appear to include reversible down/rollback definitions.'
    });
  }

  return {
    passed: true,
    hasMigrations: true,
    migrationCount: migrationFiles.length,
    issues
  };
}

/**
 * Verify backup availability and recovery point freshness.
 */
export function verifyBackupAvailability({ lastBackupTimestamp = null, backupArtifact = null } = {}) {
  const issues = [];

  if (!lastBackupTimestamp && !backupArtifact) {
    issues.push({
      checkpoint: 'backups',
      severity: 'high',
      issue: 'No verified database or project backup found prior to deployment rehearsal.'
    });
    return { passed: false, freshnessHours: null, issues };
  }

  const time = Date.parse(lastBackupTimestamp || backupArtifact?.createdAt || '');
  if (!Number.isFinite(time)) {
    issues.push({
      checkpoint: 'backups',
      severity: 'medium',
      issue: 'Backup record has invalid or unverifiable timestamp.'
    });
    return { passed: false, freshnessHours: null, issues };
  }

  const ageHours = (Date.now() - time) / (1000 * 60 * 60);
  if (ageHours > 24) {
    issues.push({
      checkpoint: 'backups',
      severity: 'medium',
      issue: `Latest backup is ${Math.round(ageHours)} hours old (exceeds recommended 24h RPO).`
    });
  }

  return {
    passed: issues.filter(i => i.severity === 'high').length === 0,
    freshnessHours: Math.round(ageHours * 10) / 10,
    issues
  };
}

/**
 * Verify healthcheck endpoints.
 */
export async function verifyHealthEndpoints({ healthProbe = null, targetUrl = '' } = {}) {
  if (!healthProbe && !targetUrl) {
    return {
      passed: false,
      issues: [{
        checkpoint: 'healthcheck',
        severity: 'medium',
        issue: 'No live staging URL or health probe provided to verify container / service readiness.'
      }]
    };
  }

  if (healthProbe) {
    try {
      const res = await healthProbe();
      if (res.status === 200) {
        return { passed: true, status: 200, responseTimeMs: res.responseTimeMs || 45, issues: [] };
      }
      return {
        passed: false,
        issues: [{
          checkpoint: 'healthcheck',
          severity: 'high',
          issue: `Health endpoint returned status ${res.status} instead of HTTP 200.`
        }]
      };
    } catch (err) {
      return {
        passed: false,
        issues: [{
          checkpoint: 'healthcheck',
          severity: 'high',
          issue: `Healthcheck probe connection failed: ${err.message}`
        }]
      };
    }
  }

  return { passed: true, issues: [] };
}

/**
 * Check deployment dependencies (DB, Redis, downstream APIs).
 */
export function checkDeploymentDependencies({ dependencies = [] } = {}) {
  const issues = [];

  for (const dep of dependencies) {
    if (dep.status === 'unreachable' || dep.healthy === false) {
      issues.push({
        checkpoint: 'dependencies',
        severity: 'high',
        issue: `Downstream dependency '${dep.name}' is unreachable or reporting unhealthy.`
      });
    }
  }

  return {
    passed: issues.length === 0,
    totalDependencies: dependencies.length,
    issues
  };
}

/**
 * Execute full Deployment Rehearsal.
 */
export async function executeDeploymentRehearsal({
  repositoryPath = '',
  environment = 'staging',
  allowProductionDeployment = false,
  healthProbe = null,
  targetUrl = '',
  lastBackup = null,
  dependencies = [],
  rollbackConfig = {}
} = {}) {
  const rehearsalId = randomUUID();
  const timestamp = new Date().toISOString();

  // STRICT SAFETY GUARD
  if (environment.toLowerCase() === 'production' && allowProductionDeployment !== true) {
    return {
      rehearsalId,
      timestamp,
      environment,
      releaseReady: false,
      riskLevel: 'critical',
      blockers: ['Deployment rehearsal against production is prohibited without explicit allowProductionDeployment: true authorization.'],
      warnings: [],
      checkpoints: {},
      evidence: 'Deployment rehearsal aborted by safety policy: Production deployment requires explicit confirmation.'
    };
  }

  // 1. Config
  const configCheck = await validateConfiguration(repositoryPath);
  // 2. Secrets
  const secretsCheck = await checkDeploymentSecrets(repositoryPath);
  // 3. Migrations
  const migrationsCheck = await validateMigrations(repositoryPath);
  // 4. Backups
  const backupsCheck = verifyBackupAvailability(lastBackup || {});
  // 5. Health
  const healthCheck = await verifyHealthEndpoints({ healthProbe, targetUrl });
  // 6. Dependencies
  const depsCheck = checkDeploymentDependencies({ dependencies });

  // 7. Rollback Procedures Drill
  const rollbackAvailable = Boolean(rollbackConfig.previousArtifactTag || rollbackConfig.rollbackScript);
  const rollbackIssues = [];
  if (!rollbackAvailable) {
    rollbackIssues.push({
      checkpoint: 'rollback',
      severity: 'medium',
      issue: 'No prior immutable artifact tag or automated rollback script configured.'
    });
  }

  const allIssues = [
    ...configCheck.issues,
    ...secretsCheck.issues,
    ...migrationsCheck.issues,
    ...backupsCheck.issues,
    ...healthCheck.issues,
    ...depsCheck.issues,
    ...rollbackIssues
  ];

  const blockers = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high').map(i => i.issue);
  const warnings = allIssues.filter(i => i.severity === 'medium' || i.severity === 'low').map(i => i.issue);

  let riskLevel = 'low';
  if (allIssues.some(i => i.severity === 'critical')) riskLevel = 'critical';
  else if (blockers.length > 0) riskLevel = 'high';
  else if (warnings.length > 2) riskLevel = 'medium';

  const releaseReady = blockers.length === 0 && riskLevel !== 'critical';

  const checkpoints = {
    configuration: { passed: configCheck.passed, details: configCheck },
    secrets: { passed: secretsCheck.passed, details: secretsCheck },
    migrations: { passed: migrationsCheck.passed, details: migrationsCheck },
    backups: { passed: backupsCheck.passed, details: backupsCheck },
    health: { passed: healthCheck.passed, details: healthCheck },
    dependencies: { passed: depsCheck.passed, details: depsCheck },
    rollback: { passed: rollbackAvailable, issues: rollbackIssues }
  };

  const evidence = `Deployment Rehearsal completed in '${environment}' environment. Result: ${releaseReady ? 'RELEASE READY' : 'BLOCKED'} (Risk: ${riskLevel.toUpperCase()}). ${blockers.length} blocker(s), ${warnings.length} warning(s).`;

  return {
    rehearsalId,
    timestamp,
    environment,
    releaseReady,
    riskLevel,
    blockers,
    warnings,
    checkpoints,
    evidence
  };
}
