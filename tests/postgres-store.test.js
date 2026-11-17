import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/postgres-store.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('PostgreSQL store applies the checked-in migration and releases transaction clients',async()=>{
 const calls=[];let records=[],migrationApplied=false;const client={async query(sql,values=[]){calls.push(sql.trim().split(/\s+/).slice(0,4).join(' '));if(sql.startsWith('SELECT version'))return{rows:[]};if(sql.includes('CREATE TABLE IF NOT EXISTS agencyos_projects'))migrationApplied=true;if(sql.startsWith('SELECT data'))return{rows:records.map(data=>({data}))};if(sql.startsWith('DELETE FROM agencyos_projects'))records=[];if(sql.startsWith('INSERT INTO agencyos_projects'))records.push(JSON.parse(values[1]));return{rows:[]}},release(){calls.push('RELEASE')}};const pool={on(){},async query(sql){calls.push(sql.trim().split(/\s+/).slice(0,4).join(' '));if(sql.startsWith('SELECT data'))return{rows:records.map(data=>({data}))};return{rows:[]}},async connect(){return client},async end(){calls.push('END')}};const store=new PostgresStore({pool});await store.ready;assert.equal(migrationApplied,true);await store.update(items=>items.push({id:'one',updatedAt:new Date().toISOString(),name:'First'}));assert.equal((await store.all())[0].name,'First');const migration=await readFile(path.resolve('migrations/001-projects-jsonb.sql'),'utf8');assert.match(migration,/CREATE TABLE IF NOT EXISTS agencyos_projects/);assert.ok(calls.includes('SELECT pg_advisory_xact_lock(736142903)'));assert.ok(calls.includes('COMMIT'));assert.ok(calls.filter(call=>call==='RELEASE').length>=2);await store.close();assert.ok(calls.includes('END'));
});
