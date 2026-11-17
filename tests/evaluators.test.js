import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditDeploymentConfig, auditRenderedPerformance, auditRenderedRepository, auditStaticAccessibility, auditStaticSeo, auditVisualReview, interpretNpmAudit, runNpmAudit, scanForSecrets, runNodeTests } from '../src/evaluators.js';

test('secret scan finds a high-confidence private key marker and skips dependency folders', async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-scan-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'node_modules'),{recursive:true});
 await writeFile(path.join(root,'node_modules','vendor.js'),'-----BEGIN PRIVATE KEY-----');
 await writeFile(path.join(root,'.env'),'-----BEGIN RSA PRIVATE KEY-----\n');
 const result=await scanForSecrets(root);assert.equal(result.status,'fail');assert.equal(result.findings.length,1);assert.equal(result.findings[0].file,'.env');
});

test('Node evaluator runs local tests and records their real exit result', async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-tests-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'sample.test.js'),"import test from 'node:test'; import assert from 'node:assert/strict'; test('example',()=>assert.equal(2+2,4));\n");
 const result=await runNodeTests(root);assert.equal(result.status,'pass');assert.equal(result.exitCode,0);assert.match(result.evidence,/Ran .* --test/);
});

test('static SEO and accessibility evaluators separate pass, fail, and unsupported results', async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-html-'));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal((await auditStaticSeo(root)).status,'unverified');assert.equal((await auditStaticAccessibility(root)).status,'unverified');
 const good='<!doctype html><html lang="en"><head><title>Home</title><meta name="description" content="Public home"><link rel="canonical" href="https://example.test/"></head><body><img src="x.png" alt=""><button aria-label="Open menu"></button><a href="/about">About</a></body></html>';
 await writeFile(path.join(root,'index.html'),good);assert.equal((await auditStaticSeo(root)).status,'pass');assert.equal((await auditStaticAccessibility(root)).status,'pass');
 await writeFile(path.join(root,'index.html'),'<html><body><img src="x"><button><svg></svg></button><a href="/"><svg></svg></a></body></html>');
 const seo=await auditStaticSeo(root);const a11y=await auditStaticAccessibility(root);assert.equal(seo.status,'fail');assert.equal(seo.findings.length,3);assert.equal(a11y.status,'fail');assert.equal(a11y.findings.length,4);
 await writeFile(path.join(root,'index.html'),'<html lang="en"><head><meta name="robots" content="noindex,nofollow"></head><body>Private dashboard</body></html>');
 const privateSeo=await auditStaticSeo(root);assert.equal(privateSeo.status,'na');assert.match(privateSeo.evidence,/authorization/);
 await writeFile(path.join(root,'index.html'),'<html lang="en"><body><label for="email">Email</label><input id="email" type="email"><select aria-label="Language"><option>English</option></select></body></html>');const labelled=await auditStaticAccessibility(root);assert.equal(labelled.status,'pass');
 await writeFile(path.join(root,'index.html'),'<html lang="en"><body><input type="email"></body></html>');const unlabelled=await auditStaticAccessibility(root);assert.equal(unlabelled.status,'fail');assert.equal(unlabelled.findings[0].check,'form-label');
});

test('deployment configuration audit records bounded Docker/Kubernetes baselines and unsupported providers',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-deploy-'));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal((await auditDeploymentConfig(root)).status,'unverified');
 await writeFile(path.join(root,'Dockerfile'),'FROM node:22-alpine\nUSER node\nHEALTHCHECK CMD node health.js\n');const secure=await auditDeploymentConfig(root);assert.equal(secure.status,'pass');assert.equal(secure.files.length,1);
 await writeFile(path.join(root,'Dockerfile'),'FROM node:latest\n');const weak=await auditDeploymentConfig(root);assert.equal(weak.status,'fail');assert.ok(weak.findings.some(item=>item.control==='non-root-user'));assert.ok(weak.findings.some(item=>item.control==='base-image-pin'));
 await rm(path.join(root,'Dockerfile'));await writeFile(path.join(root,'deployment.yaml'),'apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      securityContext:\n        runAsNonRoot: true\n      containers:\n      - name: app\n        securityContext:\n          allowPrivilegeEscalation: false\n        resources:\n          limits:\n            memory: 256Mi\n');assert.equal((await auditDeploymentConfig(root)).status,'pass');
 await rm(path.join(root,'deployment.yaml'));await writeFile(path.join(root,'vercel.json'),'{}');const managed=await auditDeploymentConfig(root);assert.equal(managed.status,'unverified');assert.match(managed.evidence,/Not deeply evaluated/);
 await rm(path.join(root,'vercel.json'));await writeFile(path.join(root,'compose.yaml'),'services:\n  web:\n    image: example/web:latest\n    privileged: true\n    network_mode: host\n    pid: host\n    volumes:\n      - /:/host\n');const compose=await auditDeploymentConfig(root);assert.equal(compose.status,'fail');assert.ok(compose.findings.some(item=>item.control==='privileged'));assert.ok(compose.findings.some(item=>item.control==='host-network'));assert.ok(compose.findings.some(item=>item.control==='host-pid'));assert.ok(compose.findings.some(item=>item.control==='host-mount'));assert.ok(compose.findings.some(item=>item.control==='image-pin'));assert.equal(compose.findings.find(item=>item.control==='healthcheck').status,'unverified');
});

test('rendered browser audit evaluates JavaScript-produced metadata and accessible names',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-rendered-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'index.html'),`<!doctype html><html><head><title>Loading</title></head><body><script>document.documentElement.lang='en';document.title='Rendered home';const d=document.createElement('meta');d.name='description';d.content='Rendered description';document.head.append(d);const c=document.createElement('link');c.rel='canonical';c.href='https://example.test/';document.head.append(c);document.body.insertAdjacentHTML('beforeend','<img src="x" alt="Example"><button>Continue</button><a href="/next">Next</a>');</script></body></html>`);
 const result=await auditRenderedRepository(root);if(result.evidence.includes('Chrome was not found')){t.skip('Chrome is unavailable on this runner.');return;}assert.equal(result.seoStatus,'pass',result.evidence);assert.equal(result.accessibilityStatus,'pass',result.evidence);assert.deepEqual(result.seoFindings,[]);assert.deepEqual(result.accessibilityFindings,[]);assert.deepEqual(result.pages,['index.html']);
});

test('rendered performance audit records browser timings and explicit baselines',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-performance-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'index.html'),'<html><head><title>Perf</title></head><body><h1>Measured page</h1></body></html>');
 const result=await auditRenderedPerformance(root);if(result.evidence.includes('Chrome was not found')){t.skip('Chrome is unavailable on this runner.');return;}assert.equal(result.pages.length,1,result.evidence);assert.equal(typeof result.pages[0].metrics.domContentLoadedMs,'number');assert.equal(typeof result.pages[0].metrics.loadMs,'number');assert.match(result.evidence,/DOMContentLoaded ≤3 s/);assert.ok(Array.isArray(result.findings));
});

test('visual review captures bounded valid PNG artifacts for human inspection',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-visual-review-'));const artifacts=path.join(root,'artifacts');t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'index.html'),'<html lang="en"><head><title>Review</title></head><body><h1>Visual capture</h1></body></html>');const result=await auditVisualReview(root,artifacts);if(result.evidence.includes('Chrome was not found')){t.skip('Chrome is unavailable on this runner.');return;}assert.equal(result.status,'pass',result.evidence);assert.equal(result.pages.length,1);const image=await readFile(path.join(artifacts,result.pages[0].filename));assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(result.pages[0].width,1365);assert.equal(result.pages[0].height,900);assert.match(result.evidence,/human visual review/);
});

test('npm audit parser maps vulnerability severity and never calls a missing-lockfile result a pass', async t=>{
 const clean=interpretNpmAudit(JSON.stringify({metadata:{vulnerabilities:{total:0,critical:0,high:0,moderate:0,low:0,info:0}},vulnerabilities:{}}),0);assert.equal(clean.status,'pass');
 const vuln=interpretNpmAudit(JSON.stringify({metadata:{vulnerabilities:{total:1,critical:1,high:0,moderate:0,low:0,info:0}},vulnerabilities:{'sample-package':{severity:'critical',isDirect:true,range:'<1.0.1'}}}),1);assert.equal(vuln.status,'fail');assert.equal(vuln.critical,true);assert.equal(vuln.findings[0].name,'sample-package');
 const root=await mkdtemp(path.join(os.tmpdir(),'agencyos-no-lock-'));t.after(()=>rm(root,{recursive:true,force:true}));const missing=await runNpmAudit(root);assert.equal(missing.status,'unverified');assert.match(missing.evidence,/No package-lock/);
});
