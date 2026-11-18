import { createTaskPrompt, runAntigravity, runClaudeCode, runCodex } from '../adapters.js';
import { calculateExecutionMetrics, canTransitionTo } from './state.js';
import { createPhaseHandoff, extractHandoffFromOutput, formatHandoffPrompt } from './handoff.js';

export function getTopologicalTaskOrder(workflow) {
  const tasks = workflow.tasks || [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set();
  const visiting = new Set();
  const order = [];

  function visit(taskId) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      throw new Error(`Cycle detected in workflow task dependencies at '${taskId}'`);
    }
    visiting.add(taskId);
    const task = taskMap.get(taskId);
    if (task && task.dependsOn) {
      for (const depId of task.dependsOn) {
        if (taskMap.has(depId)) {
          visit(depId);
        }
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    order.push(taskId);
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id);
    }
  }

  return order;
}

export function getNextReadyTask(session) {
  if (session.status !== 'running') return null;

  for (const [taskId, taskState] of Object.entries(session.executionState)) {
    if (taskState.status === 'planned') {
      // Check if all dependencies are completed
      const deps = taskState.dependsOn || [];
      const depsCompleted = deps.every(depId => session.executionState[depId]?.status === 'completed');
      const depsFailed = deps.some(depId => ['failed', 'skipped'].includes(session.executionState[depId]?.status));

      if (depsFailed) {
        taskState.status = 'skipped';
        taskState.error = 'Skipped because an upstream dependency failed or was skipped.';
        session.metrics.tasksSkipped++;
        continue;
      }

      if (depsCompleted) {
        return taskId;
      }
    }
  }
  return null;
}

export class ExecutionEngine {
  constructor({
    runners = {
      codex: runCodex,
      'claude-code': runClaudeCode,
      antigravity: runAntigravity
    },
    backoffBaseMs = 100
  } = {}) {
    this.runners = runners;
    this.backoffBaseMs = backoffBaseMs;
    this.activeProcesses = new Map(); // sessionId -> { abort: () => void }
  }

  async runSession(session, project, workflow, { onUpdate = async () => {} } = {}) {
    if (session.status === 'pending') {
      session.status = 'running';
      session.metrics.startedAt = new Date().toISOString();
      session.updatedAt = session.metrics.startedAt;
      await onUpdate(session);
    }

    while (session.status === 'running') {
      const taskId = getNextReadyTask(session);

      if (!taskId) {
        // Check if all tasks finished
        const states = Object.values(session.executionState);
        const allDone = states.every(s => ['completed', 'failed', 'skipped'].includes(s.status));
        if (allDone) {
          const anyFailed = states.some(s => s.status === 'failed');
          session.status = anyFailed ? 'failed' : 'completed';
          session.completedAt = new Date().toISOString();
          session.metrics.completedAt = session.completedAt;
          calculateExecutionMetrics(session);
          session.updatedAt = session.completedAt;
          await onUpdate(session);
        }
        break;
      }

      const taskState = session.executionState[taskId];
      const taskDef = workflow.tasks.find(t => t.id === taskId);

      // Check approval checkpoint
      if (taskState.requiresApproval && !taskState.approvalGranted) {
        session.status = 'paused_for_approval';
        session.activeTaskId = taskId;
        session.approvalRequiredFor = taskId;
        session.updatedAt = new Date().toISOString();
        await onUpdate(session);
        break;
      }

      // Execute this task
      session.activeTaskId = taskId;
      taskState.status = 'running';
      taskState.startedAt = new Date().toISOString();
      session.updatedAt = taskState.startedAt;
      await onUpdate(session);

      const runner = this.runners[session.provider];
      if (!runner) {
        taskState.status = 'failed';
        taskState.error = `Provider adapter '${session.provider}' is not supported or not configured.`;
        taskState.completedAt = new Date().toISOString();
        session.status = 'failed';
        calculateExecutionMetrics(session);
        await onUpdate(session);
        break;
      }

      let succeeded = false;
      let attempt = 0;
      const maxRetries = taskState.maxRetries || 2;

      while (attempt <= maxRetries && !succeeded && session.status === 'running') {
        attempt++;
        taskState.attempts = attempt;
        const attemptStart = Date.now();

        try {
          // Prepare prompt with upstream handoffs
          const basePrompt = createTaskPrompt(project, workflow, taskDef);
          const handoffContext = formatHandoffPrompt(session.contextHandoffs);
          const prompt = handoffContext ? `${basePrompt}\n${handoffContext}` : basePrompt;

          taskState.logs.push({
            at: new Date().toISOString(),
            type: 'system',
            text: `[Execution] Starting attempt ${attempt}/${maxRetries + 1} with ${session.provider}...`
          });

          // Run with timeout & process tracking
          let aborted = false;
          const cancelHandler = { abort: () => { aborted = true; } };
          this.activeProcesses.set(session.id, cancelHandler);

          const result = await runner({
            repositoryPath: session.repositoryPath,
            prompt,
            timeoutMs: taskState.timeoutMs,
            onEvent: (event) => {
              taskState.logs.push({
                at: event.at || new Date().toISOString(),
                type: event.type || 'stdout',
                text: String(event.text || '').slice(0, 4000)
              });
              if (taskState.logs.length > 200) {
                taskState.logs = taskState.logs.slice(-200);
              }
            }
          });

          this.activeProcesses.delete(session.id);
          const duration = Date.now() - attemptStart;
          taskState.durationMs += duration;

          if (aborted || session.status === 'cancelled') {
            taskState.status = 'failed';
            taskState.error = 'Task was cancelled.';
            break;
          }

          if (result.status === 'completed') {
            succeeded = true;
            taskState.status = 'completed';
            taskState.exitCode = result.exitCode ?? 0;
            taskState.completedAt = new Date().toISOString();
            taskState.evidence = [result.output ? result.output.slice(0, 1000) : `Task executed by ${session.provider}`];

            // Sync with workflow task if present
            const wfTask = workflow?.tasks?.find(t => t.id === taskId);
            if (wfTask) {
              wfTask.status = 'completed';
              wfTask.evidence = taskState.evidence;
            }

            // Extract handoff for downstream tasks
            const extracted = extractHandoffFromOutput(result.output, taskId);
            session.contextHandoffs[taskId] = createPhaseHandoff({
              fromTaskId: taskId,
              toTaskId: 'downstream',
              summary: extracted.summary,
              filesModified: extracted.filesModified,
              keyDecisions: extracted.keyDecisions,
              openIssues: extracted.openIssues
            });
          } else {
            throw new Error(result.error || `Runner returned non-zero exit code: ${result.exitCode}`);
          }
        } catch (err) {
          this.activeProcesses.delete(session.id);
          const duration = Date.now() - attemptStart;
          taskState.durationMs += duration;
          taskState.logs.push({
            at: new Date().toISOString(),
            type: 'stderr',
            text: `Attempt ${attempt} failed: ${err.message}`
          });

          if (attempt <= maxRetries && session.status === 'running') {
            const backoff = this.backoffBaseMs * Math.pow(2, attempt - 1);
            await new Promise(res => setTimeout(res, backoff));
          } else {
            taskState.status = 'failed';
            taskState.error = err.message;
            taskState.completedAt = new Date().toISOString();
          }
        }
      }

      session.activeTaskId = null;
      calculateExecutionMetrics(session);
      session.updatedAt = new Date().toISOString();
      await onUpdate(session);

      if (taskState.status === 'failed') {
        // Mark dependent tasks skipped
        for (const [otherId, otherState] of Object.entries(session.executionState)) {
          if (otherState.status === 'planned' && otherState.dependsOn.includes(taskId)) {
            otherState.status = 'skipped';
            otherState.error = `Upstream task '${taskId}' failed.`;
          }
        }
      }
    }

    calculateExecutionMetrics(session);
    return session;
  }

  approveCheckpoint(session, taskId) {
    if (session.status !== 'paused_for_approval') {
      throw Object.assign(new Error(`Session is not paused for approval (current status: ${session.status}).`), { status: 409 });
    }
    if (session.approvalRequiredFor !== taskId) {
      throw Object.assign(new Error(`Approval was requested for '${session.approvalRequiredFor}', not '${taskId}'.`), { status: 400 });
    }
    const taskState = session.executionState[taskId];
    if (taskState) {
      taskState.approvalGranted = true;
    }
    session.status = 'running';
    session.approvalRequiredFor = null;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  cancelSession(session, reason = 'Cancelled by user') {
    if (['completed', 'failed', 'cancelled'].includes(session.status)) {
      throw Object.assign(new Error(`Cannot cancel an already ${session.status} session.`), { status: 409 });
    }

    const processHandler = this.activeProcesses.get(session.id);
    if (processHandler) {
      processHandler.abort();
      this.activeProcesses.delete(session.id);
    }

    const now = new Date().toISOString();
    session.status = 'cancelled';
    session.cancelledAt = now;
    session.cancelReason = String(reason).slice(0, 300);
    session.updatedAt = now;

    if (session.activeTaskId) {
      const activeState = session.executionState[session.activeTaskId];
      if (activeState && activeState.status === 'running') {
        activeState.status = 'failed';
        activeState.error = `Cancelled: ${reason}`;
        activeState.completedAt = now;
      }
      session.activeTaskId = null;
    }

    for (const state of Object.values(session.executionState)) {
      if (state.status === 'planned') {
        state.status = 'skipped';
        state.error = 'Session cancelled.';
      }
    }

    calculateExecutionMetrics(session);
    return session;
  }
}
