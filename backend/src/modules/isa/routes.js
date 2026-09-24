const r=require('express').Router();
const permit=require('../../middleware/permissions');
const P=require('../../constants/permissions');
const c=require('./controller');

r.get('/',permit(P.VIEW_ISA),c.listRecords);
r.post('/',permit(P.MANAGE_ISA),c.createRecord);
r.put('/:id',permit(P.MANAGE_ISA),c.updateRecord);
r.get('/my/records',permit(P.VIEW_ISA),c.myRecords);

module.exports=r;
