const mongoose=require('mongoose');
const itemSchema=new mongoose.Schema({feeHeadId:{type:mongoose.Schema.Types.ObjectId,ref:'FeeHead'},description:String,amount:{type:Number,required:true,min:0},discount:{type:Number,default:0,min:0},fine:{type:Number,default:0,min:0}},{_id:false});
const schema=new mongoose.Schema({
 collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true}, studentId:{type:mongoose.Schema.Types.ObjectId,ref:'Student',required:true,index:true},
 invoiceNo:{type:String,index:true}, academicSessionId:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession'}, semester:Number,
 title:String, items:{type:[itemSchema],default:[]}, amount:{type:Number,required:true,min:0}, concessionAmount:{type:Number,default:0,min:0}, fineAmount:{type:Number,default:0,min:0}, netAmount:{type:Number,min:0}, paidAmount:{type:Number,default:0,min:0},
 issueDate:{type:Date,default:Date.now}, dueDate:Date,
 status:{type:String,enum:['draft','unpaid','partial','paid','waived','cancelled'],default:'unpaid',index:true}, notes:String
},{timestamps:true});
schema.index({collegeId:1,invoiceNo:1},{unique:true,sparse:true});
schema.pre('validate',function(next){ if(!this.netAmount && this.netAmount!==0)this.netAmount=Math.max(0,Number(this.amount||0)-Number(this.concessionAmount||0)+Number(this.fineAmount||0)); next(); });
module.exports=mongoose.model('FeeInvoice',schema);
