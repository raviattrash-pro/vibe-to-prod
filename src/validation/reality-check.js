import { randomUUID } from 'node:crypto';

export const EVIDENCE_TIERS = {
  SYNTHETIC_HYPOTHESES: 'synthetic_hypotheses',
  COMPETITOR_RESEARCH: 'competitor_research',
  PUBLIC_MARKET_EVIDENCE: 'public_market_evidence',
  REAL_CUSTOMER_INTERVIEWS: 'real_customer_interviews',
  LANDING_PAGE_EXPERIMENTS: 'landing_page_experiments',
  WAITLIST_CONVERSION: 'waitlist_conversion',
  ACTUAL_PURCHASE_AND_USAGE: 'actual_purchase_and_usage'
};

export const TIER_WEIGHTS = {
  [EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES]: 0.05,
  [EVIDENCE_TIERS.COMPETITOR_RESEARCH]: 0.10,
  [EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE]: 0.15,
  [EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS]: 0.20,
  [EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS]: 0.20,
  [EVIDENCE_TIERS.WAITLIST_CONVERSION]: 0.15,
  [EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE]: 0.15
};

export const TIER_MAX_CONFIDENCE = {
  [EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES]: 0.20,
  [EVIDENCE_TIERS.COMPETITOR_RESEARCH]: 0.40,
  [EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE]: 0.55,
  [EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS]: 0.70,
  [EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS]: 0.85,
  [EVIDENCE_TIERS.WAITLIST_CONVERSION]: 0.90,
  [EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE]: 1.00
};

/**
 * Assess market reality by separating synthetic hypotheses from real empirical demand data.
 */
export function evaluateMarketReality({
  projectName = '',
  concept = '',
  valueProposition = '',
  pricing = null,
  data = {}
} = {}) {
  const runId = randomUUID();
  const evaluatedAt = new Date().toISOString();

  const tiersReport = {};
  const assumptions = [];
  const unknowns = [];
  const recommendedExperiments = [];

  // 1. Synthetic Hypotheses
  const synthetic = data[EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES] || {};
  const hasSynthetic = Boolean(synthetic.personasCount || synthetic.simulatedConversionRate !== undefined);
  tiersReport[EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES] = {
    present: hasSynthetic,
    confidenceTier: 'heuristic_only',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.SYNTHETIC_HYPOTHESES],
    data: {
      personasSimulated: Number(synthetic.personasCount) || 0,
      simulatedConversionRate: synthetic.simulatedConversionRate ?? null,
      topSimulatedObjections: Array.isArray(synthetic.objections) ? synthetic.objections : []
    },
    limitations: [
      'Simulated personas generate hypothetical objections and must NEVER be treated as empirical market demand.',
      'Conversion rates from synthetic cohorts are strictly exploratory and carry zero statistical validity with real human buyers.'
    ]
  };

  if (hasSynthetic && synthetic.simulatedConversionRate !== undefined) {
    assumptions.push(`Simulated cohort assumes customer willingness to pay mirrors LLM persona responses (${synthetic.simulatedConversionRate}% conversion).`);
  }

  // 2. Competitor Research
  const competitor = data[EVIDENCE_TIERS.COMPETITOR_RESEARCH] || {};
  const hasCompetitor = Array.isArray(competitor.competitors) && competitor.competitors.length > 0;
  tiersReport[EVIDENCE_TIERS.COMPETITOR_RESEARCH] = {
    present: hasCompetitor,
    confidenceTier: 'observational',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.COMPETITOR_RESEARCH],
    data: {
      competitorsAnalyzed: competitor.competitors || [],
      priceRange: competitor.priceRange || null,
      identifiedFeatureGaps: competitor.featureGaps || []
    },
    limitations: [
      'Competitor presence validates general category demand but does not guarantee product-market fit for a specific novel proposition.'
    ]
  };

  if (!hasCompetitor) {
    unknowns.push('Competitor alternative landscape and pricing elasticity remain unresearched.');
    recommendedExperiments.push('Conduct pricing and feature tear-down of 3-5 existing alternatives.');
  }

  // 3. Public Market Evidence
  const publicEvidence = data[EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE] || {};
  const hasPublicEvidence = Array.isArray(publicEvidence.sources) && publicEvidence.sources.length > 0;
  tiersReport[EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE] = {
    present: hasPublicEvidence,
    confidenceTier: 'secondary_data',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.PUBLIC_MARKET_EVIDENCE],
    data: {
      searchVolumeSignals: publicEvidence.searchVolume || null,
      forumDiscussions: publicEvidence.sources || [],
      industryBenchmarks: publicEvidence.benchmarks || []
    },
    limitations: [
      'Public complaints and forum posts indicate pain points but do not measure specific intent to buy your solution.'
    ]
  };

  if (!hasPublicEvidence) {
    unknowns.push('Public discourse and search interest volume are unverified.');
  }

  // 4. Real Customer Interviews
  const interviews = data[EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS] || {};
  const interviewCount = Number(interviews.completedCount) || 0;
  const hasInterviews = interviewCount > 0;
  tiersReport[EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS] = {
    present: hasInterviews,
    confidenceTier: 'qualitative_primary',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.REAL_CUSTOMER_INTERVIEWS],
    data: {
      completedCount: interviewCount,
      confirmedPains: interviews.confirmedPains || [],
      quoteSamples: (interviews.quotes || []).slice(0, 5)
    },
    limitations: [
      'Qualitative interviews establish problem resonance but can suffer from social desirability bias regarding stated willingness to pay.'
    ]
  };

  if (interviewCount < 5) {
    unknowns.push(`Only ${interviewCount} customer interview(s) completed (recommended: >= 10).`);
    recommendedExperiments.push('Interview at least 10 target customers focusing on their current workarounds and actual budget authority.');
  }

  // 5. Landing Page Experiments
  const landing = data[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS] || {};
  const visitors = Number(landing.visitors) || 0;
  const ctaClicks = Number(landing.ctaClicks) || 0;
  const hasLanding = visitors > 0;
  const measuredCtaRate = visitors > 0 ? (ctaClicks / visitors) * 100 : null;
  const hasLandingStatSig = visitors >= 100;

  tiersReport[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS] = {
    present: hasLanding,
    confidenceTier: 'empirical_behavioral',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.LANDING_PAGE_EXPERIMENTS],
    data: {
      visitors,
      ctaClicks,
      measuredConversionRate: measuredCtaRate !== null ? Math.round(measuredCtaRate * 10) / 10 : null,
      hasStatisticalSignificance: hasLandingStatSig
    },
    limitations: [
      hasLandingStatSig
        ? 'Valid behavioral signal of initial click interest; does not prove downstream retention or sustained payment.'
        : 'Sample size is underpowered (< 100 visitors); cannot claim statistical significance.'
    ]
  };

  if (!hasLanding) {
    recommendedExperiments.push('Deploy a lean landing page test targeting 200 real prospects to measure genuine CTA conversion.');
  }

  // 6. Waitlist Conversion
  const waitlist = data[EVIDENCE_TIERS.WAITLIST_CONVERSION] || {};
  const waitlistSignups = Number(waitlist.signups) || 0;
  const verifiedSignups = Number(waitlist.verifiedWithDepositOrSurvey) || 0;
  const hasWaitlist = waitlistSignups > 0;

  tiersReport[EVIDENCE_TIERS.WAITLIST_CONVERSION] = {
    present: hasWaitlist,
    confidenceTier: 'high_intent',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.WAITLIST_CONVERSION],
    data: {
      totalSignups: waitlistSignups,
      highIntentSignups: verifiedSignups
    },
    limitations: [
      'Email waitlists without financial deposit typically experience 5-15% actual activation upon launch.'
    ]
  };

  // 7. Actual Purchase and Usage
  const actual = data[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE] || {};
  const payingCustomers = Number(actual.payingCustomers) || 0;
  const mrr = Number(actual.mrr) || 0;
  const dau = Number(actual.dailyActiveUsers) || 0;
  const hasActual = payingCustomers > 0 || dau > 0;

  tiersReport[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE] = {
    present: hasActual,
    confidenceTier: 'gold_standard',
    maxConfidence: TIER_MAX_CONFIDENCE[EVIDENCE_TIERS.ACTUAL_PURCHASE_AND_USAGE],
    data: {
      payingCustomers,
      mrr,
      dailyActiveUsers: dau
    },
    limitations: [
      'Primary ground-truth telemetry.'
    ]
  };

  // Calculate Market Evidence Score (0 - 100)
  let score = 0;
  if (hasSynthetic) score += 5;
  if (hasCompetitor) score += 10;
  if (hasPublicEvidence) score += 15;
  if (hasInterviews) score += Math.min(20, interviewCount * 2);
  if (hasLanding && hasLandingStatSig) score += 20;
  else if (hasLanding) score += 10;
  if (hasWaitlist && verifiedSignups > 0) score += 15;
  else if (hasWaitlist) score += 8;
  if (hasActual && payingCustomers > 0) score += 15;

  score = Math.min(100, Math.max(0, score));

  // Determine Verdict
  let verdict = 'HIGH_RISK_UNVALIDATED';
  let verdictSummary = '';

  if (score >= 70 && hasActual) {
    verdict = 'PROVEN_MARKET_FIT';
    verdictSummary = 'Strong multi-tier empirical evidence with real paying users and statistically sound behavioral signal.';
  } else if (score >= 50 && (hasLanding || hasWaitlist || interviewCount >= 5)) {
    verdict = 'VALIDATED_EARLY_TRACTION';
    verdictSummary = 'Promising behavioral demand signals from human prospects; continue testing retention and unit economics.';
  } else if (score >= 25) {
    verdict = 'EARLY_SIGNAL_NEEDS_VALIDATION';
    verdictSummary = 'Preliminary discovery completed, but demand claims remain largely hypothetical without behavioral proof.';
  } else {
    verdict = 'HIGH_RISK_UNVALIDATED';
    verdictSummary = 'High risk of building something nobody pays for. Evidence is currently limited to synthetic speculation or unverified assumptions.';
  }

  // Statistical Significance Verification Guard
  const hasTrueStatSig = (hasLanding && hasLandingStatSig) || (payingCustomers >= 30);

  return {
    runId,
    evaluatedAt,
    projectName,
    concept,
    valueProposition,
    pricing,
    marketEvidenceScore: score,
    verdict,
    verdictSummary,
    hasStatisticalSignificance: hasTrueStatSig,
    tiers: tiersReport,
    assumptions,
    unknowns,
    recommendedExperiments,
    evidence: `Market Reality Evaluation: ${verdict} (Score: ${score}/100). Empirical validation: ${hasTrueStatSig ? 'statistically verified' : 'unvalidated / early sample'}. ${unknowns.length} unknown(s) identified.`
  };
}
