---
name: seo
description: Assess and implement technical SEO: semantic HTML, metadata, Open Graph and Twitter cards, structured data (JSON-LD), sitemap.xml, robots.txt, canonical URLs, crawlability, and Core Web Vitals impact on search.
---

# SEO and AI Discoverability

## Purpose

Ensure public-facing pages are technically discoverable by search engines and AI systems through correct metadata, semantic markup, structured data, and crawl configuration, while protecting private routes from indexing.

## Activate when

For every project assessment; implement changes only for relevant public pages. Select this capability only when it applies to the request.

## Inputs

- routes (public vs authenticated)
- content structure
- rendering method (SSR, SSG, CSR, hybrid)
- current meta tags and structured data
- analytics data if available

## Procedure

1. List all routes and classify them as public (indexable) or private/authenticated (must be excluded from indexing).
2. Verify that private/authenticated routes are protected from indexing: check robots.txt disallow rules, meta robots noindex tags, and X-Robots-Tag headers.
3. Audit each public page for: unique title tag (50-60 chars), meta description (120-160 chars), canonical URL, Open Graph tags (og:title, og:description, og:image, og:url), and Twitter Card tags.
4. Check semantic HTML structure: one h1 per page, logical heading hierarchy (h1-h6), landmark elements (nav, main, article, footer), and meaningful alt text on images.
5. Validate structured data (JSON-LD) if present: check against schema.org types using available validation. Only add structured data for content that actually exists on the page.
6. Review sitemap.xml: verify it lists public routes, excludes private ones, uses correct URLs (matching canonical), and is referenced in robots.txt.
7. Check rendering method impact: if the app uses client-side rendering (CSR/SPA), verify that critical content is available in the initial HTML or via SSR/SSG for crawler access.
8. Report findings with clear severity levels and actionable remediation. Never guarantee search rankings or AI citation outcomes.

## Avoid

- Adding structured data for content that does not exist on the page (fabricated reviews, fake FAQ, etc.).
- Guaranteeing specific search rankings, traffic numbers, or AI citation placement.
- Indexing authenticated or private pages that contain user data.
- Adding SEO changes to routes that are behind authentication without verifying they are publicly accessible.

## Expected outputs

- SEO readiness report
- metadata audit
- structured data validation
- sitemap and robots.txt review
- indexing protection verification

## Validation

- claims calibrated (no guaranteed rankings)
- private pages excluded from indexing
- structured data matches actual page content
- sitemap references only public canonical URLs
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
