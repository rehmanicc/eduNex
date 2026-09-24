const mongoose=require('mongoose');
const componentSchema=new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  type:{type:String,enum:['allowance','deduction'],required:true},
  calculation:{type:String,enum:['fixed','percentage_of_basic'],default:'fixed'},
  value:{type:Number,min:0,default:0},
  taxable:{type:Boolean,default:false}
},{_id:true});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  contractId:{type:mongoose.Schema.Types.ObjectId,ref:'EmployeeContract',index:true},
  effectiveFrom:{type:Date,required:true,index:true},
  effectiveTo:Date,
  basicSalary:{type:Number,min:0,default:0},
  components:{type:[componentSchema],default:[]},
  isActive:{type:Boolean,default:true,index:true}
},{timestamps:true});
schema.index({collegeId:1,employeeId:1,effectiveFrom:1});
module.exports=mongoose.model('SalaryStructure',schema);
