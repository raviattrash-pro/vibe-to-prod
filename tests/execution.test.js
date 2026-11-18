import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionSession, createIdempotencyKey, calculateExecutionMetrics } from '../src/execution/state.js';
import { createPhaseHandoff, extractHandoffFromOutput, formatHandoffPrompt } from '../src/execution/handoff.js';
import { ExecutionEngine, getTopologicalTaskOrder, getNextReadyTask } from '../src/execution/engine.js';

test('getTopologicalTaskOrder sorts tasks in dependency order and detects cycles', () => {
  const workflow = {
    tasks: [
      { id: 'delivery', dependsOn: ['qa'] },
      { id: 'foundation', dependsOn: [] },
      { id: 'implementation', dependsOn: ['foundation'] },
      { id: 'qa', dependsOn: ['implementation'] }
    ]
  };

  const order = getTopologicalTaskOrder(workflow);
  assert.deepEqual(order, ['foundation', 'implementation', 'qa', 'delivery']);

  const cyclicWorkflow = {
    tasks: [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] }
    ]
  };
  assert.throws(() => getTopologicalTaskOrder(cyclicWorkflow), /Cycle detected/);
});

test('createExecutionSession creates idempotent session with task states and metrics', () => {
  const workflow = {
    id: 'wf-1',
    tasks: [
      { id: 'foundation', title: 'Audit repo', agent: 'arch', skill: 'audit', dependsOn: [] },
      { id: 'implementation', title: 'Code', agent: 'arch', skill: 'hld', dependsOn: ['foundation'] }
    ]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo' };

  const session = createExecutionSession({ workflow, project, provider: 'codex' });
  assert.equal(session.workflowId, 'wf-1');
  assert.equal(session.status, 'pending');
  assert.ok(session.idempotencyKey);
  assert.equal(session.executionState.foundation.status, 'planned');
  assert.equal(session.executionState.implementation.requiresApproval, true); // default checkpoint

  const key1 = createIdempotencyKey('wf-1', ['b', 'a']);
  const key2 = createIdempotencyKey('wf-1', ['a', 'b']);
  assert.equal(key1, key2); // Order independent
});

test('createPhaseHandoff creates cryptographic context hash and formats prompt', () => {
  const handoff = createPhaseHandoff({
    fromTaskId: 'foundation',
    toTaskId: 'implementation',
    summary: 'Discovered Express + SQLite stack.',
    filesModified: ['package.json', 'src/app.js'],
    keyDecisions: ['Use SQLite for lightweight local storage.'],
    openIssues: ['Check CORS security headers.']
  });

  assert.ok(handoff.contextHash);
  assert.equal(handoff.contextHash.length, 64);
  assert.deepEqual(handoff.filesModified, ['package.json', 'src/app.js']);

  const formatted = formatHandoffPrompt({ foundation: handoff });
  assert.match(formatted, /Upstream Phase Context Handoffs/);
  assert.match(formatted, /Discovered Express \+ SQLite stack/);
  assert.match(formatted, /package\.json/);

  const extracted = extractHandoffFromOutput('Modified file: src/index.js\nDecision: Use JWT\nWarning: Missing tests', 'step1');
  assert.ok(extracted.filesModified.includes('src/index.js'));
  assert.ok(extracted.keyDecisions.includes('Use JWT'));
  assert.ok(extracted.openIssues.includes('Missing tests'));
});

test('ExecutionEngine runs tasks in dependency order, tracks retries, and computes metrics', async () => {
  let attempts = 0;
  const mockCodex = async ({ prompt }) => {
    attempts++;
    if (attempts === 1) {
      // simulate transient failure
      return { status: 'failed', exitCode: 1, error: 'Network timeout to model' };
    }
    return {
      status: 'completed',
      exitCode: 0,
      output: 'Completed task successfully. Modified file: src/server.js'
    };
  };

  const engine = new ExecutionEngine({
    runners: { codex: mockCodex },
    backoffBaseMs: 10
  });

  const workflow = {
    id: 'wf-test',
    tasks: [
      { id: 'foundation', title: 'Audit', agent: 'arch', skill: 'audit', dependsOn: [] }
    ]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo', decisions: [] };

  const session = createExecutionSession({
    workflow,
    project,
    provider: 'codex',
    approvalCheckpoints: [] // no checkpoints for this test
  });

  const updates = [];
  await engine.runSession(session, project, workflow, {
    onUpdate: async (s) => updates.push(s.status)
  });

  assert.equal(session.status, 'completed');
  assert.equal(session.executionState.foundation.status, 'completed');
  assert.equal(session.executionState.foundation.attempts, 2);
  assert.equal(session.metrics.tasksCompleted, 1);
  assert.equal(session.metrics.totalRetries, 1);
  assert.ok(session.metrics.totalDurationMs >= 0);
  assert.ok(session.metrics.estimatedTokens > 0);
  assert.ok(session.contextHandoffs.foundation);
});

test('ExecutionEngine pauses at approval checkpoints and resumes after approval', async () => {
  const executedTasks = [];
  const mockRunner = async ({ prompt }) => {
    return { status: 'completed', exitCode: 0, output: 'Success' };
  };

  const engine = new ExecutionEngine({
    runners: { codex: mockRunner }
  });

  const workflow = {
    id: 'wf-approval',
    tasks: [
      { id: 'foundation', title: 'Audit', agent: 'arch', skill: 'audit', dependsOn: [] },
      { id: 'implementation', title: 'Code', agent: 'arch', skill: 'hld', dependsOn: ['foundation'] }
    ]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo', decisions: [] };

  const session = createExecutionSession({
    workflow,
    project,
    provider: 'codex',
    approvalCheckpoints: ['implementation']
  });

  // Run until checkpoint
  await engine.runSession(session, project, workflow);
  assert.equal(session.status, 'paused_for_approval');
  assert.equal(session.approvalRequiredFor, 'implementation');
  assert.equal(session.executionState.foundation.status, 'completed');
  assert.equal(session.executionState.implementation.status, 'planned');

  // Grant approval and resume
  engine.approveCheckpoint(session, 'implementation');
  assert.equal(session.status, 'running');

  await engine.runSession(session, project, workflow);
  assert.equal(session.status, 'completed');
  assert.equal(session.executionState.implementation.status, 'completed');
});

test('ExecutionEngine handles cancellation gracefully', async () => {
  let callCount = 0;
  const mockRunner = async () => {
    callCount++;
    return new Promise(resolve => setTimeout(() => resolve({ status: 'completed', exitCode: 0 }), 100));
  };

  const engine = new ExecutionEngine({ runners: { codex: mockRunner } });
  const workflow = {
    id: 'wf-cancel',
    tasks: [
      { id: 't1', title: 'Task 1', agent: 'a', skill: 's', dependsOn: [] },
      { id: 't2', title: 'Task 2', agent: 'a', skill: 's', dependsOn: ['t1'] }
    ]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo', decisions: [] };

  const session = createExecutionSession({ workflow, project, provider: 'codex', approvalCheckpoints: [] });

  const runPromise = engine.runSession(session, project, workflow);
  // Cancel immediately
  setTimeout(() => engine.cancelSession(session, 'User aborted run'), 10);
  await runPromise;

  assert.equal(session.status, 'cancelled');
  assert.equal(session.cancelReason, 'User aborted run');
  assert.ok(['failed', 'skipped', 'planned'].includes(session.executionState.t2.status));
});

test('ExecutionEngine marks dependent tasks skipped when upstream task fails', async () => {
  const mockRunner = async () => {
    return { status: 'failed', exitCode: 1, error: 'Fatal compile error' };
  };

  const engine = new ExecutionEngine({ runners: { codex: mockRunner }, backoffBaseMs: 5 });
  const workflow = {
    id: 'wf-fail',
    tasks: [
      { id: 'upstream', title: 'Upstream Task', agent: 'a', skill: 's', dependsOn: [] },
      { id: 'downstream', title: 'Downstream Task', agent: 'a', skill: 's', dependsOn: ['upstream'] }
    ]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo', decisions: [] };

  const session = createExecutionSession({ workflow, project, provider: 'codex', approvalCheckpoints: [], maxRetries: 1 });
  await engine.runSession(session, project, workflow);

  assert.equal(session.status, 'failed');
  assert.equal(session.executionState.upstream.status, 'failed');
  assert.equal(session.executionState.downstream.status, 'skipped');
  assert.match(session.executionState.downstream.error, /Upstream task 'upstream' failed/);
});

test('ExecutionEngine marks unavailable provider as failed without fabrication', async () => {
  const engine = new ExecutionEngine({ runners: {} }); // no providers registered
  const workflow = {
    id: 'wf-unavail',
    tasks: [{ id: 't1', title: 'Task', agent: 'a', skill: 's', dependsOn: [] }]
  };
  const project = { id: 'p-1', name: 'Test App', repositoryPath: '/repo', decisions: [] };

  const session = createExecutionSession({ workflow, project, provider: 'unknown-provider', approvalCheckpoints: [] });
  await engine.runSession(session, project, workflow);

  assert.equal(session.status, 'failed');
  assert.match(session.executionState.t1.error, /Provider adapter 'unknown-provider' is not supported/);
});
