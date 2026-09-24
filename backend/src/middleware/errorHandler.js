const logger=require('../services/logger');
module.exports=function errorHandler(err,req,res,next){
  const status=Number(err.statusCode||err.status||500);
  logger.error('request_failed',{requestId:req.requestId,method:req.method,path:req.originalUrl,status,userId:req.user?._id,collegeId:req.collegeId||req.user?.collegeId,error:err.message,stack:process.env.NODE_ENV==='production'?undefined:err.stack});
  if(res.headersSent)return next(err);
  const payload={error:status>=500&&process.env.NODE_ENV==='production'?'Internal server error':err.message};
  if(req.requestId)payload.requestId=req.requestId;
  res.status(status).json(payload);
};
