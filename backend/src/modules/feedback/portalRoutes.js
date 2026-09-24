const r=require('express').Router();
const c=require('./controller');
r.get('/',c.available);
r.get('/pending-mandatory',c.pendingMandatory);
r.post('/:id/submit',c.submit);
module.exports=r;
