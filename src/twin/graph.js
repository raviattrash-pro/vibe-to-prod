import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', 'vendor']);

export async function buildDigitalTwinGraph(repositoryPath, project = {}) {
  const root = repositoryPath || '';
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();

  function addNode(node) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
      nodes.push(node);
    }
    return nodeMap.get(node.id);
  }

  function addEdge(source, target, relation) {
    if (source && target && source !== target) {
      edges.push({ id: randomUUID(), source, target, relation });
    }
  }

  if (!root) {
    return {
      projectId: project.id || 'unknown',
      updatedAt: new Date().toISOString(),
      analysisConfidence: 'partial_empty',
      nodes: [],
      edges: []
    };
  }

  // 1. Dependency Analysis from package.json
  try {
    const pkgPath = path.join(root, 'package.json');
    const pkgContent = JSON.parse(await readFile(pkgPath, 'utf8'));
    const allDeps = {
      ...(pkgContent.dependencies || {}),
      ...(pkgContent.devDependencies || {})
    };

    for (const [depName, depVer] of Object.entries(allDeps)) {
      addNode({
        id: `dep:${depName}`,
        type: 'dependency',
        name: depName,
        metadata: { version: depVer },
        healthScore: 100
      });
    }
  } catch {
    // package.json might not exist or be invalid
  }

  // 2. Scan Files for Modules, Components, APIs, Boundaries, and Tests
  const fileImports = new Map(); // file -> [importedFiles]
  const fileExports = new Map(); // file -> [exportedNames]

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.json', '.sql'].includes(ext)) continue;

        const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
        const info = await stat(fullPath);
        if (info.size > 1_000_000) continue; // skip huge files

        const content = await readFile(fullPath, 'utf8');

        // Check if it's a test file
        const isTest = /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/i.test(entry.name) || relPath.startsWith('tests/') || relPath.startsWith('test/');
        if (isTest) {
          addNode({
            id: `test:${relPath}`,
            type: 'test_suite',
            name: path.basename(relPath),
            filePath: relPath,
            metadata: { sizeBytes: info.size },
            healthScore: 100
          });
        } else if (ext === '.sql' || relPath.includes('migration')) {
          // Database entity / migration
          addNode({
            id: `db:${relPath}`,
            type: 'database_entity',
            name: path.basename(relPath, ext),
            filePath: relPath,
            metadata: { sizeBytes: info.size },
            healthScore: 100
          });
        } else {
          // Regular source module or UI component
          const isComponent = /^[A-Z]/.test(path.basename(relPath, ext)) || /(?:components?|views?|ui|pages?)[\\/]/i.test(relPath);
          const nodeId = isComponent ? `component:${relPath}` : `module:${relPath}`;

          addNode({
            id: nodeId,
            type: isComponent ? 'component' : 'module',
            name: path.basename(relPath),
            filePath: relPath,
            metadata: { sizeBytes: info.size },
            healthScore: 100
          });

          // Detect API endpoints
          const routeMatches = content.matchAll(/(?:app|router|fastify|server)\.(?:get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi);
          for (const match of routeMatches) {
            const endpoint = match[1];
            const apiId = `api:${endpoint}`;
            addNode({
              id: apiId,
              type: 'api_endpoint',
              name: endpoint,
              filePath: relPath,
              metadata: { method: 'DYNAMIC', route: endpoint },
              healthScore: 100
            });
            addEdge(nodeId, apiId, 'implements');
          }

          // Detect Security & Auth boundaries
          if (/auth|jwt|session|csrf|bearer|cookie|token/i.test(relPath) || /function\s+auth|class\s+Auth|middleware.*auth/i.test(content)) {
            const secId = `sec:${relPath}`;
            addNode({
              id: secId,
              type: 'security_boundary',
              name: `Auth Boundary (${path.basename(relPath)})`,
              filePath: relPath,
              metadata: { kind: 'authentication_or_authorization' },
              healthScore: 100
            });
            addEdge(secId, nodeId, 'protects');
          }

          // Extract static imports
          const importMatches = content.matchAll(/(?:from\s+['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\))/gi);
          for (const imp of importMatches) {
            const target = imp[1] || imp[2];
            if (!target) continue;
            if (target.startsWith('.')) {
              // Local relative import
              const resolvedRel = path.normalize(path.join(path.dirname(relPath), target)).replace(/\\/g, '/');
              addEdge(nodeId, `module:${resolvedRel}`, 'imports');
            } else if (!target.startsWith('node:')) {
              // External package dependency
              const pkgName = target.split('/')[0].startsWith('@') ? target.split('/').slice(0, 2).join('/') : target.split('/')[0];
              addEdge(nodeId, `dep:${pkgName}`, 'imports');
            }
          }
        }
      }
    }
  }

  try {
    await walk(root);
  } catch {
    // walk failure handled gracefully
  }

  // 3. Connect Tests to Modules
  for (const node of nodes) {
    if (node.type === 'test_suite' && node.filePath) {
      const baseName = path.basename(node.filePath).replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/i, '');
      const matchedModule = nodes.find(n => n.type === 'module' && path.basename(n.filePath || '', path.extname(n.filePath || '')) === baseName);
      if (matchedModule) {
        addEdge(node.id, matchedModule.id, 'tests');
      }
    }
  }

  // 4. Incorporate Architecture Decisions (ADRs)
  const decisions = project.decisions || [];
  for (const dec of decisions) {
    const adrId = `adr:${dec.id || randomUUID()}`;
    addNode({
      id: adrId,
      type: 'architecture_decision',
      name: dec.title,
      metadata: { rationale: dec.rationale, alternatives: dec.alternatives },
      healthScore: 100
    });

    // Link ADR to mentioned modules or endpoints
    for (const node of nodes) {
      if (node.name && dec.rationale && dec.rationale.toLowerCase().includes(node.name.toLowerCase())) {
        addEdge(adrId, node.id, 'implements');
      }
    }
  }

  return {
    projectId: project.id || 'unknown',
    updatedAt: new Date().toISOString(),
    analysisConfidence: 'static_heuristic',
    notes: 'Static heuristic dependency graph. Dynamic runtime bindings, reflection, or indirect RPC calls are tracked as unverified heuristics.',
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodes,
    edges
  };
}
