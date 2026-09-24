const r=require('express').Router();
const c=require('./controller');
r.get('/resolve',c.resolve);
module.exports=r;
