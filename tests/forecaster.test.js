import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTierCost,
  generateScaleForecast,
  SCALE_TIERS,
  VERIFIED_RATE_CARDS
} from '../src/forecaster/scale.js';

describe('Priority 7: Cost and Scale Forecaster', () => {
  it('calculates deterministic cost and resource volume for 100 users', () => {
    const tier = calculateTierCost(100);

    assert.equal(tier.users, 100);
    assert.equal(tier.monthlyVolume.apiRequests, 120000);
    assert.ok(tier.totalMonthlyCost.expected > 0);
    assert.ok(tier.totalMonthlyCost.min <= tier.totalMonthlyCost.expected);
    assert.ok(tier.totalMonthlyCost.max >= tier.totalMonthlyCost.expected);
    assert.equal(tier.bottlenecks.length, 0); // No critical bottlenecks at 100 users
  });

  it('models all 7 required resource categories with min, expected, max ranges', () => {
    const tier = calculateTierCost(1000);
    const breakdown = tier.costBreakdown;

    const requiredCategories = ['hosting', 'database', 'storage', 'bandwidth', 'backgroundJobs', 'aiInference'];
    for (const cat of requiredCategories) {
      assert.ok(breakdown[cat], `Missing category ${cat}`);
      assert.ok(typeof breakdown[cat].min === 'number');
      assert.ok(typeof breakdown[cat].expected === 'number');
      assert.ok(typeof breakdown[cat].max === 'number');
      assert.ok(breakdown[cat].min <= breakdown[cat].expected);
      assert.ok(breakdown[cat].expected <= breakdown[cat].max);
    }
  });

  it('identifies connection pooling and AI inference cost bottlenecks at high scale (10k and 100k)', () => {
    const tier10k = calculateTierCost(10000);
    assert.ok(tier10k.bottlenecks.some(b => b.subsystem === 'database' && b.risk.includes('Connection pool')));

    const tier100k = calculateTierCost(100000);
    assert.ok(tier100k.bottlenecks.some(b => b.subsystem === 'ai_inference'));
    assert.ok(tier100k.bottlenecks.some(b => b.subsystem === 'database' && b.risk.includes('write contention')));
  });

  it('generates a full multi-tier scale forecast across 100, 1k, 10k, and 100k users with evolution roadmap', () => {
    const forecast = generateScaleForecast({ projectName: 'E-Commerce Platform' });

    assert.equal(forecast.projectName, 'E-Commerce Platform');
    assert.equal(forecast.scenarios.length, 4);
    assert.deepEqual(forecast.scenarios.map(s => s.users), SCALE_TIERS);

    // Verify progression: 100 < 1k < 10k < 100k
    const costs = forecast.scenarios.map(s => s.totalMonthlyCost.expected);
    assert.ok(costs[0] < costs[1]);
    assert.ok(costs[1] < costs[2]);
    assert.ok(costs[2] < costs[3]);

    // Evolution roadmap verification
    assert.equal(forecast.evolutionRoadmap.length, 3);
    assert.ok(forecast.evolutionRoadmap[0].priorities.includes('Basic rate-limiting'));
    assert.ok(forecast.evolutionRoadmap[1].priorities.includes('PgBouncer connection pooling'));
    assert.ok(forecast.evolutionRoadmap[2].priorities.includes('AI semantic prompt caching'));

    // Verified provider references
    assert.ok(forecast.rateCardsReferenced.providers.length >= 4);
  });
});
