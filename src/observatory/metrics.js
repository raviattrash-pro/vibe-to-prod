import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Agent Reliability Observatory Telemetry Engine.
 */
export class AgentObservatory {
  constructor({ maxEvents = 5000, storagePath = '' } = {}) {
    this.maxEvents = maxEvents;
    this.storagePath = storagePath;
    this.events = [];
  }

  /**
   * Load persisted telemetry if available.
   */
  async load() {
    if (!this.storagePath) return;
    try {
      const data = await readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        this.events = parsed.slice(-this.maxEvents);
      }
    } catch {
      // Ignored if file doesn't exist yet
    }
  }

  /**
   * Persist telemetry to disk.
   */
  async persist() {
    if (!this.storagePath) return;
    try {
      await mkdir(path.dirname(this.storagePath), { recursive: true });
      await writeFile(this.storagePath, JSON.stringify(this.events, null, 2), 'utf8');
    } catch {
      // Non-fatal
    }
  }

  /**
   * Record a new agent execution event.
   */
  async recordEvent({
    sessionId = randomUUID(),
    taskId = 'task-unknown',
    agentId = 'unknown',
    provider = 'codex',
    skillId = 'general',
    status = 'completed', // completed | failed | cancelled | retried
    durationMs = 0,
    retries = 0,
    toolErrors = 0,
    handoffValid = true,
    costEstimate = 0,
    humanInterventions = 0,
    qualityDelta = 0,
    timestamp = new Date().toISOString()
  } = {}) {
    const event = {
      id: randomUUID(),
      sessionId,
      taskId,
      agentId,
      provider,
      skillId,
      status,
      durationMs: Number(durationMs) || 0,
      retries: Number(retries) || 0,
      toolErrors: Array.isArray(toolErrors) ? toolErrors.length : Number(toolErrors) || 0,
      handoffValid: Boolean(handoffValid),
      costEstimate: Number(costEstimate) || 0,
      humanInterventions: Number(humanInterventions) || 0,
      qualityDelta: Number(qualityDelta) || 0,
      timestamp
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    await this.persist();
    return event;
  }

  /**
   * Compute comprehensive agent reliability and performance analytics.
   */
  getMetrics() {
    const total = this.events.length;
    if (total === 0) {
      return {
        summary: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          overallSuccessRate: 100,
          avgCompletionTimeMs: 0,
          totalRetries: 0,
          avgRetriesPerTask: 0,
          totalToolErrors: 0,
          handoffFailureRate: 0,
          totalCostUsd: 0,
          totalHumanInterventions: 0,
          avgQualityDelta: 0
        },
        providers: {},
        skills: {},
        unreliableSkills: [],
        recommendations: ['No execution events recorded yet. Run workflows to collect telemetry.']
      };
    }

    const successful = this.events.filter(e => e.status === 'completed').length;
    const failed = this.events.filter(e => e.status === 'failed').length;
    const totalDuration = this.events.reduce((sum, e) => sum + e.durationMs, 0);
    const totalRetries = this.events.reduce((sum, e) => sum + e.retries, 0);
    const totalToolErrors = this.events.reduce((sum, e) => sum + e.toolErrors, 0);
    const handoffFailures = this.events.filter(e => e.handoffValid === false).length;
    const totalCost = this.events.reduce((sum, e) => sum + e.costEstimate, 0);
    const totalInterventions = this.events.reduce((sum, e) => sum + e.humanInterventions, 0);
    const totalQualityDelta = this.events.reduce((sum, e) => sum + e.qualityDelta, 0);

    // Group by Provider
    const providers = {};
    for (const e of this.events) {
      const p = e.provider || 'unknown';
      if (!providers[p]) {
        providers[p] = { executions: 0, success: 0, failed: 0, totalDurationMs: 0, retries: 0, toolErrors: 0, cost: 0 };
      }
      providers[p].executions++;
      if (e.status === 'completed') providers[p].success++;
      if (e.status === 'failed') providers[p].failed++;
      providers[p].totalDurationMs += e.durationMs;
      providers[p].retries += e.retries;
      providers[p].toolErrors += e.toolErrors;
      providers[p].cost += e.costEstimate;
    }

    for (const [key, data] of Object.entries(providers)) {
      data.successRate = Math.round((data.success / data.executions) * 1000) / 10;
      data.avgDurationMs = Math.round(data.totalDurationMs / data.executions);
      data.cost = Math.round(data.cost * 1000) / 1000;
    }

    // Group by Skill
    const skills = {};
    for (const e of this.events) {
      const s = e.skillId || 'general';
      if (!skills[s]) {
        skills[s] = { invocations: 0, success: 0, failed: 0, totalDurationMs: 0, retries: 0, toolErrors: 0 };
      }
      skills[s].invocations++;
      if (e.status === 'completed') skills[s].success++;
      if (e.status === 'failed') skills[s].failed++;
      skills[s].totalDurationMs += e.durationMs;
      skills[s].retries += e.retries;
      skills[s].toolErrors += e.toolErrors;
    }

    const unreliableSkills = [];
    for (const [key, data] of Object.entries(skills)) {
      data.successRate = Math.round((data.success / data.invocations) * 1000) / 10;
      data.avgDurationMs = Math.round(data.totalDurationMs / data.invocations);
      data.retryFrequency = Math.round((data.retries / data.invocations) * 100) / 100;

      if (data.successRate >= 95) data.reliabilityTier = 'rock_solid';
      else if (data.successRate >= 80) data.reliabilityTier = 'stable';
      else if (data.successRate >= 60) data.reliabilityTier = 'flaky';
      else data.reliabilityTier = 'critical_attention';

      if (data.successRate < 80 || data.retryFrequency > 1.0) {
        unreliableSkills.push({
          skillId: key,
          successRate: data.successRate,
          retryFrequency: data.retryFrequency,
          toolErrors: data.toolErrors,
          tier: data.reliabilityTier
        });
      }
    }

    // Diagnostics & Recommendations
    const recommendations = [];
    if (unreliableSkills.length > 0) {
      recommendations.push(`Refactor prompt templates and tool schemas for unreliable skills: ${unreliableSkills.map(s => s.skillId).join(', ')}.`);
    }
    if (handoffFailures > 0) {
      recommendations.push(`Context handoff failed in ${handoffFailures} executions. Review phase handoff hashing and prompt length limits.`);
    }
    if (totalToolErrors > total * 0.5) {
      recommendations.push(`High tool error rate (${totalToolErrors} errors across ${total} tasks). Inspect runner parameter parsing.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Orchestration and agent reliability metrics are within acceptable production thresholds.');
    }

    return {
      summary: {
        totalExecutions: total,
        successfulExecutions: successful,
        failedExecutions: failed,
        overallSuccessRate: Math.round((successful / total) * 1000) / 10,
        avgCompletionTimeMs: Math.round(totalDuration / total),
        totalRetries,
        avgRetriesPerTask: Math.round((totalRetries / total) * 100) / 100,
        totalToolErrors,
        handoffFailureRate: Math.round((handoffFailures / total) * 1000) / 10,
        totalCostUsd: Math.round(totalCost * 1000) / 1000,
        totalHumanInterventions: totalInterventions,
        avgQualityDelta: Math.round((totalQualityDelta / total) * 100) / 100
      },
      providers,
      skills,
      unreliableSkills,
      recommendations
    };
  }
}
