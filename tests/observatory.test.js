import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentObservatory } from '../src/observatory/metrics.js';

describe('Priority 10: Agent Reliability Observatory', () => {
  it('returns empty benchmark report when no telemetry is recorded', () => {
    const observatory = new AgentObservatory();
    const metrics = observatory.getMetrics();

    assert.equal(metrics.summary.totalExecutions, 0);
    assert.equal(metrics.summary.overallSuccessRate, 100);
    assert.equal(metrics.unreliableSkills.length, 0);
    assert.ok(metrics.recommendations.some(r => r.includes('No execution events recorded yet')));
  });

  it('records execution events and computes accurate aggregate performance metrics', async () => {
    const observatory = new AgentObservatory();

    await observatory.recordEvent({
      sessionId: 'sess-1',
      taskId: 'task-1',
      provider: 'codex',
      skillId: 'engineering',
      status: 'completed',
      durationMs: 4000,
      retries: 0,
      toolErrors: 0,
      handoffValid: true,
      costEstimate: 0.05,
      humanInterventions: 0,
      qualityDelta: 15
    });

    await observatory.recordEvent({
      sessionId: 'sess-1',
      taskId: 'task-2',
      provider: 'codex',
      skillId: 'engineering',
      status: 'completed',
      durationMs: 6000,
      retries: 1,
      toolErrors: 1,
      handoffValid: true,
      costEstimate: 0.07,
      humanInterventions: 1,
      qualityDelta: 10
    });

    await observatory.recordEvent({
      sessionId: 'sess-2',
      taskId: 'task-3',
      provider: 'claude-code',
      skillId: 'flaky-scraper',
      status: 'failed',
      durationMs: 8000,
      retries: 3,
      toolErrors: 4,
      handoffValid: false,
      costEstimate: 0.12,
      humanInterventions: 2,
      qualityDelta: -5
    });

    const metrics = observatory.getMetrics();
    const sum = metrics.summary;

    assert.equal(sum.totalExecutions, 3);
    assert.equal(sum.successfulExecutions, 2);
    assert.equal(sum.failedExecutions, 1);
    assert.equal(sum.overallSuccessRate, 66.7);
    assert.equal(sum.avgCompletionTimeMs, 6000);
    assert.equal(sum.totalRetries, 4);
    assert.equal(sum.totalToolErrors, 5);
    assert.equal(sum.handoffFailureRate, 33.3);
    assert.equal(sum.totalHumanInterventions, 3);
    assert.equal(sum.totalCostUsd, 0.24);
  });

  it('breaks down reliability metrics by Provider', async () => {
    const observatory = new AgentObservatory();

    await observatory.recordEvent({ provider: 'codex', status: 'completed', durationMs: 2000, costEstimate: 0.02 });
    await observatory.recordEvent({ provider: 'codex', status: 'completed', durationMs: 4000, costEstimate: 0.04 });
    await observatory.recordEvent({ provider: 'antigravity', status: 'failed', durationMs: 5000, costEstimate: 0.08 });

    const metrics = observatory.getMetrics();

    assert.equal(metrics.providers.codex.executions, 2);
    assert.equal(metrics.providers.codex.successRate, 100);
    assert.equal(metrics.providers.codex.avgDurationMs, 3000);

    assert.equal(metrics.providers.antigravity.executions, 1);
    assert.equal(metrics.providers.antigravity.successRate, 0);
  });

  it('ranks skill reliability and flags unreliable skills for orchestration improvements', async () => {
    const observatory = new AgentObservatory();

    // Solid skill: 5 successes, 0 retries
    for (let i = 0; i < 5; i++) {
      await observatory.recordEvent({ skillId: 'solid-skill', status: 'completed', retries: 0 });
    }

    // Critical/flaky skill: 1 success, 3 failures, high retries
    await observatory.recordEvent({ skillId: 'unstable-api', status: 'completed', retries: 2 });
    await observatory.recordEvent({ skillId: 'unstable-api', status: 'failed', retries: 3, toolErrors: 2 });
    await observatory.recordEvent({ skillId: 'unstable-api', status: 'failed', retries: 3, toolErrors: 3 });

    const metrics = observatory.getMetrics();

    assert.equal(metrics.skills['solid-skill'].reliabilityTier, 'rock_solid');
    assert.ok(metrics.unreliableSkills.some(s => s.skillId === 'unstable-api'));
    assert.ok(metrics.recommendations.some(r => r.includes('Refactor prompt templates and tool schemas for unreliable skills: unstable-api')));
  });
});
