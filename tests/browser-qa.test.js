import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverRoutes, detectCriticalJourneys, runBrowserQaSuite } from '../src/qa/browser.js';

test('discoverRoutes extracts relative hrefs and router declarations', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agencyos-qa-routes-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, 'index.html'), `
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
      <a href="https://external.com">External</a>
    </nav>
  `);

  await writeFile(path.join(dir, 'router.js'), `
    const routes = [
      { path: '/profile' },
      { route: '/billing' }
    ];
  `);

  const routes = await discoverRoutes(dir);
  assert.ok(routes.includes('/'));
  assert.ok(routes.includes('/dashboard'));
  assert.ok(routes.includes('/settings'));
  assert.ok(routes.includes('/profile'));
  assert.ok(routes.includes('/billing'));
  assert.ok(!routes.includes('https://external.com')); // external filtered
});

test('detectCriticalJourneys extracts form submissions and interactive controls', () => {
  const html = `
    <form action="/api/login" method="post">
      <input type="text" name="username" />
      <input type="password" name="password" />
      <button type="submit">Sign In</button>
    </form>
    <button id="theme-toggle">Dark Mode</button>
  `;

  const journeys = detectCriticalJourneys(html);
  assert.equal(journeys.length, 2);

  const formJourney = journeys.find(j => j.type === 'form_submission');
  assert.ok(formJourney);
  assert.equal(formJourney.target, '/api/login');
  assert.equal(formJourney.method, 'POST');
  assert.equal(formJourney.inputs.length, 2);
  assert.ok(formJourney.steps.length >= 4);

  const btnJourney = journeys.find(j => j.type === 'button_interaction');
  assert.ok(btnJourney);
});

test('runBrowserQaSuite produces responsive artifacts, captures a11y issues, and generates reproducible bug reports', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agencyos-qa-run-'));
  const outDir = path.join(dir, 'output');
  t.after(async () => rm(dir, { recursive: true, force: true }));

  // HTML missing lang attribute and missing image alt
  await writeFile(path.join(dir, 'index.html'), `
    <html>
      <head><title>Test App</title></head>
      <body>
        <img src="logo.png">
        <a href="/home">Home</a>
      </body>
    </html>
  `);

  const report = await runBrowserQaSuite({
    repositoryPath: dir,
    outputDirectory: outDir
  });

  assert.ok(report.runId);
  assert.ok(report.routesDiscovered.includes('/'));
  assert.equal(report.artifacts.length, 3); // mobile, tablet, desktop
  assert.ok(report.accessibilityIssues.length >= 2);
  assert.equal(report.bugReports.length, 1);

  const bug = report.bugReports[0];
  assert.equal(bug.severity, 'high');
  assert.ok(bug.stepsToReproduce.length > 0);
  assert.match(bug.expected, /WCAG/);

  // Verify report file was written to disk
  const savedReport = JSON.parse(await readFile(path.join(outDir, report.runId, 'report.json'), 'utf8'));
  assert.equal(savedReport.runId, report.runId);
});

test('runBrowserQaSuite supports custom Playwright runner when provided', async t => {
  const customRunner = async ({ viewports }) => {
    return {
      customEngineTested: true,
      routesDiscovered: ['/custom'],
      criticalJourneys: [],
      bugReports: [],
      artifacts: viewports.map(v => ({ viewport: v.name }))
    };
  };

  const report = await runBrowserQaSuite({
    repositoryPath: '/mock',
    customRunner
  });

  assert.equal(report.engine, 'playwright');
  assert.equal(report.customEngineTested, true);
});
