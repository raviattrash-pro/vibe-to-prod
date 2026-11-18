export function analyzeChangeImpact(graph, changedFiles = [], projectDecisions = []) {
  const normChanged = changedFiles.map(f => String(f).replace(/\\/g, '/').toLowerCase());
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  const affectedModuleIds = new Set();
  const affectedApiIds = new Set();
  const relatedTestIds = new Set();
  const threatenedBoundaryIds = new Set();
  const potentiallyViolatedAdrs = new Set();

  // 1. Identify directly and transitively affected modules
  for (const node of nodes) {
    if (!node.filePath) continue;
    const normPath = node.filePath.toLowerCase();
    if (normChanged.some(c => normPath.includes(c) || c.includes(normPath))) {
      affectedModuleIds.add(node.id);
    }
  }

  // Follow 'imports' edges to find dependents (transitive impact)
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of edges) {
      if (edge.relation === 'imports' && affectedModuleIds.has(edge.target) && !affectedModuleIds.has(edge.source)) {
        affectedModuleIds.add(edge.source);
        expanded = true;
      }
    }
  }

  // 2. Identify potentially affected APIs
  for (const edge of edges) {
    if (edge.relation === 'implements' && affectedModuleIds.has(edge.source)) {
      const targetNode = nodes.find(n => n.id === edge.target);
      if (targetNode?.type === 'api_endpoint') {
        affectedApiIds.add(targetNode.name);
      }
    }
  }

  // 3. Identify related tests
  for (const edge of edges) {
    if (edge.relation === 'tests' && affectedModuleIds.has(edge.target)) {
      const testNode = nodes.find(n => n.id === edge.source);
      if (testNode?.filePath) {
        relatedTestIds.add(testNode.filePath);
      }
    }
  }
  // Also include tests matching changed file names
  for (const file of normChanged) {
    const base = file.split('/').pop().replace(/\.[^.]+$/, '');
    for (const node of nodes) {
      if (node.type === 'test_suite' && node.filePath && node.filePath.toLowerCase().includes(base)) {
        relatedTestIds.add(node.filePath);
      }
    }
  }

  // 4. Identify security boundaries
  for (const edge of edges) {
    if (edge.relation === 'protects' && (affectedModuleIds.has(edge.target) || affectedModuleIds.has(edge.source))) {
      const boundaryNode = nodes.find(n => n.id === edge.source);
      if (boundaryNode) {
        threatenedBoundaryIds.add(boundaryNode.name);
      }
    }
  }

  // 5. Identify architecture decisions that may be violated
  for (const dec of projectDecisions) {
    const text = `${dec.title} ${dec.rationale || ''} ${dec.alternatives || ''}`.toLowerCase();
    for (const changed of normChanged) {
      const base = changed.split('/').pop().replace(/\.[^.]+$/, '');
      if (text.includes(base)) {
        potentiallyViolatedAdrs.add({ id: dec.id, title: dec.title, rationale: dec.rationale });
      }
    }
  }

  // 6. Recommend the smallest relevant verification suite
  const recommendedTestSuites = [...relatedTestIds];
  const recommendedChecks = [];

  if (threatenedBoundaryIds.size > 0) {
    recommendedChecks.push('secret-scan');
    recommendedChecks.push('application-security');
  }
  if (affectedApiIds.size > 0) {
    recommendedChecks.push('api-contract-audit');
  }
  if (recommendedTestSuites.length > 0) {
    recommendedChecks.push('node-tests');
  } else {
    // If no direct test matched, recommend general test check
    recommendedChecks.push('node-tests');
  }

  return {
    changedFiles: [...new Set(changedFiles)],
    affectedModules: [...affectedModuleIds].map(id => nodes.find(n => n.id === id)?.name || id),
    impactedApis: [...affectedApiIds],
    impactedTests: recommendedTestSuites,
    threatenedSecurityBoundaries: [...threatenedBoundaryIds],
    potentiallyViolatedDecisions: [...potentiallyViolatedAdrs],
    recommendedVerificationSuite: {
      tests: recommendedTestSuites,
      checks: [...new Set(recommendedChecks)]
    },
    confidence: 'static_heuristic',
    limitations: [
      'AST and static import heuristics used.',
      'Dynamic require or runtime reflection is unverified without runtime tracing.'
    ]
  };
}

export function updateTwinHealth(graph, verificationResults = {}) {
  const updatedNodes = (graph?.nodes || []).map(node => {
    let score = node.healthScore || 100;
    if (verificationResults.failedTests?.includes(node.filePath)) {
      score = Math.max(0, score - 50);
    }
    if (verificationResults.failingChecks?.some(c => node.filePath && c.file === node.filePath)) {
      score = Math.max(0, score - 30);
    }
    if (verificationResults.passedTests?.includes(node.filePath)) {
      score = Math.min(100, score + 10);
    }
    return { ...node, healthScore: score };
  });

  return {
    ...graph,
    updatedAt: new Date().toISOString(),
    nodes: updatedNodes
  };
}
