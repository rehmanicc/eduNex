const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  collegeId:{type:mongoose.Schema.Types.ObjectId,ref:'College',required:true,unique:true,index:true},
  allowStudentAllocation:{type:Boolean,default:true},
  allowEmployeeAccommodation:{type:Boolean,default:false},
  allowMultipleHostelsPerBranch:{type:Boolean,default:true},
  requireGenderMatching:{type:Boolean,default:true},
  defaultAllocationDays:{type:Number,min:0,default:0},
  requireExpectedVacatingDate:{type:Boolean,default:false},
  allowBedReservation:{type:Boolean,default:true},
  reservationHoldDays:{type:Number,min:0,default:2},
  hostelBillingEnabled:{type:Boolean,default:true},
  defaultBillingCycle:{type:String,enum:['monthly','term','annual'],default:'monthly'},
  securityDepositRequired:{type:Boolean,default:false},
  messBillingEnabled:{type:Boolean,default:false},
  attendanceEnabled:{type:Boolean,default:true},
  attendanceTime:{type:String,default:'20:00'},
  allowNightOut:{type:Boolean,default:true},
  visitorRegisterRequired:{type:Boolean,default:true},
  visitorCnicRequired:{type:Boolean,default:false},
  maximumVisitMinutes:{type:Number,min:0,default:120},
  requireVisitorAuthorization:{type:Boolean,default:false}
},{timestamps:true});
module.exports=mongoose.model('HostelSettings',schema);
