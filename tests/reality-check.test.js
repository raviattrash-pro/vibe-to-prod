import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMarketReality,
  EVIDENCE_TIERS
} from '../src/validation/reality-check.js';

describe('Priority 6: Reality Check Engine', () => {
  it('strictly treats synthetic customer simulation as heuristic and caps confidence without claiming market demand', () => {
    const result = evaluateMarketReality({
      projectName: 'AI Coffee Roaster',
      concept: 'AI powered coffee bean selection',
      valueProposition: 'Fresh coffee roasted by AI',
      data: {
        [EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES]: {
          personasCount: 100,
          simulatedConversionRate: 42,
          objections: ['Too expensive', 'Prefers local coffee shop']
        }
      }
    });

    assert.equal(result.hasStatisticalSignificance, false);
    assert.equal(result.verdict, 'HIGH_RISK_UNVALIDATED');
    assert.ok(result.marketEvidenceScore <= 20);

    const syntheticTier = result.tiers[EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES];
    assert.equal(syntheticTier.present, true);
    assert.equal(syntheticTier.confidenceTier, 'heuristic_only');
    assert.equal(syntheticTier.maxConfidence, 0.20);
    assert.ok(syntheticTier.limitations.some(l => l.includes('NEVER be treated as empirical market demand')));
    assert.ok(result.assumptions.some(a => a.includes('Simulated cohort assumes')));
    assert.ok(result.unknowns.length > 0);
  });

  it('incorporates competitor research and qualitative customer interviews to identify unknown gaps', () => {
    const result = evaluateMarketReality({
      projectName: 'B2B Compliance Bot',
      concept: 'Automated SOC2 audit compliance',
      data: {
        [EVIDENCE_TIERS.COMPETITOR_RESEARCH]: {
          competitors: ['Vanta', 'Drata', 'Secureframe'],
          priceRange: '$5,000 - $20,000 / yr',
          featureGaps: ['Real-time git diff auditing']
        },
        [EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS]: {
          completedCount: 4,
          confirmedPains: ['Manual evidence gathering takes 2 weeks every quarter']
        }
      }
    });

    assert.equal(result.tiers[EVIDENCE_TIERS.COMPETITOR_RESEARCH].present, true);
    assert.equal(result.tiers[EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS].present, true);
    assert.ok(result.unknowns.some(u => u.includes('Only 4 customer interview(s) completed')));
    assert.ok(result.recommendedExperiments.some(e => e.includes('Interview at least 10 target customers')));
  });

  it('verifies statistical significance only when empirical sample size criteria are met', () => {
    // Underpowered landing page (15 visitors) -> no stat sig
    const underpowered = evaluateMarketReality({
      projectName: 'SaaS App',
      data: {
        [EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS]: {
          visitors: 15,
          ctaClicks: 3
        }
      }
    });
    assert.equal(underpowered.hasStatisticalSignificance, false);
    assert.equal(underpowered.tiers[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS].data.hasStatisticalSignificance, false);

    // Statistically powered landing page (350 visitors, 35 clicks -> 10% measured conversion)
    const powered = evaluateMarketReality({
      projectName: 'SaaS App',
      data: {
        [EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS]: {
          visitors: 350,
          ctaClicks: 35
        }
      }
    });
    assert.equal(powered.hasStatisticalSignificance, true);
    assert.equal(powered.tiers[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS].data.measuredConversionRate, 10);
    assert.equal(powered.tiers[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS].data.hasStatisticalSignificance, true);
  });

  it('awards PROVEN_MARKET_FIT and gold_standard confidence when real paying customers and telemetry exist', () => {
    const result = evaluateMarketReality({
      projectName: 'DevOps Copilot',
      concept: 'AI automated canary rollouts',
      data: {
        [EVIDENCE_TIERS.COMPETITOR_RESEARCH]: { competitors: ['Spinnaker', 'ArgoCD'] },
        [EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE]: { sources: ['HackerNews thread', 'Reddit /r/devops'] },
        [EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS]: { completedCount: 12 },
        [EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS]: { visitors: 500, ctaClicks: 65 },
        [EVIDENCE_TIERS.WAITLIST_CONVERSION]: { signups: 200, verifiedWithDepositOrSurvey: 45 },
        [EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE]: {
          payingCustomers: 32,
          mrr: 12800,
          dailyActiveUsers: 140
        }
      }
    });

    assert.equal(result.verdict, 'PROVEN_MARKET_FIT');
    assert.ok(result.marketEvidenceScore >= 70);
    assert.equal(result.hasStatisticalSignificance, true);
    assert.equal(result.tiers[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE].confidenceTier, 'gold_standard');
    assert.equal(result.tiers[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE].data.payingCustomers, 32);
    assert.equal(result.tiers[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE].data.mrr, 12800);
  });
});
