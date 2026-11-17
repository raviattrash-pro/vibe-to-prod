---
name: design-styles-catalog
description: Select and apply the right visual design style for a project from a curated catalog of 30+ modern styles (Minimalism, Brutalism, Glassmorphism, Neumorphism, Bento Grid, Neo-Brutalism, Y2K, Editorial, Swiss Design, etc.) with implementation tokens, use-case guidance, and framework-specific code patterns.
---

# Design Styles Catalog

## Purpose

Help teams choose an intentional design style instead of defaulting to generic AI-generated templates — providing the visual vocabulary, implementation tokens, and framework-specific code patterns for each style.

## Activate when

When starting a new UI project and no design direction exists, when the user asks for a specific design style, when AI-generated UI looks generic or template-like, or when exploring visual directions for a redesign. Select this capability only when it applies to the request.

## Inputs

- project type and audience
- brand personality (playful, professional, technical, luxury, etc.)
- target framework (React, Vue, Svelte, Tailwind, plain CSS)
- content type (dashboard, landing page, portfolio, SaaS, e-commerce)
- accessibility requirements

## Procedure

1. Understand the project context: what is the product, who is the audience, what emotion should the design evoke, and what content types dominate (data-heavy, media-rich, text-focused, interactive).
2. Present 2-3 candidate styles from the catalog that match the project context. For each candidate, explain: visual characteristics, best-suited project types, notable examples, and trade-offs (accessibility, performance, development complexity).
3. For the selected style, provide complete design tokens: colour palette (with hex values and CSS variables), typography stack, spacing scale, border-radius values, shadow definitions, background patterns, and animation characteristics.
4. Define component patterns specific to the style: how cards, buttons, navigation, forms, modals, and data tables should look. Include specific CSS properties that define the style (e.g., Glassmorphism: backdrop-filter, border with rgba, background with transparency).
5. Provide framework-specific code snippets: Tailwind utility classes, CSS custom properties, or styled-component patterns that implement the core style tokens. Include a starter component (e.g., a card or hero section) as a reference implementation.
6. Document style-specific accessibility considerations: Glassmorphism may fail contrast against variable backgrounds, Brutalism may confuse users expecting conventional navigation, dark themes need careful contrast tuning. Provide mitigations for each.
7. Produce a style guide summary: 1-page reference with the style name, 5-word description, token values, component example, Do's (3-5 rules), and Don'ts (3-5 anti-patterns) that an AI agent can use as a constraint.

## Avoid

- Recommending a style purely for aesthetic reasons without considering the audience and content type.
- Applying Glassmorphism or other translucent styles without verifying text contrast against all possible backgrounds.
- Mixing multiple competing styles (e.g., Brutalism + Neumorphism) without an intentional design rationale.
- Generating token values without testing them in a real component — verify that the tokens produce the intended visual result.
- Recommending complex styles (3D, heavy animation) for content-heavy or accessibility-critical applications without documenting the trade-offs.

## Expected outputs

- recommended design style with rationale
- style-specific design tokens
- component patterns for the chosen style
- framework-specific implementation snippets
- style comparison matrix (if exploring options)

## Validation

- style matches project type and audience
- tokens produce the intended visual result when applied
- accessibility verified (contrast ratios, focus indicators, reduced-motion)
- framework-specific code is functional (not pseudo-code)
- Do's and Don'ts are specific to the chosen style
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
