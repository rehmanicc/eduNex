function write(level,message,meta={}){
  const row={timestamp:new Date().toISOString(),level,message,...meta};
  const line=JSON.stringify(row);
  if(level==='error')console.error(line);
  else if(level==='warn')console.warn(line);
  else console.log(line);
}
module.exports={
  info:(m,meta)=>write('info',m,meta),
  warn:(m,meta)=>write('warn',m,meta),
  error:(m,meta)=>write('error',m,meta)
};
