import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../migrations');

export class PostgresStore {
  constructor(options={}){this.pool=options.pool||new pg.Pool({connectionString:options.connectionString||process.env.DATABASE_URL,max:options.max||10,connectionTimeoutMillis:options.connectionTimeoutMillis||5000});this.queue=Promise.resolve();this.ready=this.migrate();this.pool.on('error',error=>process.emitWarning(`AgencyOS PostgreSQL idle client error: ${error.message}`));}
  async migrate(){await this.pool.query('CREATE TABLE IF NOT EXISTS agencyos_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');const client=await this.pool.connect();try{await client.query('BEGIN');const {rows}=await client.query('SELECT version FROM agencyos_schema_migrations');const applied=new Set(rows.map(row=>row.version));const migration='001-projects-jsonb';if(!applied.has(migration)){const sql=await readFile(path.join(migrationsDirectory,`${migration}.sql`),'utf8');await client.query(sql);await client.query('INSERT INTO agencyos_schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',[migration]);}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
  async all(){await this.ready;const {rows}=await this.pool.query('SELECT data FROM agencyos_projects ORDER BY updated_at DESC,id');return rows.map(row=>row.data);}
  async persist(client,items){await client.query('DELETE FROM agencyos_projects');for(const project of items)await client.query('INSERT INTO agencyos_projects(id,data,updated_at) VALUES($1,$2::jsonb,COALESCE($3::timestamptz,now())) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at',[project.id,JSON.stringify(project),project.updatedAt||null]);}
  async transaction(mutator){await this.ready;const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(736142903)');const {rows}=await client.query('SELECT data FROM agencyos_projects ORDER BY id FOR UPDATE');const items=rows.map(row=>row.data);const result=await mutator(items);await this.persist(client,items);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
  save(items){const operation=this.queue.then(()=>this.transaction(records=>{records.splice(0,records.length,...items);return true;}));this.queue=operation.catch(()=>{});return operation;}
  write(items){return this.save(items)}
  update(mutator){const operation=this.queue.then(()=>this.transaction(mutator));this.queue=operation.catch(()=>{});return operation;}
  async close(){await this.ready;await this.pool.end();}
}
