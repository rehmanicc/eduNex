const mongoose=require('mongoose');
function health(req,res){res.json({status:'ok',uptime:process.uptime(),timestamp:new Date().toISOString(),requestId:req.requestId});}
function readiness(req,res){
  const ok=mongoose.connection.readyState===1;
  res.status(ok?200:503).json({status:ok?'ready':'not_ready',checks:{mongodb:ok?'ok':'down'},timestamp:new Date().toISOString(),requestId:req.requestId});
}
module.exports={health,readiness};
