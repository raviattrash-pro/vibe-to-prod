import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PostgresStore } from '../src/postgres-store.js';

const source=path.resolve(process.env.AGENCYOS_DATA_FILE||'data/projects.json');const store=new PostgresStore();
try{const projects=JSON.parse(await readFile(source,'utf8'));if(!Array.isArray(projects))throw new Error('JSON store must contain a project array.');if((await store.all()).length)throw new Error('PostgreSQL already has projects. Import is refused to prevent overwriting existing records.');await store.save(projects);process.stdout.write(`Imported ${projects.length} project(s) from ${source}.\n`)}finally{await store.close();}
