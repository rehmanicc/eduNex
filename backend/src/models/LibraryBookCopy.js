const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true}, bookId:{type:mongoose.Schema.Types.ObjectId,ref:'LibraryBook',required:true,index:true},
 accessionNo:{type:String,required:true,trim:true}, barcode:{type:String,trim:true}, acquisitionDate:Date, acquisitionCost:{type:Number,min:0,default:0},
 source:{type:String,enum:['purchase','donation','other'],default:'purchase'}, condition:{type:String,enum:['new','good','fair','damaged','lost'],default:'good'},
 status:{type:String,enum:['available','issued','reserved','lost','damaged','withdrawn'],default:'available',index:true}, notes:String
},{timestamps:true});
schema.index({collegeId:1,accessionNo:1},{unique:true}); schema.index({collegeId:1,barcode:1},{unique:true,sparse:true});
module.exports=mongoose.model('LibraryBookCopy',schema);
