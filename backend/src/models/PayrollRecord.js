const mongoose=require('mongoose');
const itemSchema=new mongoose.Schema({
  name:{type:String,required:true},
  amount:{type:Number,required:true},
  source:{type:String,enum:['salary_structure','attendance','leave','loan','manual'],default:'salary_structure'},
  sourceRefId:{type:mongoose.Schema.Types.ObjectId}
},{_id:false});

const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,index:true},
  employeeId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee',required:true,index:true},
  salaryStructureId:{type:mongoose.Schema.Types.ObjectId,ref:'SalaryStructure'},
  year:{type:Number,required:true,index:true},
  month:{type:Number,min:1,max:12,required:true,index:true},

  basicSalary:{type:Number,min:0,default:0},
  allowances:{type:[itemSchema],default:[]},
  deductions:{type:[itemSchema],default:[]},

  grossSalary:{type:Number,min:0,default:0},
  totalDeductions:{type:Number,min:0,default:0},
  netSalary:{type:Number,min:0,default:0},

  workingDays:{type:Number,min:0,default:0},
  paidDays:{type:Number,min:0,default:0},
  unpaidLeaveDays:{type:Number,min:0,default:0},

  status:{type:String,enum:['draft','generated','approved','posted','partially_paid','paid','void'],default:'draft',index:true},
  generatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  approvedAt:Date,
  paidAt:Date,
  paymentMethod:{type:String,enum:['cash','bank','cheque','online']},
  paymentReference:String,
  paidAmount:{type:Number,min:0,default:0},
  balanceAmount:{type:Number,min:0,default:0},
  notes:String
},{timestamps:true});
schema.index({collegeId:1,employeeId:1,year:1,month:1},{unique:true});
module.exports=mongoose.model('PayrollRecord',schema);
