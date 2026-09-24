const mongoose=require('mongoose');
function fail(res,message){return res.status(400).json({error:message})}
function validateObjectIdParam(name){return (req,res,next)=>{if(!mongoose.Types.ObjectId.isValid(req.params[name]))return fail(res,`Invalid ${name}`);next();};}
function validateOptionalObjectIdQuery(name){return (req,res,next)=>{const v=req.query[name];if(v!==undefined&&v!==''&&!mongoose.Types.ObjectId.isValid(v))return fail(res,`Invalid ${name}`);next();};}
function validateOptionalObjectIdBody(name){return (req,res,next)=>{const v=req.body?.[name];if(v!==undefined&&v!==null&&v!==''&&!mongoose.Types.ObjectId.isValid(v))return fail(res,`Invalid ${name}`);next();};}
function validateRequiredObjectIdBody(name){return (req,res,next)=>{const v=req.body?.[name];if(!v||!mongoose.Types.ObjectId.isValid(v))return fail(res,`Valid ${name} is required`);next();};}
function validateStringBody(name,{required=false,min=0,max=5000}={}){return (req,res,next)=>{const v=req.body?.[name];if(required&&(typeof v!=='string'||!v.trim()))return fail(res,`${name} is required`);if(v!==undefined){if(typeof v!=='string')return fail(res,`${name} must be a string`);if(v.length<min||v.length>max)return fail(res,`${name} length is invalid`);}next();};}
function validatePagination(req,res,next){for(const key of ['page','limit']){if(req.query[key]!==undefined&&(!/^\d+$/.test(String(req.query[key]))||Number(req.query[key])<1))return fail(res,`${key} must be a positive integer`);}next();}
module.exports={validateObjectIdParam,validateOptionalObjectIdQuery,validateOptionalObjectIdBody,validateRequiredObjectIdBody,validateStringBody,validatePagination};
