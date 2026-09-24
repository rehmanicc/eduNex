const crypto=require('crypto');
module.exports=function requestId(req,res,next){
  req.requestId=req.get('x-request-id')||crypto.randomUUID();
  res.setHeader('X-Request-Id',req.requestId);
  next();
};
