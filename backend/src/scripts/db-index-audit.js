require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function stable(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  return JSON.stringify(Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {}));
}
function keySig(key) { return Object.entries(key || {}).map(([k,v]) => `${k}:${v}`).join('|'); }
function isPrefix(a,b) {
  const aa=Object.entries(a||{}), bb=Object.entries(b||{});
  return aa.length < bb.length && aa.every((x,i)=>bb[i] && x[0]===bb[i][0] && x[1]===bb[i][1]);
}
function loadModels() {
  const dir=path.resolve(__dirname,'../models');
  for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))) {
    try { require(path.join(dir,file)); } catch (e) { console.warn(`WARN model load ${file}: ${e.message}`); }
  }
}
async function main(){
  if(!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { autoIndex:false });
  loadModels();
  const db=mongoose.connection.db;
  const collections=await db.listCollections({}, {nameOnly:true}).toArray();
  const report={database:db.databaseName, generatedAt:new Date().toISOString(), collections:[], summary:{collections:0,documents:0,indexes:0,missingModelIndexes:0,staleDatabaseIndexes:0,prefixCandidates:0,unusedIndexes:0}};

  for(const c of collections.sort((a,b)=>a.name.localeCompare(b.name))){
    const col=db.collection(c.name);
    let count=0,indexes=[],stats=[];
    try { count=await col.estimatedDocumentCount(); } catch {}
    try { indexes=await col.indexes(); } catch {}
    try { stats=await col.aggregate([{$indexStats:{}}]).toArray(); } catch {}
    const usage=new Map(stats.map(s=>[s.name,Number(s.accesses?.ops||0)]));
    const model=Object.values(mongoose.models).find(m=>m.collection?.name===c.name);
    const expected=model ? model.schema.indexes().map(([key,options])=>({key,options})) : [];
    const dbSigs=new Set(indexes.filter(i=>i.name!=='_id_').map(i=>keySig(i.key)));
    const modelSigs=new Set(expected.map(i=>keySig(i.key)));
    const missing=expected.filter(i=>!dbSigs.has(keySig(i.key))).map(i=>({key:i.key,options:i.options}));
    const stale=indexes.filter(i=>i.name!=='_id_' && !modelSigs.has(keySig(i.key))).map(i=>({name:i.name,key:i.key}));
    const prefix=[];
    for(let i=0;i<indexes.length;i++) for(let j=0;j<indexes.length;j++) if(i!==j && indexes[i].name!=='_id_' && indexes[j].name!=='_id_' && isPrefix(indexes[i].key,indexes[j].key)) prefix.push({short:indexes[i].name,shortKey:indexes[i].key,long:indexes[j].name,longKey:indexes[j].key});
    const unused=indexes.filter(i=>i.name!=='_id_' && usage.has(i.name) && usage.get(i.name)===0).map(i=>({name:i.name,key:i.key}));
    report.collections.push({name:c.name,documents:count,indexCount:indexes.length,missingModelIndexes:missing,staleDatabaseIndexes:stale,prefixCandidates:prefix,unusedSinceMongoStart:unused});
    report.summary.documents+=count; report.summary.indexes+=indexes.length; report.summary.missingModelIndexes+=missing.length; report.summary.staleDatabaseIndexes+=stale.length; report.summary.prefixCandidates+=prefix.length; report.summary.unusedIndexes+=unused.length;
  }
  report.summary.collections=report.collections.length;
  console.log(JSON.stringify(report,null,2));
  console.error('\nNOTE: prefix/unused/stale indexes are review candidates only. This audit never creates or drops indexes. $indexStats resets when MongoDB restarts.');
  await mongoose.disconnect();
}
main().catch(async e=>{console.error(e.stack||e); try{await mongoose.disconnect();}catch{} process.exit(1);});
