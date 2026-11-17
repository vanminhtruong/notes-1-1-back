// Read-only audit. "No match" means review: NOT evidence safe to delete.
// Does not read device information, secrets or personal data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApiSpec } from '../src/docs/openapi.js';
import 'dotenv/config';
import sqlite3 from 'sqlite3';

const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.dirname(backendRoot.replace(/[\\/]+$/, ''));
const roots = [path.join(workspace, 'Front', 'src'), path.join(workspace, 'admin', 'src')];
const skip = new Set(['node_modules','dist','build','.git','coverage']);
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap((e)=>{
    if(e.isDirectory() && !skip.has(e.name)) return walk(path.join(dir,e.name));
    if(e.isFile() && /\.(js|jsx|ts|tsx|mjs|vue|html)$/.test(e.name)) return [path.join(dir,e.name)];
    return [];
  });
}
const srcFiles = roots.flatMap(walk);
const sources = srcFiles.map((f)=>({ file:path.relative(workspace,f).replaceAll('\\','/'), contents:fs.readFileSync(f,'utf8') }));
const calls=[];
const seen = new Set();
function record(file,method,raw,kind) {
  if(!raw || raw.length>230 || !raw.includes('/')) return;
  let route=raw.trim().replace(/\$\{[^}]+\}/g,':dynamic').replace(/\?.*$/,'');
  const pos=route.indexOf('/api/v1/');
  if(pos>=0) route=route.slice(pos+7);
  route=route.replace(/^\/api\/v1/,'').replace(/\/+$/,'') || '/';
  if(!route.startsWith('/'))return;
  const key=[file,method,route,kind].join('|');
  if(!seen.has(key)) { seen.add(key); calls.push({file,method,path:route,kind}); }
}
for (const s of sources) {
  // HTTP client calls in TS/JS and template strings.
  for(const m of s.contents.matchAll(/\.\s*(get|post|put|patch|delete)\s*\(\s*(["'\x60])([^"'\x60\r\n]{1,230})\2/g)){
    const previous = s.contents.slice(Math.max(0,m.index-70),m.index);
    if(/axios|api\.|client|request|service|instance|http|this\./i.test(previous))record(s.file,m[1],m[3],'http');
  }
  for(const m of s.contents.matchAll(/\bfetch\s*\(\s*(["'\x60])([^"'\x60\r\n]{1,230})\1/g)){
    const method=s.contents.slice(m.index,m.index+260).match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i)?.[1]?.toLowerCase() || '*';
    record(s.file,method,m[2],'fetch');
  }
  for(const m of s.contents.matchAll(/(["'\x60])(\/(?:auth|notes|friends|chat|uploads|groups|settings|blocks|notifications|admin|sessions)\/?[^"'\x60\r\n]{0,190})\1/g)){
    const previous=s.contents.slice(Math.max(0,m.index-90),m.index);
    const method=previous.match(/\.\s*(get|post|put|patch|delete)\s*\(\s*$/)?.[1] || '*';
    record(s.file,method,m[2],'literal');
  }
}
function regexEscape(s){ return s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'); }
function routeRegex(route) {
 return new RegExp('^'+route.split('/').map(s=>/^\{[^}]+\}$/.test(s)?'[^/]+':regexEscape(s)).join('/')+'$');
}
function normalize(route) {return route.replace(/^\/api\/v1/,'')||'/';}
const operations=[];
for(const [url,ops] of Object.entries(openApiSpec.paths)){
  const route=normalize(url), re=routeRegex(route);
  for(const method of Object.keys(ops)){
    const matches=calls.filter(c=>{
      if(c.method!=='*' && c.method!==method)return false;
      if(re.test(c.path))return true;
      if(c.path.includes(':dynamic'))return route.startsWith(c.path.split(':dynamic')[0]);
      // Literal path expression concatenated with JS variable.
      if(c.kind==='literal' && c.path.endsWith('/') && route.startsWith(c.path))return true;
      return false;
    });
    const direct=matches.filter(m=>m.kind!=='literal').map(m=>m.file);
    const literal=matches.filter(m=>m.kind==='literal').map(m=>m.file);
    const segs=route.split('/').filter(p=>p && !p.startsWith('{'));
    const suffix=segs.slice(-2).join('/');
    const mentioned=suffix.length>5?sources.filter(s=>s.contents.includes(suffix)).map(s=>s.file):[];
    const verdict=direct.length?'direct call':literal.length?'URL literal':mentioned.length?'suffix mention':'no static match';
    operations.push({method:method.toUpperCase(),path:url,verdict,matchedFiles:[...new Set([...direct,...literal])].slice(0,10),suffixMentions:mentioned.slice(0,5)});
  }
}
const dbfile=path.resolve(backendRoot,process.env.SQLITE_STORAGE||'data/app.sqlite');
const query=(db,sql)=>new Promise((resolve,reject)=>db.all(sql,(err,rows)=>err?reject(err):resolve(rows)));
const tables=await new Promise((resolve,reject)=>{
  const db=new sqlite3.Database(dbfile,sqlite3.OPEN_READONLY,async(err)=>{
    if(err)return reject(err);
    try{
      const names=await query(db,"SELECT name,type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const result=[];
      for(const item of names){
        const q='"'+item.name.replaceAll('"','""')+'"';
        const columns=await query(db,'PRAGMA table_info('+q+')');
        const foreignKeys=await query(db,'PRAGMA foreign_key_list('+q+')');
        const rows=item.type==='table'?(await query(db,'SELECT COUNT(*) AS n FROM '+q))[0].n:null;
        result.push({table:item.name,kind:item.type,rows,columns:columns.map(c=>({name:c.name,type:c.type,notNull:!!c.notnull,primaryKey:!!c.pk})),foreignKeys:foreignKeys.map(f=>({references:f.table,from:f.from,to:f.to}))});
      }
      db.close(()=>resolve(result));
    }catch(e){db.close(()=>reject(e));}
  });
});
const result={note:'Read-only static analysis; absence of a direct call is NOT proof of an unused endpoint or schema column.',scannedFiles:srcFiles.length,operations,dbTables:tables};
const outdir=path.join(backendRoot,'docs','audits');fs.mkdirSync(outdir,{recursive:true});
fs.writeFileSync(path.join(outdir,'frontend-api-database-audit.json'),JSON.stringify(result,null,2));
const statuses={};for(const op of operations)statuses[op.verdict]=(statuses[op.verdict]||0)+1;
console.log(JSON.stringify({scannedFiles:srcFiles.length,operations:operations.length,statuses,tables:tables.length,emptyTables:tables.filter(t=>t.rows===0).map(t=>t.table),possibleUnused:operations.filter(o=>o.verdict==='no static match').map(o=>o.method+' '+o.path)},null,2));
