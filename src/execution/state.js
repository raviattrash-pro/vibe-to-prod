import { randomUUID, createHash } from 'node:crypto';

export function createIdempotencyKey(workflowId, taskIds = []) {
  const content = `${workflowId}:${Array.from(taskIds).toSorted().join(',')}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

export function createExecutionSession({
  workflow,
  project,
  provider = 'codex',
  idempotencyKey,
  approved = false,
  approvalCheckpoints = ['implementation', 'delivery'],
  maxRetries = 2,
  taskTimeoutMs = 600_000
}) {
  if (!workflow || !workflow.tasks) {
    throw Object.assign(new Error('A valid workflow is required to start execution.'), { status: 400 });
  }

  const now = new Date().toISOString();
  const taskMap = new Map(workflow.tasks.map(t => [t.id, t]));
  const key = idempotencyKey || createIdempotencyKey(workflow.id, workflow.tasks.map(t => t.id));

  // Build task execution states
  const executionState = {};
  for (const task of workflow.tasks) {
    executionState[task.id] = {
      taskId: task.id,
      title: task.title,
      agent: task.agent,
      skill: task.skill,
      dependsOn: [...task.dependsOn],
      status: 'planned',
      attempts: 0,
      maxRetries: maxRetries,
      timeoutMs: taskTimeoutMs,
      requiresApproval: approvalCheckpoints.includes(task.id),
      approvalGranted: false,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      exitCode: null,
      error: null,
      logs: [],
      evidence: []
    };
  }

  return {
    id: randomUUID(),
    workflowId: workflow.id,
    projectId: project.id,
    projectName: project.name,
    repositoryPath: project.repositoryPath || '',
    provider,
    status: 'pending',
    idempotencyKey: key,
    activeTaskId: null,
    approvalRequiredFor: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    executionState,
    contextHandoffs: {},
    metrics: {
      startedAt: null,
      completedAt: null,
      totalDurationMs: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksSkipped: 0,
      totalRetries: 0,
      estimatedTokens: 0,
      estimatedCostUsd: 0
    }
  };
}

export function calculateExecutionMetrics(session) {
  let totalDuration = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let retries = 0;
  let estimatedTokens = 0;

  for (const state of Object.values(session.executionState)) {
    totalDuration += state.durationMs || 0;
    if (state.status === 'completed') completed++;
    else if (state.status === 'failed') failed++;
    else if (state.status === 'skipped') skipped++;
    if (state.attempts > 1) retries += (state.attempts - 1);

    for (const log of state.logs || []) {
      // Rough token estimation: ~4 chars per token
      estimatedTokens += Math.ceil((log.text || '').length / 4);
    }
  }

  session.metrics.totalDurationMs = totalDuration;
  session.metrics.tasksCompleted = completed;
  session.metrics.tasksFailed = failed;
  session.metrics.tasksSkipped = skipped;
  session.metrics.totalRetries = retries;
  session.metrics.estimatedTokens = estimatedTokens;
  // Estimate based on standard rate card ($3.00 / 1M tokens blend)
  session.metrics.estimatedCostUsd = Number(((estimatedTokens / 1_000_000) * 3.00).toFixed(6));
  return session.metrics;
}

export function canTransitionTo(currentStatus, nextStatus) {
  const transitions = {
    pending: ['running', 'cancelled'],
    running: ['paused_for_approval', 'completed', 'failed', 'cancelled'],
    paused_for_approval: ['running', 'cancelled', 'failed'],
    completed: [],
    failed: [],
    cancelled: []
  };
  return (transitions[currentStatus] || []).includes(nextStatus);
}
