import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export class Store {
  constructor(file = process.env.AGENCYOS_DATA_FILE || path.resolve('data/projects.json')) { this.file = file; this.queue=Promise.resolve(); }
  async all() {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  }
  async write(items) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(items, null, 2), 'utf8');
      for(let attempt=0;;attempt++){
        try{await rename(tmp,this.file);break;}
        catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=5)throw error;await new Promise(resolve=>setTimeout(resolve,10*2**attempt));}
      }
    } finally { await rm(tmp,{force:true}); }
  }
  save(items) {
    const operation=this.queue.then(()=>this.write(items));
    this.queue=operation.catch(()=>{});
    return operation;
  }
  update(mutator) {
    const operation=this.queue.then(async()=>{const items=await this.all();const result=await mutator(items);await this.write(items);return result;});
    this.queue=operation.catch(()=>{});
    return operation;
  }
}
