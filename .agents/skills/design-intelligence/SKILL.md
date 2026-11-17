---
name: design-intelligence
description: Guide original visual design for user-facing screens: design tokens, typography, color systems, spacing scales, responsive layouts, interaction patterns, and accessibility compliance.
---

# Design Intelligence

## Purpose

Produce an intentional, original visual design system with tokens, components, responsive behaviour, and accessibility conformance — not a generic template or copied theme.

## Activate when

When user-facing screens or visual systems are in scope. Select this capability only when it applies to the request.

## Inputs

- requirements
- audience
- brand references
- existing design tokens or component library
- accessibility requirements (WCAG level)

## Procedure

1. Inspect the existing codebase for design tokens, CSS variables, theme files, component libraries, and style conventions before proposing a new system.
2. Define the visual direction: primary and secondary palette (with WCAG AA contrast ratios verified), type scale (modular or fluid), spacing scale (4px or 8px base), border radii, and shadow levels.
3. Document design tokens as CSS custom properties or a JSON token file; ensure tokens cover color, typography (family, weight, size, line-height), spacing, breakpoints, and motion duration.
4. Audit existing components for accessibility: semantic HTML, ARIA labels, focus management, keyboard navigation, and colour contrast. Record each finding with its WCAG criterion.
5. Define responsive breakpoints and test layout behaviour at mobile (360px), tablet (768px), and desktop (1280px) widths. Record which components reflow, stack, or hide.
6. Specify motion and transition defaults; respect prefers-reduced-motion by disabling or reducing animations. Document the motion tokens.
7. Produce a component inventory listing each UI component, its variants, states (default, hover, focus, active, disabled, error), and the tokens it consumes.

## Avoid

- Copying a third-party theme or design kit without verifying its license and attribution requirements.
- Using colour combinations that fail WCAG AA contrast (4.5:1 for normal text, 3:1 for large text) without documenting the exception.
- Defining tokens in multiple competing formats (e.g., both Tailwind config and CSS variables) without a single source of truth.
- Shipping design changes without checking responsive behaviour at declared breakpoints.

## Expected outputs

- design direction document
- design tokens (colors, typography, spacing, radii, shadows)
- component inventory
- responsive breakpoint strategy
- accessibility audit

## Validation

- responsive at 360px, 768px, and 1280px
- accessible (WCAG AA contrast verified)
- original (no unlicensed copied themes)
- tokens documented as reusable variables
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
