import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildDigitalTwinGraph } from '../src/twin/graph.js';
import { analyzeChangeImpact, updateTwinHealth } from '../src/twin/impact.js';

test('buildDigitalTwinGraph extracts dependencies, modules, APIs, security boundaries, and tests', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agencyos-twin-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, 'package.json'), JSON.stringify({
    dependencies: { express: '^4.18.0', pg: '^8.0.0' }
  }));

  await mkdir(path.join(dir, 'src'));
  await writeFile(path.join(dir, 'src/auth.js'), `
    import express from 'express';
    export class AuthGuard { checkToken() {} }
  `);

  await writeFile(path.join(dir, 'src/users.js'), `
    import { AuthGuard } from './auth.js';
    const app = express();
    app.get('/api/users', (req, res) => res.json([]));
  `);

  await mkdir(path.join(dir, 'tests'));
  await writeFile(path.join(dir, 'tests/users.test.js'), `
    import test from 'node:test';
  `);

  const project = {
    id: 'p-twin',
    decisions: [
      { id: 'd1', title: 'Token Auth', rationale: 'Use auth.js for stateless authentication.' }
    ]
  };

  const graph = await buildDigitalTwinGraph(dir, project);

  assert.equal(graph.analysisConfidence, 'static_heuristic');
  assert.ok(graph.totalNodes > 0);
  assert.ok(graph.totalEdges > 0);

  // Check node types
  const types = new Set(graph.nodes.map(n => n.type));
  assert.ok(types.has('dependency'));
  assert.ok(types.has('module'));
  assert.ok(types.has('api_endpoint'));
  assert.ok(types.has('security_boundary'));
  assert.ok(types.has('test_suite'));
  assert.ok(types.has('architecture_decision'));

  // Check relationship edges
  const edgeRelations = new Set(graph.edges.map(e => e.relation));
  assert.ok(edgeRelations.has('imports'));
  assert.ok(edgeRelations.has('implements'));
});

test('analyzeChangeImpact identifies affected modules, APIs, tests, boundaries, and ADRs', async t => {
  const mockGraph = {
    nodes: [
      { id: 'module:src/auth.js', type: 'module', name: 'auth.js', filePath: 'src/auth.js' },
      { id: 'module:src/api.js', type: 'module', name: 'api.js', filePath: 'src/api.js' },
      { id: 'api:/api/auth/login', type: 'api_endpoint', name: '/api/auth/login' },
      { id: 'sec:src/auth.js', type: 'security_boundary', name: 'Auth Boundary (auth.js)' },
      { id: 'test:tests/auth.test.js', type: 'test_suite', name: 'auth.test.js', filePath: 'tests/auth.test.js' }
    ],
    edges: [
      { relation: 'imports', source: 'module:src/api.js', target: 'module:src/auth.js' },
      { relation: 'implements', source: 'module:src/api.js', target: 'api:/api/auth/login' },
      { relation: 'protects', source: 'sec:src/auth.js', target: 'module:src/auth.js' },
      { relation: 'tests', source: 'test:tests/auth.test.js', target: 'module:src/auth.js' }
    ]
  };

  const decisions = [
    { id: 'adr-1', title: 'JWT Auth', rationale: 'All routes guarded by auth.js' }
  ];

  const impact = analyzeChangeImpact(mockGraph, ['src/auth.js'], decisions);

  // 1. Affected modules (direct + transitive)
  assert.ok(impact.affectedModules.includes('auth.js'));
  assert.ok(impact.affectedModules.includes('api.js')); // imported auth.js

  // 2. Affected APIs
  assert.ok(impact.impactedApis.includes('/api/auth/login'));

  // 3. Related tests
  assert.ok(impact.impactedTests.includes('tests/auth.test.js'));

  // 4. Security boundaries
  assert.ok(impact.threatenedSecurityBoundaries.length > 0);

  // 5. Potentially violated decisions
  assert.equal(impact.potentiallyViolatedDecisions.length, 1);
  assert.equal(impact.potentiallyViolatedDecisions[0].id, 'adr-1');

  // 6. Recommended verification suite
  assert.ok(impact.recommendedVerificationSuite.tests.includes('tests/auth.test.js'));
  assert.ok(impact.recommendedVerificationSuite.checks.includes('secret-scan'));
  assert.ok(impact.recommendedVerificationSuite.checks.includes('application-security'));

  assert.equal(impact.confidence, 'static_heuristic');
});

test('updateTwinHealth adjusts scores based on test and check outcomes', () => {
  const graph = {
    nodes: [
      { id: '1', filePath: 'tests/a.test.js', healthScore: 100 },
      { id: '2', filePath: 'src/vuln.js', healthScore: 100 }
    ]
  };

  const updated = updateTwinHealth(graph, {
    failedTests: ['tests/a.test.js'],
    failingChecks: [{ file: 'src/vuln.js' }]
  });

  const node1 = updated.nodes.find(n => n.id === '1');
  const node2 = updated.nodes.find(n => n.id === '2');

  assert.equal(node1.healthScore, 50);
  assert.equal(node2.healthScore, 70);
});
