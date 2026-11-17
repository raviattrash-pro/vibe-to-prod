import { createHash } from 'node:crypto';

export const MAX_ACTIVITY_EVENTS=500;

export function normalizeActivity(project){
  const events=Array.isArray(project.activity)?project.activity:[];
  project.activity=events.map(event=>({...event,id:event.id||createHash('sha256').update(`${event.at||''}\0${event.text||''}`).digest('hex').slice(0,24)})).slice(0,MAX_ACTIVITY_EVENTS);
  return project.activity;
}

export function pageActivity(project,{limit=50,offset=0}={}){
  const events=normalizeActivity(project);const safeLimit=Math.min(100,Math.max(1,Number.parseInt(limit,10)||50));const safeOffset=Math.max(0,Number.parseInt(offset,10)||0);
  const items=events.slice(safeOffset,safeOffset+safeLimit);
  return {events:items,nextOffset:safeOffset+items.length,hasMore:safeOffset+items.length<events.length,total:events.length};
}
