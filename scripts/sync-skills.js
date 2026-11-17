import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(await readFile(path.join(root,'skills/registry.json'),'utf8'));
const defaultProcedure=[
 'Inspect the existing project and user constraints before proposing changes.',
 'Separate repository observations from assumptions and missing information.',
 'Apply the smallest maintainable changes that meet the requested outcome.',
 'Use relevant tools and report only checks, measurements, and outcomes supported by direct evidence.',
 'Record decisions, limitations, and evidence so the work can be reviewed.'
];
const defaultAvoid=[
 'Replacing suitable existing work without an audit.',
 'Inventing test results, measurements, evidence, or completion.',
 'Introducing complexity without a demonstrated requirement.',
 'Making high-impact or destructive changes without explicit approval.'
];

// Helper: ensure a string ends with exactly one period.
const ensureTrailingPeriod = (str) => str.replace(/\.+$/, '') + '.';

for(const skill of registry){
 const text=skill.id==='agencyos'?await readFile(path.join(root,'SKILL.md'),'utf8'):`---
name: ${skill.id}
description: ${ensureTrailingPeriod(skill.description||skill.activation)}
---

# ${skill.name}

## Purpose

${skill.purpose || skill.name+' guides a repeatable engineering workflow for AgencyOS.'}

## Activate when

${ensureTrailingPeriod(skill.activation)} Select this capability only when it applies to the request.

## Inputs

${skill.inputs.map(x=>`- ${x}`).join('\n')}

## Procedure

${(skill.procedure||defaultProcedure).map((step,index)=>`${index+1}. ${step}`).join('\n')}

## Avoid

${(skill.avoid||defaultAvoid).map(item=>`- ${item}`).join('\n')}

## Expected outputs

${skill.outputs.map(x=>`- ${x}`).join('\n')}

## Validation

${skill.validation.map(x=>`- ${x}`).join('\n')}
- Report checks that were not run as unverified.
- Provide evidence references and actionable remediation for failures.
`;
 for(const base of ['.agents/skills','.claude/skills']){const dir=path.join(root,base,skill.id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'SKILL.md'),text,'utf8');}
}
console.log(`Synced ${registry.length} skills to .agents/skills and .claude/skills.`);
