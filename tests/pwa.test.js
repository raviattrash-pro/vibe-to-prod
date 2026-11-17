import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Studio PWA manifest includes phone install icon sizes and scoped standalone display',async()=>{
 const manifest=JSON.parse(await readFile(path.join(root,'public/manifest.webmanifest'),'utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose.includes('maskable')));
 for(const size of [192,512]){const png=await readFile(path.join(root,`public/icons/agencyos-${size}.png`));assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const html=await readFile(path.join(root,'public/index.html'),'utf8');assert.match(html,/rel="manifest"/);assert.match(html,/id="install-app"/);const app=await readFile(path.join(root,'public/app.js'),'utf8');assert.match(app,/beforeinstallprompt/);assert.match(app,/Add to Home Screen/);
 const sw=await readFile(path.join(root,'public/service-worker.js'),'utf8');assert.match(sw,/startsWith\('\/api\/'\)/);assert.match(sw,/cache-control/);
});
