require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { ensureStudentUser, syncStudentAccess, syncEmployeeAccess } = require('../services/accountProvisioningService');

(async()=>{
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  let students=0, employees=0, errors=0;
  for(const student of await Student.find({rollNo:{$exists:true,$nin:[null,'']}})){
    try{await ensureStudentUser(student);await syncStudentAccess(student);students++;}
    catch(e){errors++;console.error('Student',student._id,student.rollNo,e.message);}
  }
  for(const employee of await Employee.find({})){
    try{await syncEmployeeAccess(employee);employees++;}
    catch(e){errors++;console.error('Employee',employee._id,employee.employeeNo,e.message);}
  }
  console.log(`Account lifecycle migration complete. Students: ${students}, Employees synced: ${employees}, Errors: ${errors}`);
  await mongoose.disconnect();
  process.exit(errors?1:0);
})().catch(async e=>{console.error(e);try{await mongoose.disconnect()}catch{}process.exit(1)});
