const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?walk(p):[p];
  });
}
const files=walk(root).filter(x=>x.endsWith('.js'));
const findings=[];
for(const f of files){
  const s=fs.readFileSync(f,'utf8');
  if(/find(ById|One)?\([^)]*req\.(params|query)\.collegeId/.test(s))
    findings.push({file:path.relative(root,f),risk:'Client-supplied collegeId used in query'});
}
console.log(JSON.stringify({filesChecked:files.length,findings},null,2));
process.exit(findings.length?2:0);
