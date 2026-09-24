import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';

const emptyStudentRule={
  scopeType:'college',scopeId:'',attendanceMode:'once',biometricEnabled:false,allowManualAttendance:true,
  firstSessionStart:'08:00',secondSessionStart:'13:00',graceMinutes:10,lateAfterMinutes:10,
  absentAfterMinutes:30,earlyCheckInMinutes:15,correctionWindowMinutes:120,allowTeacherCorrectionAfterFinalize:false
};
const emptyShift={
  _id:'',name:'',code:'',start:'08:00',end:'16:00',graceMinutes:10,lateAfterMinutes:10,
  absentAfterMinutes:120,earlyDepartureGraceMinutes:10,minimumWorkingMinutes:0,
  singlePunchPolicy:'present_missing_checkout',appliesTo:'all_staff',branchId:'',workingDays:[1,2,3,4,5,6],isDefault:false
};
const emptyClosure={
  _id:'',title:'',type:'holiday',startDate:'',endDate:'',audience:'all',scopeType:'college',scopeId:'',
  academicSessionId:'',description:'',blocksAttendance:true,isActive:true
};
const DAYS=[[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[0,'Sun']];

function errText(e){return e.response?.data?.error||e.response?.data?.message||e.message||'Request failed';}
function idOf(v){return String(v?._id||v||'');}
function hm(minutes=0){const n=Number(minutes||0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function toMinutes(value){const[h,m]=String(value||'00:00').split(':').map(Number);return (h||0)*60+(m||0);}
function dateOnly(v){if(!v)return'';return new Date(v).toISOString().slice(0,10);}

export default function AttendanceSettings(){
  const [section,setSection]=useState('student');
  const [options,setOptions]=useState({branches:[],wings:[],sections:[],programs:[],employees:[]});
  const [rules,setRules]=useState([]);
  const [studentForm,setStudentForm]=useState(emptyStudentRule);
  const [shifts,setShifts]=useState([]);
  const [shiftForm,setShiftForm]=useState(emptyShift);
  const [assignments,setAssignments]=useState([]);
  const [assignmentForm,setAssignmentForm]=useState({employeeId:'',shiftId:'',effectiveFrom:'',effectiveTo:''});
  const [closures,setClosures]=useState([]);
  const [closureForm,setClosureForm]=useState(emptyClosure);
  const [classTeachers,setClassTeachers]=useState({sections:[],teachers:[]});
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  function feedback(){setMessage('');setError('');}
  async function load(){
    feedback();
    try{
      const [optRes,ruleRes,shiftRes,assignmentRes,closureRes,classTeacherRes]=await Promise.all([
        api.get('/attendance/settings-options'),
        api.get('/attendance/rules'),
        api.get('/attendance/staff-shifts'),
        api.get('/attendance/staff-shift-assignments'),
        api.get('/attendance/calendar'),
        api.get('/attendance/class-teachers')
      ]);
      const rawOptions=optRes.data||{};
      setOptions({
        branches:Array.isArray(rawOptions.branches)?rawOptions.branches:[],
        wings:Array.isArray(rawOptions.wings)?rawOptions.wings:[],
        sections:Array.isArray(rawOptions.sections)?rawOptions.sections:[],
        programs:Array.isArray(rawOptions.programs)?rawOptions.programs:[],
        employees:Array.isArray(rawOptions.employees)?rawOptions.employees:[]
      });
      setRules(Array.isArray(ruleRes.data)?ruleRes.data:[]);
      setShifts(Array.isArray(shiftRes.data)?shiftRes.data:[]);
      setAssignments(Array.isArray(assignmentRes.data)?assignmentRes.data:[]);
      setClosures(Array.isArray(closureRes.data)?closureRes.data:[]);
      const rawClassTeachers=classTeacherRes.data||{};
      setClassTeachers({
        sections:Array.isArray(rawClassTeachers.sections)?rawClassTeachers.sections:[],
        teachers:Array.isArray(rawClassTeachers.teachers)?rawClassTeachers.teachers:[]
      });
    }catch(e){setError(errText(e));}
  }
  useEffect(()=>{load();},[]);

  const studentScopeChoices=useMemo(()=>{
    if(studentForm.scopeType==='branch')return (options.branches||[]).map(x=>[x._id,x.name]);
    if(studentForm.scopeType==='wing')return (options.wings||[]).map(x=>[x._id,x.name]);
    if(studentForm.scopeType==='program')return (options.programs||[]).map(x=>[x._id,x.name]);
    if(studentForm.scopeType==='section')return (options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Class / Program'} / ${x.name} / ${x.academicSessionId?.name||''}`]);
    return[];
  },[studentForm.scopeType,options]);

  const closureScopeChoices=useMemo(()=>{
    if(closureForm.scopeType==='branch')return (options.branches||[]).map(x=>[x._id,x.name]);
    if(closureForm.scopeType==='wing')return (options.wings||[]).map(x=>[x._id,x.name]);
    if(closureForm.scopeType==='program')return (options.programs||[]).map(x=>[x._id,x.name]);
    if(closureForm.scopeType==='section')return (options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Class / Program'} / ${x.name}`]);
    if(closureForm.scopeType==='employee')return (options.employees||[]).map(x=>[x._id,`${x.employeeNo||x.employeeCode||''} - ${x.name}`]);
    return[];
  },[closureForm.scopeType,options]);

  function ruleScopeLabel(r){
    if(r.scopeType==='college')return'College Default';
    const src=r.scopeType==='branch'?(options.branches||[]):r.scopeType==='wing'?(options.wings||[]):r.scopeType==='program'?(options.programs||[]):(options.sections||[]);
    const row=src.find(x=>idOf(x)===idOf(r.scopeId));
    return row?(r.scopeType==='section'?`${row.programId?.name||''} / ${row.name}`:row.name):r.scopeType;
  }
  async function saveStudentRule(e){
    e.preventDefault();feedback();setBusy(true);
    try{
      await api.post('/attendance/rules',{
        ...studentForm,
        scopeId:studentForm.scopeType==='college'?null:studentForm.scopeId,
        firstSessionStartMinutes:toMinutes(studentForm.firstSessionStart),
        secondSessionStartMinutes:toMinutes(studentForm.secondSessionStart)
      });
      setMessage('Student attendance rule saved.');
      const {data}=await api.get('/attendance/rules');setRules(Array.isArray(data)?data:[]);
    }catch(e2){setError(errText(e2));}finally{setBusy(false);}
  }

  function editShift(s){
    setShiftForm({
      _id:s._id,name:s.name||'',code:s.code||'',start:hm(s.startMinutes),end:hm(s.endMinutes),
      graceMinutes:s.graceMinutes??10,lateAfterMinutes:s.lateAfterMinutes??10,absentAfterMinutes:s.absentAfterMinutes??120,
      earlyDepartureGraceMinutes:s.earlyDepartureGraceMinutes??10,minimumWorkingMinutes:s.minimumWorkingMinutes??0,
      singlePunchPolicy:s.singlePunchPolicy||'present_missing_checkout',appliesTo:s.appliesTo||'all_staff',
      branchId:idOf(s.branchId),workingDays:s.workingDays||[1,2,3,4,5,6],isDefault:!!s.isDefault
    });
  }
  function toggleWorkingDay(day){setShiftForm(f=>({...f,workingDays:f.workingDays.includes(day)?f.workingDays.filter(x=>x!==day):[...f.workingDays,day]}));}
  async function saveShift(e){
    e.preventDefault();feedback();setBusy(true);
    try{
      await api.post('/attendance/staff-shifts',{
        ...shiftForm,startMinutes:toMinutes(shiftForm.start),endMinutes:toMinutes(shiftForm.end),
        branchId:shiftForm.branchId||null
      });
      setMessage('Staff shift saved.');setShiftForm(emptyShift);
      const {data}=await api.get('/attendance/staff-shifts');setShifts(Array.isArray(data)?data:[]);
    }catch(e2){setError(errText(e2));}finally{setBusy(false);}
  }
  async function saveAssignment(e){
    e.preventDefault();feedback();setBusy(true);
    try{
      await api.put('/attendance/staff-shift-assignments',{...assignmentForm,effectiveFrom:assignmentForm.effectiveFrom||null,effectiveTo:assignmentForm.effectiveTo||null});
      setMessage('Employee shift assignment saved.');
      setAssignmentForm({employeeId:'',shiftId:'',effectiveFrom:'',effectiveTo:''});
      const {data}=await api.get('/attendance/staff-shift-assignments');setAssignments(Array.isArray(data)?data:[]);
    }catch(e2){setError(errText(e2));}finally{setBusy(false);}
  }

  function closureScopeLabel(c){
    if((c.scopeType||'college')==='college')return'Whole College';
    const src=c.scopeType==='branch'?options.branches:c.scopeType==='wing'?options.wings:c.scopeType==='program'?options.programs:c.scopeType==='section'?options.sections:options.employees;
    const row=src.find(x=>idOf(x)===idOf(c.scopeId));
    return row?.name||row?.programId?.name||c.scopeType;
  }
  function editClosure(c){
    setClosureForm({
      _id:c._id,title:c.title||'',type:c.type||'holiday',startDate:dateOnly(c.startDate),endDate:dateOnly(c.endDate),
      audience:c.audience||'all',scopeType:c.scopeType||'college',scopeId:idOf(c.scopeId),
      academicSessionId:idOf(c.academicSessionId),description:c.description||'',blocksAttendance:c.blocksAttendance!==false,isActive:c.isActive!==false
    });
  }
  async function saveClosure(e){
    e.preventDefault();feedback();setBusy(true);
    try{
      const payload={...closureForm,scopeId:closureForm.scopeType==='college'?null:closureForm.scopeId};
      if(closureForm._id)await api.put(`/attendance/calendar/${closureForm._id}`,payload);
      else await api.post('/attendance/calendar',payload);
      setMessage('Holiday / closure saved. Attendance will respect this rule.');
      setClosureForm(emptyClosure);
      const {data}=await api.get('/attendance/calendar');setClosures(Array.isArray(data)?data:[]);
    }catch(e2){setError(errText(e2));}finally{setBusy(false);}
  }

  async function assignClassTeacher(sectionId,classTeacherId){
    feedback();setBusy(true);
    try{
      await api.put(`/attendance/class-teachers/${sectionId}`,{classTeacherId:classTeacherId||null});
      setMessage('Class Teacher allocation updated.');
      const {data}=await api.get('/attendance/class-teachers');setClassTeachers(data||{sections:[],teachers:[]});
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  return <div className="att-settings">
    <div className="att-settings-intro"><div><h2>Attendance Settings</h2><p>This is the single authoritative place for attendance rules. Biometric hardware remains in the Biometric module.</p></div></div>
    <div className="att-settings-tabs">
      <button type="button" className={`att-settings-tab ${section==='student'?'active':''}`} onClick={()=>setSection('student')}><span>Student Rules</span></button>
      <button type="button" className={`att-settings-tab ${section==='staff'?'active':''}`} onClick={()=>setSection('staff')}><span>Staff Shifts</span></button>
      <button type="button" className={`att-settings-tab ${section==='closures'?'active':''}`} onClick={()=>setSection('closures')}><span>Holidays &amp; Closures</span></button>
      <button type="button" className={`att-settings-tab ${section==='teachers'?'active':''}`} onClick={()=>setSection('teachers')}><span>Class Teachers</span></button>
    </div>
    {error&&<div className="att-error">{error}</div>}{message&&<div className="att-success">{message}</div>}

    {section==='student'&&<>
      <section className="att-settings-card"><div className="att-settings-card-head"><div><h3>Student Attendance Rules</h3><p>Priority: Section → Program/Class → Wing → Branch → College Default. University attendance remains per period.</p></div></div>
        <form className="att-settings-grid" onSubmit={saveStudentRule}>
          <label><span>Rule Scope</span><select value={studentForm.scopeType} onChange={e=>setStudentForm({...studentForm,scopeType:e.target.value,scopeId:''})}><option value="college">College Default</option><option value="branch">Branch</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select></label>
          {studentForm.scopeType!=='college'&&<label><span>Select Scope</span><select required value={studentForm.scopeId} onChange={e=>setStudentForm({...studentForm,scopeId:e.target.value})}><option value="">Select...</option>{studentScopeChoices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
          <label><span>Attendance Mode</span><select value={studentForm.attendanceMode} onChange={e=>setStudentForm({...studentForm,attendanceMode:e.target.value})}><option value="once">Once a Day</option><option value="twice">Twice a Day</option><option value="per_period">Each Period</option></select></label>
          <label><span>{studentForm.attendanceMode==='twice'?'First Session Start':'Attendance Start Time'}</span><input type="time" value={studentForm.firstSessionStart} onChange={e=>setStudentForm({...studentForm,firstSessionStart:e.target.value})}/></label>
          {studentForm.attendanceMode==='twice'&&<label><span>Second Session Start</span><input type="time" value={studentForm.secondSessionStart} onChange={e=>setStudentForm({...studentForm,secondSessionStart:e.target.value})}/></label>}
          <label><span>Grace Period (Minutes)</span><input type="number" min="0" value={studentForm.graceMinutes} onChange={e=>setStudentForm({...studentForm,graceMinutes:e.target.value})}/></label>
          <label><span>Mark Late After (Minutes)</span><input type="number" min="0" value={studentForm.lateAfterMinutes} onChange={e=>setStudentForm({...studentForm,lateAfterMinutes:e.target.value})}/></label>
          <label><span>Mark Absent After (Minutes)</span><input type="number" min="0" value={studentForm.absentAfterMinutes} onChange={e=>setStudentForm({...studentForm,absentAfterMinutes:e.target.value})}/></label>
          <label><span>Allow Check-in Before Start (Minutes)</span><input type="number" min="0" value={studentForm.earlyCheckInMinutes} onChange={e=>setStudentForm({...studentForm,earlyCheckInMinutes:e.target.value})}/></label>
          <label><span>Correction Window (Minutes)</span><input type="number" min="0" value={studentForm.correctionWindowMinutes} onChange={e=>setStudentForm({...studentForm,correctionWindowMinutes:e.target.value})}/></label>
          <label className="att-setting-check"><input type="checkbox" checked={studentForm.biometricEnabled} onChange={e=>setStudentForm({...studentForm,biometricEnabled:e.target.checked})}/> Enable biometric attendance</label>
          <label className="att-setting-check"><input type="checkbox" checked={studentForm.allowManualAttendance} onChange={e=>setStudentForm({...studentForm,allowManualAttendance:e.target.checked})}/> Allow manual attendance</label>
          <label className="att-setting-check"><input type="checkbox" checked={studentForm.allowTeacherCorrectionAfterFinalize} onChange={e=>setStudentForm({...studentForm,allowTeacherCorrectionAfterFinalize:e.target.checked})}/> Teacher correction after finalize</label>
          <div className="att-settings-actions"><button disabled={busy}>Save Student Rule</button></div>
        </form>
      </section>
      <section className="att-settings-card"><h3>Configured Student Rules</h3><div className="att-table-wrap"><table className="att-table"><thead><tr><th>Scope</th><th>Mode</th><th>Biometric</th><th>Manual</th><th>Start</th><th>Second</th></tr></thead><tbody>{(rules||[]).map(r=><tr key={r._id}><td>{ruleScopeLabel(r)}</td><td>{r.attendanceMode==='per_period'?'Each Period':r.attendanceMode==='twice'?'Twice Daily':'Once Daily'}</td><td>{r.biometricEnabled?'Yes':'No'}</td><td>{r.allowManualAttendance?'Yes':'No'}</td><td>{hm(r.firstSessionStartMinutes)}</td><td>{r.attendanceMode==='twice'?hm(r.secondSessionStartMinutes):'—'}</td></tr>)}{!rules.length&&<tr><td colSpan="6">No attendance rules configured.</td></tr>}</tbody></table></div></section>
    </>}

    {section==='staff'&&<>
      <section className="att-settings-card"><div className="att-settings-card-head"><div><h3>Staff Shifts / Duty Timings</h3><p>These rules calculate biometric and manual staff attendance. Device configuration does not contain attendance timing. Configure at least one applicable/default shift before processing staff punches.</p></div></div>
        <form className="att-settings-grid" onSubmit={saveShift}>
          <label><span>Shift Name *</span><input required value={shiftForm.name} onChange={e=>setShiftForm({...shiftForm,name:e.target.value})}/></label>
          <label><span>Code</span><input value={shiftForm.code} onChange={e=>setShiftForm({...shiftForm,code:e.target.value.toUpperCase()})}/></label>
          <label><span>Applies To</span><select value={shiftForm.appliesTo} onChange={e=>setShiftForm({...shiftForm,appliesTo:e.target.value})}><option value="all_staff">All Staff</option><option value="academic_staff">Teachers / Academic Staff</option><option value="non_teaching_staff">Non-Teaching / Admin Staff</option></select></label>
          <label><span>Branch</span><select value={shiftForm.branchId} onChange={e=>setShiftForm({...shiftForm,branchId:e.target.value})}><option value="">All Branches</option>{(options.branches||[]).map(b=><option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
          <label><span>Start *</span><input required type="time" value={shiftForm.start} onChange={e=>setShiftForm({...shiftForm,start:e.target.value})}/></label>
          <label><span>End *</span><input required type="time" value={shiftForm.end} onChange={e=>setShiftForm({...shiftForm,end:e.target.value})}/></label>
          <label><span>Grace Minutes</span><input type="number" min="0" value={shiftForm.graceMinutes} onChange={e=>setShiftForm({...shiftForm,graceMinutes:e.target.value})}/></label>
          <label><span>Late After</span><input type="number" min="0" value={shiftForm.lateAfterMinutes} onChange={e=>setShiftForm({...shiftForm,lateAfterMinutes:e.target.value})}/></label>
          <label><span>Absent After</span><input type="number" min="0" value={shiftForm.absentAfterMinutes} onChange={e=>setShiftForm({...shiftForm,absentAfterMinutes:e.target.value})}/></label>
          <label><span>Early Departure Grace</span><input type="number" min="0" value={shiftForm.earlyDepartureGraceMinutes} onChange={e=>setShiftForm({...shiftForm,earlyDepartureGraceMinutes:e.target.value})}/></label>
          <label><span>Minimum Working Minutes</span><input type="number" min="0" value={shiftForm.minimumWorkingMinutes} onChange={e=>setShiftForm({...shiftForm,minimumWorkingMinutes:e.target.value})}/></label>
          <label><span>Single Punch</span><select value={shiftForm.singlePunchPolicy} onChange={e=>setShiftForm({...shiftForm,singlePunchPolicy:e.target.value})}><option value="present_missing_checkout">Present + Missing Checkout</option><option value="late_missing_checkout">Late + Missing Checkout</option><option value="exception">Flag as Exception</option></select></label>
          <div className="att-working-days"><span>Working Days</span>{DAYS.map(([d,l])=><label key={d}><input type="checkbox" checked={shiftForm.workingDays.includes(d)} onChange={()=>toggleWorkingDay(d)}/>{l}</label>)}</div>
          <label className="att-setting-check"><input type="checkbox" checked={shiftForm.isDefault} onChange={e=>setShiftForm({...shiftForm,isDefault:e.target.checked})}/> Default shift for this staff group/branch</label>
          <div className="att-settings-actions"><button disabled={busy}>{shiftForm._id?'Update Shift':'Add Shift'}</button>{shiftForm._id&&<button type="button" className="att-secondary" onClick={()=>setShiftForm(emptyShift)}>Cancel Edit</button>}</div>
        </form>
      </section>
      <section className="att-settings-card"><h3>Configured Staff Shifts</h3><div className="att-table-wrap"><table className="att-table"><thead><tr><th>Shift</th><th>Staff Group</th><th>Branch</th><th>Duty Time</th><th>Grace</th><th>Early Departure</th><th>Default</th><th></th></tr></thead><tbody>{(shifts||[]).map(s=><tr key={s._id}><td>{s.name}{s.code?` (${s.code})`:''}</td><td>{s.appliesTo==='academic_staff'?'Academic':s.appliesTo==='non_teaching_staff'?'Non-Teaching':'All Staff'}</td><td>{s.branchId?.name||'All'}</td><td>{hm(s.startMinutes)} – {hm(s.endMinutes)}</td><td>{s.graceMinutes} min</td><td>{s.earlyDepartureGraceMinutes} min grace</td><td>{s.isDefault?'Yes':'No'}</td><td><button type="button" onClick={()=>editShift(s)}>Edit</button></td></tr>)}{!shifts.length&&<tr><td colSpan="8">No staff shifts configured yet.</td></tr>}</tbody></table></div></section>
      <section className="att-settings-card"><div className="att-settings-card-head"><div><h3>Employee Shift Assignment</h3><p>Use this only when an employee needs an individual override. Otherwise the default staff-group shift applies automatically.</p></div></div>
        <form className="att-assignment-row" onSubmit={saveAssignment}>
          <select required value={assignmentForm.employeeId} onChange={e=>setAssignmentForm({...assignmentForm,employeeId:e.target.value})}><option value="">Select Employee</option>{(options.employees||[]).map(e=><option key={e._id} value={e._id}>{e.employeeNo||e.employeeCode} - {e.name}</option>)}</select>
          <select required value={assignmentForm.shiftId} onChange={e=>setAssignmentForm({...assignmentForm,shiftId:e.target.value})}><option value="">Select Shift</option>{(shifts||[]).map(s=><option key={s._id} value={s._id}>{s.name} ({hm(s.startMinutes)}-{hm(s.endMinutes)})</option>)}</select>
          <input type="date" title="Effective From" value={assignmentForm.effectiveFrom} onChange={e=>setAssignmentForm({...assignmentForm,effectiveFrom:e.target.value})}/>
          <input type="date" title="Effective To" value={assignmentForm.effectiveTo} onChange={e=>setAssignmentForm({...assignmentForm,effectiveTo:e.target.value})}/>
          <button disabled={busy}>Assign Shift</button>
        </form>
        <div className="att-table-wrap"><table className="att-table"><thead><tr><th>Employee</th><th>Shift</th><th>Effective From</th><th>Effective To</th></tr></thead><tbody>{(assignments||[]).map(a=><tr key={a._id}><td>{a.employeeId?.employeeNo||a.employeeId?.employeeCode} - {a.employeeId?.name}</td><td>{a.shiftId?.name}</td><td>{dateOnly(a.effectiveFrom)||'Immediate'}</td><td>{dateOnly(a.effectiveTo)||'Open'}</td></tr>)}{!assignments.length&&<tr><td colSpan="4">No individual shift overrides.</td></tr>}</tbody></table></div>
      </section>
    </>}

    {section==='closures'&&<>
      <section className="att-settings-card"><div className="att-settings-card-head"><div><h3>Holidays & Closures</h3><p>Create college offs for everyone, students, staff, teachers, a branch, program/class, section, or selected employee.</p></div></div>
        <form className="att-settings-grid" onSubmit={saveClosure}>
          <label><span>Title *</span><input required value={closureForm.title} onChange={e=>setClosureForm({...closureForm,title:e.target.value})}/></label>
          <label><span>Type</span><select value={closureForm.type} onChange={e=>setClosureForm({...closureForm,type:e.target.value})}><option value="holiday">Holiday</option><option value="non_working_day">Non-Working Day</option><option value="exam_day">Exam Day</option><option value="event">Event</option><option value="other">Other</option></select></label>
          <label><span>From *</span><input required type="date" value={closureForm.startDate} onChange={e=>setClosureForm({...closureForm,startDate:e.target.value})}/></label>
          <label><span>To *</span><input required type="date" value={closureForm.endDate} onChange={e=>setClosureForm({...closureForm,endDate:e.target.value})}/></label>
          <label><span>Applies To</span><select value={closureForm.audience} onChange={e=>setClosureForm({...closureForm,audience:e.target.value,scopeId:''})}><option value="all">Students + Staff</option><option value="students">Students Only</option><option value="staff">All Staff Only</option><option value="academic_staff">Teachers / Academic Staff</option><option value="non_teaching_staff">Non-Teaching / Admin Staff</option></select></label>
          <label><span>Scope</span><select value={closureForm.scopeType} onChange={e=>setClosureForm({...closureForm,scopeType:e.target.value,scopeId:''})}><option value="college">Whole College</option><option value="branch">Branch</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option>{closureForm.audience!=='students'&&<option value="employee">Selected Employee</option>}</select></label>
          {closureForm.scopeType!=='college'&&<label><span>Select Scope Item</span><select required value={closureForm.scopeId} onChange={e=>setClosureForm({...closureForm,scopeId:e.target.value})}><option value="">Select...</option>{closureScopeChoices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
          <label className="att-settings-span-2"><span>Reason / Description</span><input value={closureForm.description} onChange={e=>setClosureForm({...closureForm,description:e.target.value})}/></label>
          <label className="att-setting-check"><input type="checkbox" checked={closureForm.blocksAttendance} onChange={e=>setClosureForm({...closureForm,blocksAttendance:e.target.checked})}/> Block attendance / do not generate absence</label>
          <div className="att-settings-actions"><button disabled={busy}>{closureForm._id?'Update Closure':'Add Holiday / Closure'}</button>{closureForm._id&&<button type="button" className="att-secondary" onClick={()=>setClosureForm(emptyClosure)}>Cancel Edit</button>}</div>
        </form>
      </section>
      <section className="att-settings-card"><h3>Configured Holidays & Closures</h3><div className="att-table-wrap"><table className="att-table"><thead><tr><th>Title</th><th>Dates</th><th>Audience</th><th>Scope</th><th>Attendance</th><th></th></tr></thead><tbody>{(closures||[]).map(c=><tr key={c._id}><td>{c.title}</td><td>{dateOnly(c.startDate)} → {dateOnly(c.endDate)}</td><td>{String(c.audience||'all').replaceAll('_',' ')}</td><td>{closureScopeLabel(c)}</td><td>{c.blocksAttendance!==false?'Blocked':'Allowed'}</td><td><button type="button" onClick={()=>editClosure(c)}>Edit</button></td></tr>)}{!closures.length&&<tr><td colSpan="6">No holidays or closures configured.</td></tr>}</tbody></table></div></section>
    </>}

    {section==='teachers'&&<section className="att-settings-card"><div className="att-settings-card-head"><div><h3>Class Teacher / Attendance Responsibility</h3><p>Assign class teachers here. University per-period attendance continues to follow the timetable teacher.</p></div></div>
      <div className="att-table-wrap"><table className="att-table"><thead><tr><th>Session</th><th>Program / Class</th><th>Section</th><th>Class Teacher</th></tr></thead><tbody>{(classTeachers?.sections||[]).map(s=><tr key={s._id}><td>{s.academicSessionId?.name||'—'}</td><td>{s.programId?.name||'—'}</td><td>{s.name}</td><td><select value={idOf(s.classTeacherId)} disabled={busy} onChange={e=>assignClassTeacher(s._id,e.target.value)}><option value="">Not Assigned</option>{(classTeachers?.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select></td></tr>)}{!classTeachers.sections?.length&&<tr><td colSpan="4">No active sections found.</td></tr>}</tbody></table></div>
    </section>}
  </div>;
}
