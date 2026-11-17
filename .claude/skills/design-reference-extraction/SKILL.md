---
name: design-reference-extraction
description: Extract design language, visual rules, tokens, and Do's and Don'ts from reference websites or design screenshots to generate a DESIGN.md specification file that AI agents use as a binding design constraint — preventing generic purple-gradient AI-generated UIs.
---

# Design Reference Extraction

## Purpose

Translate a visual reference (a website URL, screenshot, or design system) into a structured DESIGN.md file containing explicit design rules, tokens, Do's, and Don'ts so that AI coding agents produce UI that matches the intended aesthetic instead of defaulting to generic templates.

## Activate when

When the user provides a reference website, screenshot, or design inspiration and wants their AI-generated UI to match that style; when AI-generated frontends look generic or template-like; when creating a DESIGN.md for a project. Select this capability only when it applies to the request.

## Inputs

- reference website URL or screenshot
- brand assets (logo, colors, fonts) if available
- target framework (React, Vue, Svelte, plain HTML/CSS)
- existing design tokens or component library
- specific pages or sections to extract from

## Procedure

1. Inspect the reference source: if a URL, examine the live site's visual design, CSS custom properties, computed styles, layout patterns, and responsive behaviour. If a screenshot, analyse the visual hierarchy, colour palette, typography, spacing, and component patterns.
2. Extract the colour palette: identify primary, secondary, accent, background, surface, text, and border colours. Record exact hex/HSL values. Note colour usage patterns (e.g., 'primary used for CTAs only', 'backgrounds are always neutral').
3. Extract typography: identify font families (and fallback stacks), the type scale (heading sizes, body, caption, label), font weights used, line heights, and letter spacing. Note hierarchy patterns (e.g., 'headings are always uppercase', 'body text never exceeds 65ch width').
4. Extract spacing and layout: identify the spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px), grid system (columns, gutters, max-width), border radii, shadow levels, and container patterns.
5. Document interaction and motion patterns: hover states, focus indicators, transitions (duration, easing), loading states, and micro-interactions. Note reduced-motion accommodations.
6. Write the Do's section: specific, actionable rules the AI must follow. Examples: 'DO use 8px spacing increments', 'DO keep card border-radius at 12px', 'DO use the sans-serif stack for all UI text', 'DO maintain 60ch max-width for body text'.
7. Write the Don'ts section: explicit anti-patterns the AI must avoid. Examples: 'DON'T use purple-to-blue gradients on backgrounds', 'DON'T use more than 2 font families', 'DON'T add drop shadows to flat-design cards', 'DON'T center-align body text paragraphs'.
8. Compile everything into a DESIGN.md file with sections: Overview (design philosophy in 2-3 sentences), Tokens (colours, typography, spacing, radii, shadows as CSS custom properties), Layout Rules, Component Patterns, Do's, Don'ts, and Reference Source attribution.

## Avoid

- Copying proprietary design assets, logos, or copyrighted images from the reference site.
- Extracting design rules without attributing the reference source.
- Generating vague rules ('make it look clean') instead of specific tokens and values.
- Assuming the reference site's design is accessible — verify contrast ratios independently.
- Producing a DESIGN.md so long that it consumes too much agent context window — keep it under 300 lines.

## Expected outputs

- DESIGN.md specification file
- extracted design tokens (colors, typography, spacing, radii, shadows)
- Do's list (patterns to follow)
- Don'ts list (patterns to avoid)
- component style guide

## Validation

- DESIGN.md contains concrete token values (not vague descriptions)
- Do's and Don'ts are specific and actionable
- colour contrast verified independently from reference
- DESIGN.md is under 300 lines to fit agent context windows
- reference source attributed
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
