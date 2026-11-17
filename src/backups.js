import { randomUUID } from 'node:crypto';
import { createHash, timingSafeEqual } from 'node:crypto';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max,fallback='')=>String(value??fallback).trim().slice(0,max);
const list=(value,max)=>Array.isArray(value)?value.filter(object).slice(-max).map(item=>structuredClone(item)):[];

function digest(backup){const payload={format:backup.format,schemaVersion:backup.schemaVersion,exportedAt:backup.exportedAt,project:backup.project};return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}

export function createProjectBackup(project){const backup={format:'agencyos-project-backup',schemaVersion:2,exportedAt:new Date().toISOString(),project};backup.checksum={algorithm:'sha256',value:digest(backup)};return backup;}

export function restoreProjectBackup(backup){
  if(!object(backup)||backup.format!=='agencyos-project-backup'||![1,2].includes(backup.schemaVersion)||!object(backup.project))throw Object.assign(new Error('Unsupported or invalid AgencyOS project backup.'),{status:400});
  if(backup.schemaVersion===2){const expected=backup.checksum?.value;if(backup.checksum?.algorithm!=='sha256'||typeof expected!=='string'||!/^[a-f\d]{64}$/i.test(expected))throw Object.assign(new Error('Backup checksum is missing or invalid.'),{status:400});const actual=digest(backup);if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))throw Object.assign(new Error('Backup checksum verification failed; the file may be damaged or edited.'),{status:400});}
  const source=backup.project;const name=string(source.name,100);if(!name)throw Object.assign(new Error('Backup project must include a name.'),{status:400});
  const now=new Date().toISOString();const allowedPriority=['low','normal','high','urgent'];const allowedStatus=['active','paused','completed'];
  const restored={id:randomUUID(),name,type:string(source.type,50,'Custom Application'),objective:string(source.objective,1000),requirements:string(source.requirements,5000),techPreferences:string(source.techPreferences,1000),priority:allowedPriority.includes(source.priority)?source.priority:'normal',repositoryPath:string(source.repositoryPath,1000),status:allowedStatus.includes(source.status)?source.status:'active',createdAt:string(source.createdAt,40,now),updatedAt:now,restoredAt:now,restoredFrom:string(source.id,100),backupIntegrity:backup.schemaVersion===2?'verified':'legacy-unchecked',checks:list(source.checks,5000),workflows:list(source.workflows,100),decisions:list(source.decisions,1000),agentRuns:list(source.agentRuns,100),remediationPlans:list(source.remediationPlans,200),evaluationHistory:list(source.evaluationHistory,200),visualReviews:list(source.visualReviews,20),changeProposals:list(source.changeProposals,100),activity:list(source.activity,500)};
  for(const run of restored.agentRuns)if(run.status==='running'||run.status==='orphaned'){run.status='orphaned';run.serverInstanceId=undefined;run.completedAt=now;run.error='Imported from backup; the original process outcome cannot be verified. Inspect repository changes before retrying.';run.events??=[];run.events.push({type:'run.orphaned',text:run.error,at:now});}
  return restored;
}
