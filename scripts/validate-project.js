import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jsRoots=['src','public','scripts','tests'];
const syntaxFiles=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())await walk(target);else if(entry.isFile()&&target.endsWith('.js'))syntaxFiles.push(target);}}
for(const directory of jsRoots)await walk(path.join(root,directory));
for(const file of syntaxFiles){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr||result.stdout);process.exit(result.status||1);}}

const parse=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const [agents,skills,quality,coverage,requirements,routing,manifest]=await Promise.all(['agents/registry.json','skills/registry.json','references/quality-model.json','references/evaluator-coverage.json','references/quality-requirements.json','references/workflow-routing.json','public/manifest.webmanifest'].map(parse));
const unique=(items,label)=>{const ids=items.map(item=>item.id);if(new Set(ids).size!==ids.length)throw new Error(`${label} contains duplicate ids.`);};
unique(agents,'Agent registry');unique(skills,'Skill registry');unique(quality.categories,'Quality model');unique(coverage.evaluators,'Evaluator registry');
const categories=new Set(quality.categories.map(category=>category.id));
for(const evaluator of coverage.evaluators){if(!categories.has(evaluator.category))throw new Error(`Evaluator ${evaluator.id} references unknown category ${evaluator.category}.`);if(!Array.isArray(evaluator.controls)||!evaluator.controls.length||evaluator.controls.some(control=>typeof control!=='string'||!control.trim()))throw new Error(`Evaluator ${evaluator.id} must declare its measurable controls.`);if(!Array.isArray(evaluator.limits)||!evaluator.limits.length||evaluator.limits.some(limit=>typeof limit!=='string'||!limit.trim()))throw new Error(`Evaluator ${evaluator.id} must declare its coverage limits.`);}
if(!Number.isInteger(requirements.version)||!requirements.profiles||!requirements.profiles['Custom Application'])throw new Error('Quality requirements must declare a version and fallback profile.');
for(const [profile,controls] of Object.entries(requirements.profiles)){unique(controls,`Quality requirements for ${profile}`);for(const control of controls)if(!control.id||!control.title||!categories.has(control.category)||!coverage.evaluators.some(evaluator=>evaluator.id===control.evaluatorId&&evaluator.category===control.category))throw new Error(`Quality requirement in ${profile} references missing evaluator/category metadata.`);}
unique(routing.rules,'Workflow routing registry');const agentIds=new Set(agents.map(agent=>agent.id));const skillIds=new Set(skills.map(skill=>skill.id));const taskIds=new Set(['foundation','design','implementation','security','seo','qa','delivery',...routing.rules.map(rule=>rule.id)]);
for(const rule of routing.rules){if(!agentIds.has(rule.agent))throw new Error(`Workflow route ${rule.id} references unknown agent ${rule.agent}.`);if(!skillIds.has(rule.skill))throw new Error(`Workflow route ${rule.id} references unknown skill ${rule.skill}.`);for(const dependency of rule.dependsOn)if(!taskIds.has(dependency))throw new Error(`Workflow route ${rule.id} references unknown dependency ${dependency}.`);for(const trigger of rule.triggers)new RegExp(trigger.pattern,'i');}
for(const base of ['.agents/skills','.claude/skills'])for(const skill of skills){const content=await readFile(path.join(root,base,skill.id,'SKILL.md'),'utf8');if(!content.trim())throw new Error(`Generated skill is empty: ${base}/${skill.id}`);}
for(const skill of skills){const codex=await readFile(path.join(root,'.agents/skills',skill.id,'SKILL.md'),'utf8');const claude=await readFile(path.join(root,'.claude/skills',skill.id,'SKILL.md'),'utf8');if(codex!==claude)throw new Error(`Generated skill copies differ for ${skill.id}.`);}
if(!manifest.name||manifest.display!=='standalone'||!manifest.icons.some(icon=>icon.sizes==='192x192')||!manifest.icons.some(icon=>icon.sizes==='512x512'))throw new Error('PWA manifest is missing its name, standalone display, or required phone icon sizes.');
for(const icon of manifest.icons){const image=await readFile(path.join(root,'public',icon.src.replace(/^\//,'')));if(image.toString('ascii',1,4)!=='PNG'||image.readUInt32BE(16)!==Number.parseInt(icon.sizes.split('x')[0],10))throw new Error(`PWA icon does not match its manifest size: ${icon.src}`);}
const index=await readFile(path.join(root,'public/index.html'),'utf8');if(!index.includes('rel="manifest"')||!index.includes('id="install-app"'))throw new Error('PWA manifest link or install button is missing from Studio.');
console.log(`Validated ${syntaxFiles.length} JavaScript files, ${agents.length} agents, ${skills.length} generated skills, ${quality.categories.length} quality categories, ${coverage.evaluators.length} evaluators, ${routing.rules.length} workflow routes, and the PWA manifest/icons.`);
