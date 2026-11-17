---
name: pwa-mobile-app
description: Make a responsive web app installable from a phone browser as a Progressive Web App; use native packaging only when APK or IPA output is explicitly requested.
---

# PWA Mobile Installability

## Purpose

Make an existing responsive web application installable on Android and iOS as a Progressive Web App using its own origin, manifest, icons, and safe service worker behavior.

## Activate when

When the user wants a web app installable from a phone browser or asks to add a home-screen app experience; use native packaging skills only when a store APK/IPA is explicitly required. Select this capability only when it applies to the request.

## Inputs

- existing app framework and routes
- deployment origin and HTTPS availability
- offline requirements and authenticated data behavior
- brand assets and app name

## Procedure

1. Inspect the app entry routes, responsive behavior, existing manifest, icons, service worker, authentication, and deployment origin before editing.
2. Add or update one manifest with a stable id, correct start_url and scope, standalone display, theme colors, and square 192px and 512px icons using the app's existing brand.
3. Add an in-app install button that captures beforeinstallprompt where supported, handles appinstalled, and gives Safari users clear Share → Add to Home Screen instructions.
4. Choose cache rules from actual data sensitivity: never cache authenticated API responses or user records by default; separate the offline shell from network-required data and document what works offline.
5. Register a scoped service worker only on secure contexts; use versioned caches and remove old caches during activation. Keep update behavior recoverable and avoid broad cache-all strategies.
6. Test manifest responses, icon dimensions, service-worker scope, install prompt behavior, iOS home-screen guidance, offline shell behavior, and API failure behavior on representative devices or emulators.

## Avoid

- Claiming that a PWA is an APK or IPA or that it has been published to an app store.
- Caching authenticated API responses, credentials, or project data without a reviewed privacy and synchronization design.
- Adding a service worker with broad cache-first handling for API or HTML responses that can become stale.
- Claiming phone installation from a remote device when the app is served only on loopback or an insecure origin.

## Expected outputs

- installability audit
- manifest and platform icons
- service-worker caching policy
- browser install control and iOS instructions
- device validation checklist

## Validation

- manifest declares 192px and 512px install icons and correct application scope
- service worker is served from the intended scope over HTTPS or loopback
- install button behavior tested on supported Android browsers; iOS instructions tested in Safari
- offline claims match observed behavior and authenticated APIs are not cached
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
