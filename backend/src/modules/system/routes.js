const r=require('express').Router();
const c=require('./controller');
r.get('/health',c.health);
r.get('/ready',c.readiness);
module.exports=r;
