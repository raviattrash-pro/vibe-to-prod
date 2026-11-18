import { createHash } from 'node:crypto';

export function createPhaseHandoff({
  fromTaskId,
  toTaskId,
  summary = '',
  filesModified = [],
  keyDecisions = [],
  openIssues = [],
  evidenceRefs = []
}) {
  const content = {
    fromTaskId,
    toTaskId,
    summary: String(summary || '').trim(),
    filesModified: [...new Set(filesModified.map(f => String(f).trim()).filter(Boolean))],
    keyDecisions: keyDecisions.map(d => String(d).trim()).filter(Boolean),
    openIssues: openIssues.map(i => String(i).trim()).filter(Boolean),
    evidenceRefs: evidenceRefs.map(e => String(e).trim()).filter(Boolean),
    createdAt: new Date().toISOString()
  };

  const payload = JSON.stringify(content);
  const contextHash = createHash('sha256').update(payload).digest('hex');

  return {
    ...content,
    contextHash
  };
}

export function formatHandoffPrompt(handoffs = {}) {
  const entries = Object.values(handoffs);
  if (!entries.length) return '';

  const blocks = entries.map(h => {
    const files = h.filesModified.length ? h.filesModified.map(f => `  - \`${f}\``).join('\n') : '  None recorded.';
    const decisions = h.keyDecisions.length ? h.keyDecisions.map(d => `  - ${d}`).join('\n') : '  None.';
    const issues = h.openIssues.length ? h.openIssues.map(i => `  - ⚠️ ${i}`).join('\n') : '  No unresolved issues.';

    return `### Context from Completed Phase: ${h.fromTaskId} (Hash: ${h.contextHash.slice(0, 8)})
Summary: ${h.summary || 'Phase completed.'}
Files Modified:
${files}
Decisions Recorded:
${decisions}
Known Issues:
${issues}`;
  });

  return `\n## Upstream Phase Context Handoffs\n\n${blocks.join('\n\n')}\n`;
}

export function extractHandoffFromOutput(output = '', taskId = '') {
  const text = String(output || '');
  const filesModified = [];
  const keyDecisions = [];
  const openIssues = [];

  // Match file paths like src/something.js or package.json
  const fileMatches = text.matchAll(/(?:modified|changed|created|edited|wrote to|file:?)\s*[`"']?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)[`"']?/gi);
  for (const match of fileMatches) {
    if (match[1] && !match[1].startsWith('http') && match[1].length < 120) {
      filesModified.push(match[1]);
    }
  }

  // Look for decision markers
  const decisionLines = text.split(/\r?\n/).filter(line => /^(?:decision|decided|choice|selected):/i.test(line.trim()));
  for (const line of decisionLines) {
    keyDecisions.push(line.replace(/^(?:decision|decided|choice|selected):/i, '').trim());
  }

  // Look for warning / limitation markers
  const issueLines = text.split(/\r?\n/).filter(line => /^(?:warning|issue|limitation|unresolved|todo|next step):/i.test(line.trim()));
  for (const line of issueLines) {
    openIssues.push(line.replace(/^(?:warning|issue|limitation|unresolved|todo|next step):/i, '').trim());
  }

  return {
    summary: text.slice(0, 500).trim(),
    filesModified: [...new Set(filesModified)].slice(0, 20),
    keyDecisions: keyDecisions.slice(0, 10),
    openIssues: openIssues.slice(0, 10)
  };
}
