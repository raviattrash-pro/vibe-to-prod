---
name: performance
description: Measure and optimise application performance: Core Web Vitals (LCP, INP, CLS), bundle size analysis, server response times (TTFB), database query profiling (N+1 detection), memory usage, and caching strategy.
---

# Performance Engineering

## Purpose

Identify and prioritise performance bottlenecks through reproducible measurements, establish performance budgets, and recommend targeted optimisations with before/after evidence.

## Activate when

When latency, throughput, scalability, load, or performance requirements are present, or when users report slowness. Select this capability only when it applies to the request.

## Inputs

- performance goals or SLAs
- runtime measurements or user complaints
- load profile (concurrent users, request patterns)
- infrastructure constraints

## Procedure

1. Establish performance goals: target TTFB (<200ms), LCP (<2.5s), INP (<200ms), CLS (<0.1), bundle size budget, and API response time targets.
2. Measure current state using available tools: Lighthouse CI (if browser available), webpack-bundle-analyzer or source-map-explorer for bundle size, server-side timing logs.
3. Profile database queries: identify N+1 query patterns by reviewing ORM usage and query logs. Check for missing indexes on frequently queried columns.
4. Analyse bundle size: identify the largest dependencies, check for tree-shaking effectiveness, look for duplicate packages, and measure gzipped transfer size.
5. Review caching strategy: HTTP cache headers (Cache-Control, ETag), CDN configuration, database query caching, and in-memory caching. Identify cacheable but uncached responses.
6. Check for common performance anti-patterns: synchronous blocking operations, unbounded list rendering, missing pagination, unoptimised images (format, dimensions, lazy loading), render-blocking resources.
7. Record all measurements with: tool used, environment (OS, Node version, hardware), timestamp, and exact command. Never fabricate benchmark numbers.
8. Prioritise bottlenecks by user impact and fix effort. Recommend specific changes with expected improvement.

## Avoid

- Fabricating benchmark numbers or Lighthouse scores without running the tool.
- Optimising prematurely without measuring the actual bottleneck first.
- Recommending infrastructure scaling when application-level fixes would suffice.
- Comparing measurements taken in different environments without noting the difference.

## Expected outputs

- reproducible measurements with environment details
- performance budgets
- prioritised bottleneck list
- optimisation recommendations with expected impact

## Validation

- measure actual behavior (not theoretical)
- record the environment and tool versions
- do not invent benchmarks
- before/after measurements for applied optimisations
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
