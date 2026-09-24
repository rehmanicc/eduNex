const base=process.env.API_BASE_URL||'http://localhost:5000';
(async()=>{
  const checks=[
    ['/api/system/health',200],
    ['/api/system/ready',200],
    ['/api/tenant/resolve?host=localhost:5173',200]
  ];
  let failed=0;
  for(const [path,expected] of checks){
    try{
      const r=await fetch(base+path);
      console.log(`${r.status===expected?'PASS':'FAIL'} ${r.status} ${path}`);
      if(r.status!==expected)failed++;
    }catch(e){console.log(`FAIL ${path}: ${e.message}`);failed++;}
  }
  process.exit(failed?1:0);
})();
