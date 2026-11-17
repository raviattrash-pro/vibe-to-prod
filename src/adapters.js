import { spawn } from 'node:child_process';

export const providers = [
  { id:'codex', name:'OpenAI Codex', skillDirectory:'.agents/skills', guidanceFile:'AGENTS.md', mode:'local CLI, explicit approval required' },
  { id:'claude-code', name:'Claude Code', skillDirectory:'.claude/skills', guidanceFile:'CLAUDE.md', mode:'local CLI, explicit approval required; read/write tools only' },
  { id:'antigravity', name:'Google Antigravity', skillDirectory:'.agents/skills', guidanceFile:'AGENTS.md', mode:'local CLI, explicit approval required; accept-edits with terminal sandbox' }
];

export function claudeCodeArgs(){return ['-p','--output-format','stream-json','--verbose','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--allowedTools','Read','Edit','Write','Glob','Grep'];}

export function runClaudeCode({repositoryPath,prompt,command='claude',timeoutMs=900_000,onEvent=()=>{}}){
  return new Promise((resolve,reject)=>{
    const args=claudeCodeArgs();const env={};for(const key of ['PATH','Path','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','CLAUDE_CONFIG_DIR'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(command,args,{cwd:repositoryPath,env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';let overflow=false;
    const append=(target,chunk,type)=>{const text=chunk.toString();onEvent({type,text:text.slice(0,4000),at:new Date().toISOString()});const next=target+text;if(next.length>300_000){overflow=true;child.kill();return next.slice(-300_000);}return next;};
    child.stdout.on('data',chunk=>{stdout=append(stdout,chunk,'stdout')});child.stderr.on('data',chunk=>{stderr=append(stderr,chunk,'stderr')});
    const timer=setTimeout(()=>{child.kill();reject(Object.assign(new Error('Claude Code run exceeded the 15 minute limit.'),{status:504}));},timeoutMs);
    child.on('error',err=>{clearTimeout(timer);reject(err.code==='ENOENT'?Object.assign(new Error('Claude Code CLI was not found. Install it or add it to PATH.'),{status:501}):err)});
    child.on('close',code=>{clearTimeout(timer);if(overflow)return reject(Object.assign(new Error('Claude Code output exceeded the 300 KB limit.'),{status:413}));resolve({status:code===0?'completed':'failed',exitCode:code,output:stdout.slice(-200_000),error:stderr.slice(-20_000)});});
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
}

export function antigravityArgs(prompt){return ['-p',prompt,'--output-format','stream-json','--mode=accept-edits','--sandbox','--print-timeout','15m'];}

export function runAntigravity({repositoryPath,prompt,command='agy',timeoutMs=900_000,onEvent=()=>{}}){
  return new Promise((resolve,reject)=>{
    const env={};for(const key of ['PATH','Path','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','GEMINI_CLI_HOME'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(command,antigravityArgs(prompt),{cwd:repositoryPath,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';let pending='';let overflow=false;let response='';
    const semantic=(event)=>{if(event.type==='step_update'){const step=event.step||event;const details=[step.step_type,step.state,step.tool_name,step.text_delta].filter(Boolean).join(' · ');if(details)onEvent({type:`antigravity.${step.step_type||'step'}`,text:details.slice(0,4000),at:new Date().toISOString()});if(step.step_type==='agent_response'&&step.text_delta)response=(response+step.text_delta).slice(-200_000);}else if(event.type==='result'){if(typeof event.response==='string')response=event.response.slice(-200_000);onEvent({type:'antigravity.result',text:`status=${event.status||'unknown'}${event.error?` · ${event.error}`:''}`,at:new Date().toISOString()});}};
    const consume=(chunk)=>{pending+=chunk.toString();const lines=pending.split(/\r?\n/);pending=lines.pop()||'';for(const line of lines){if(!line.trim())continue;try{semantic(JSON.parse(line));}catch{onEvent({type:'antigravity.output',text:line.slice(0,4000),at:new Date().toISOString()});}}};
    child.stdout.on('data',chunk=>{const text=chunk.toString();stdout=(stdout+text).slice(-300_000);if(stdout.length>=300_000){overflow=true;child.kill();}consume(chunk);});
    child.stderr.on('data',chunk=>{const text=chunk.toString();stderr=(stderr+text).slice(-20_000);onEvent({type:'stderr',text:text.slice(0,4000),at:new Date().toISOString()});});
    const timer=setTimeout(()=>{child.kill();reject(Object.assign(new Error('Antigravity run exceeded the 15 minute limit.'),{status:504}));},timeoutMs);
    child.on('error',err=>{clearTimeout(timer);reject(err.code==='ENOENT'?Object.assign(new Error('Antigravity CLI (agy) was not found. Install it or add it to PATH.'),{status:501}):err)});
    child.on('close',code=>{clearTimeout(timer);if(pending.trim()){try{semantic(JSON.parse(pending));}catch{onEvent({type:'antigravity.output',text:pending.slice(0,4000),at:new Date().toISOString()});}}if(overflow)return reject(Object.assign(new Error('Antigravity output exceeded the 300 KB limit.'),{status:413}));resolve({status:code===0?'completed':'failed',exitCode:code,output:(response||stdout).slice(-200_000),error:stderr.slice(-20_000)});});
  });
}

export function runCodex({ repositoryPath, prompt, command='codex', timeoutMs=900_000, onEvent=()=>{} }) {
  return new Promise((resolve,reject)=>{
    const args=['exec','--sandbox','workspace-write','--approve-for-me','--cd',repositoryPath,'--ephemeral','-'];
    const env={};for(const key of ['PATH','Path','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','CODEX_HOME'])if(process.env[key])env[key]=process.env[key];
    const child=spawn(command,args,{cwd:repositoryPath,env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';let overflow=false;
    const append=(target,chunk)=>{const next=target+chunk.toString();if(next.length>300_000){overflow=true;child.kill();return next.slice(-300_000);}return next;};
    child.stdout.on('data',chunk=>{stdout=append(stdout,chunk);onEvent({type:'stdout',text:chunk.toString().slice(0,4000),at:new Date().toISOString()})});child.stderr.on('data',chunk=>{stderr=append(stderr,chunk);onEvent({type:'stderr',text:chunk.toString().slice(0,4000),at:new Date().toISOString()})});
    const timer=setTimeout(()=>{child.kill();reject(Object.assign(new Error('Codex run exceeded the 15 minute limit.'),{status:504}));},timeoutMs);
    child.on('error',err=>{clearTimeout(timer);reject(err.code==='ENOENT'?Object.assign(new Error('Codex CLI was not found. Install or add it to PATH.'),{status:501}):err)});
    child.on('close',code=>{clearTimeout(timer);if(overflow)return reject(Object.assign(new Error('Codex output exceeded the 300 KB limit.'),{status:413}));resolve({status:code===0?'completed':'failed',exitCode:code,output:stdout.slice(-200_000),error:stderr.slice(-20_000)});});
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
}

export function createTaskPrompt(project, workflow, task) {
  if(!task) throw Object.assign(new Error('Workflow task not found.'),{status:404});
  if(workflow.stale)throw Object.assign(new Error('Workflow context has changed. Create a fresh workflow before handing off this task.'),{status:409});
  const unfinished=task.dependsOn.filter(id=>workflow.tasks.find(t=>t.id===id)?.status!=='completed');
  if(unfinished.length)throw Object.assign(new Error(`This task is not ready. Complete dependencies first: ${unfinished.join(', ')}.`),{status:409});
  const decisions=(project.decisions||[]).slice(0,5).map(d=>`- ${d.title}: ${d.rationale}`).join('\n')||'No recorded decisions.';
  return `# AgencyOS workflow task\n\nProject: ${project.name}\nProfile: ${project.type}\nPriority: ${project.priority||'normal'}\nObjective: ${project.objective||'Not specified'}\nRequirements:\n${project.requirements||'Not specified'}\nTechnology preferences: ${project.techPreferences||'No preference recorded'}\nRepository: ${project.repositoryPath||'Use the currently open project repository'}\n\n## Existing decisions\n${decisions}\n\n## Task\n${task.title}\n\n## Assigned capability\nAgent role: ${task.agent}\nSkill: ${task.skill} (read the matching SKILL.md from the active workspace skill directory if available)\nRouting evidence: ${(task.routingEvidence||[]).map(item=>`${item.trigger} matched “${item.matched}” in the project context`).join('; ')||'Baseline workflow task'}\n\n## Instructions\n- Inspect the existing repository and its local instructions before editing.\n- Complete this task in the repository; do not merely describe a plan.\n- Follow the skill's activation guidance, inputs, procedure, anti-patterns, and validation criteria.\n- Run only checks relevant to the change and report exact commands and actual outcomes.\n- Capture concrete evidence: changed files, command output, measurements, or review findings.\n- Do not claim checks ran when they did not. Keep unsupported claims marked unverified.\n- Ask before destructive database or production changes, credential changes, or other high-impact operations.\n\n## Completion response\nSummarize files changed, decisions, checks run with results, evidence references, and remaining limitations. Do not mark the AgencyOS task complete unless you can provide that evidence.`;
}
