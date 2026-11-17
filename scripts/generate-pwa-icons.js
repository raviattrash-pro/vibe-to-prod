import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'public','icons');
await mkdir(directory,{recursive:true});
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
function segmentDistance(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
function makeIcon(size){const rowBytes=size*4;const raw=Buffer.alloc((rowBytes+1)*size);const thickness=size*.075;for(let y=0;y<size;y++){const offset=y*(rowBytes+1);raw[offset]=0;for(let x=0;x<size;x++){const px=(x+.5)/size,py=(y+.5)/size;const onA=segmentDistance(px,py,.29,.75,.5,.25)<thickness/2||segmentDistance(px,py,.5,.25,.71,.75)<thickness/2||segmentDistance(px,py,.39,.58,.61,.58)<thickness/2;const color=onA?[205,250,222]:[10,26,20];const i=offset+1+x*4;raw[i]=color[0];raw[i+1]=color[1];raw[i+2]=color[2];raw[i+3]=255;}}const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);return png;}
for(const size of [192,512])await writeFile(path.join(directory,`agencyos-${size}.png`),makeIcon(size));
console.log('Generated 192px and 512px AgencyOS PWA icons.');
