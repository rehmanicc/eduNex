import {useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import api from '../../api/client';
import './timetable.css';
import TimetableConstraints from './TimetableConstraints';
import TimetableGenerator from './TimetableGenerator';
import TimetableWholeView from './TimetableWholeView';
import TimetableVerification from './TimetableVerification';
import TimetableTeachersTab from './TimetableTeachersTab';
import TimetableClassesTab from './TimetableClassesTab';
import TimetableReports from './TimetableReports';

const DAYS=[['monday','Monday'],['tuesday','Tuesday'],['wednesday','Wednesday'],['thursday','Thursday'],['friday','Friday'],['saturday','Saturday'],['sunday','Sunday']];
const dayNumber=d=>['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(d);
const err=e=>e?.response?.data?.error||e.message;
const oid=v=>String(v?._id||v||'');

export default function Timetable(){
 const[searchParams,setSearchParams]=useSearchParams();
 const[tab,setTabState]=useState(searchParams.get('tab')||'assignments');
 const setTab=next=>{setTabState(next);setSearchParams(prev=>{const copy=new URLSearchParams(prev);copy.set('tab',next);return copy;});};
 useEffect(()=>{const next=searchParams.get('tab')||'assignments';if(next!==tab)setTabState(next);},[searchParams]);
 const[o,setO]=useState({settings:{},sessions:[],programs:[],sections:[],courses:[],teachers:[],rooms:[],branches:[],wings:[],profiles:[]});
 const[assignments,setAssignments]=useState([]);
 const[grid,setGrid]=useState([]);
 const[message,setMessage]=useState('');
 const[error,setError]=useState('');
 const[busy,setBusy]=useState(false);
 const[selection,setSelection]=useState({academicSessionId:'',sectionId:''});
 const[subjectRows,setSubjectRows]=useState({});
 const[room,setRoom]=useState({name:'',code:'',capacity:40});
 const[view,setView]=useState({academicSessionId:'',sectionId:''});
 const[settingsForm,setSettingsForm]=useState({name:'College Default',scopeType:'college',scopeId:'',workingDays:[],scheduleSlots:[]});
 const[settingsScope,setSettingsScope]=useState({scopeType:'college',scopeId:''});

 async function load(){
  try{
   const [a,b]=await Promise.all([api.get('/timetable/options'),api.get('/timetable/assignments')]);
   setO(a.data);
   setAssignments(b.data||[]);
   const profiles=Array.isArray(a.data?.profiles)?a.data.profiles:[];
   const collegeProfile=profiles.find(p=>p.scopeType==='college')||null;
   const currentSettings=collegeProfile||a.data?.settings||{};
   setSettingsScope({scopeType:'college',scopeId:''});
   setSettingsForm({
    name:collegeProfile?.name||'College Default',
    scopeType:'college',
    scopeId:'',
    workingDays:Array.isArray(currentSettings.workingDays)?currentSettings.workingDays:['monday','tuesday','wednesday','thursday','friday','saturday'],
    scheduleSlots:Array.isArray(currentSettings.scheduleSlots)?currentSettings.scheduleSlots.map((s,i)=>({
      label:s.label||`Period ${i+1}`,
      startTime:s.startTime||'',
      endTime:s.endTime||'',
      isBreak:Boolean(s.isBreak)||s.type==='break'
    })):[]
   });
   const current=a.data.sessions?.find(x=>x.isCurrent)?._id||a.data.sessions?.[0]?._id||'';
   setSelection(v=>({...v,academicSessionId:v.academicSessionId||current}));
   setView(v=>({...v,academicSessionId:v.academicSessionId||current}));
  }catch(e){setError(err(e));}
 }
 useEffect(()=>{load();},[]);

 async function loadGrid(){if(!view.academicSessionId)return;const r=await api.get('/timetable/grid',{params:view});setGrid(r.data||[]);}
 useEffect(()=>{if(tab==='grid')loadGrid().catch(e=>setError(err(e)));},[tab,view.academicSessionId,view.sectionId]);

 const sessionSections=useMemo(()=>o.sections.filter(x=>!selection.academicSessionId||oid(x.academicSessionId)===selection.academicSessionId),[o.sections,selection.academicSessionId]);
 const selectedSection=useMemo(()=>o.sections.find(x=>x._id===selection.sectionId),[o.sections,selection.sectionId]);
 const sectionCourses=useMemo(()=>{
  if(!selectedSection)return[];
  return o.courses.filter(x=>oid(x.programId)===oid(selectedSection.programId)&&Number(x.periodNumber)===Number(selectedSection.periodNumber)).sort((a,b)=>a.name.localeCompare(b.name));
 },[o.courses,selectedSection]);
 const sectionAssignments=useMemo(()=>assignments.filter(a=>oid(a.academicSessionId)===selection.academicSessionId&&oid(a.sectionId)===selection.sectionId),[assignments,selection]);

 useEffect(()=>{
  if(!selectedSection){setSubjectRows({});return;}
  const next={};
  for(const c of sectionCourses){
   const a=sectionAssignments.find(x=>oid(x.courseId)===c._id);
   next[c._id]={selected:!!a,teacherId:a?oid(a.teacherId):'',weeklyPeriods:Number(a?.weeklyPeriods||5),lessonSpan:Number(a?.lessonSpan||1),preferredRoom:a?.preferredRoom||'',divisionId:a?oid(a.divisionId):'',maxLessonsPerDay:Number(a?.maxLessonsPerDay||1),spreadAcrossWeek:a?.spreadAcrossWeek!==false};
  }
  setSubjectRows(next);
 },[selectedSection,sectionCourses,sectionAssignments]);

 function updateRow(courseId,patch){setSubjectRows(prev=>({...prev,[courseId]:{...prev[courseId],...patch}}));}
 function toggleAll(checked){setSubjectRows(prev=>Object.fromEntries(sectionCourses.map(c=>[c._id,{...(prev[c._id]||{teacherId:'',weeklyPeriods:5,lessonSpan:1,preferredRoom:'',divisionId:'',maxLessonsPerDay:1,spreadAcrossWeek:true}),selected:checked}])));}
 const selectedCount=Object.values(subjectRows).filter(x=>x.selected).length;
 const allSelected=sectionCourses.length>0&&sectionCourses.every(c=>subjectRows[c._id]?.selected);

 async function saveAssignments(){
  setError('');setMessage('');
  if(!selection.academicSessionId||!selection.sectionId){setError('Select Session and Class / Section first.');return;}
  const rows=sectionCourses.filter(c=>subjectRows[c._id]?.selected).map(c=>({courseId:c._id,teacherId:subjectRows[c._id]?.teacherId,weeklyPeriods:Number(subjectRows[c._id]?.weeklyPeriods||0),lessonSpan:Number(subjectRows[c._id]?.lessonSpan||1),preferredRoom:subjectRows[c._id]?.preferredRoom||'',divisionId:subjectRows[c._id]?.divisionId||'',maxLessonsPerDay:Number(subjectRows[c._id]?.maxLessonsPerDay||1),spreadAcrossWeek:subjectRows[c._id]?.spreadAcrossWeek!==false}));
  if(!rows.length){setError('Select at least one subject.');return;}
  if(rows.some(x=>!x.teacherId)){setError('Select a teacher for every selected subject.');return;}
  setBusy(true);
  try{
   const r=await api.post('/timetable/assignments/bulk',{...selection,assignments:rows});
   setMessage(r.data?.message||'Teacher assignments saved.');
   const refreshed=await api.get('/timetable/assignments');setAssignments(refreshed.data||[]);
  }catch(e){setError(err(e));}finally{setBusy(false);}
 }

 async function addRoom(e){e.preventDefault();try{await api.post('/timetable/rooms',room);setRoom({name:'',code:'',capacity:40});await load();}catch(e2){setError(err(e2));}}
 async function place(a,day,periodNo){try{await api.post('/timetable/grid',{teacherAssignmentId:a._id,dayOfWeek:dayNumber(day),periodNo});await loadGrid();}catch(e){setError(err(e));}}



 function profileScopeId(profile){return oid(profile?.scopeId);}
 function profileFor(scopeType,scopeId=''){
  return (o.profiles||[]).find(p=>p.scopeType===scopeType&&(scopeType==='college'||profileScopeId(p)===String(scopeId)))||null;
 }
 function blankSlots(){return[];}
 function loadSettingsScope(scopeType,scopeId=''){
  const profile=profileFor(scopeType,scopeId);
  const fallback=scopeType==='college'?(profile||o.settings||{}):(profile||{});
  setSettingsScope({scopeType,scopeId:scopeType==='college'?'':scopeId});
  setSettingsForm({
   name:profile?.name||(scopeType==='college'?'College Default':''),
   scopeType,
   scopeId:scopeType==='college'?'':scopeId,
   workingDays:Array.isArray(fallback.workingDays)?fallback.workingDays:['monday','tuesday','wednesday','thursday','friday','saturday'],
   scheduleSlots:Array.isArray(fallback.scheduleSlots)?fallback.scheduleSlots.map((s,i)=>({
    label:s.label||`Period ${i+1}`,startTime:s.startTime||'',endTime:s.endTime||'',isBreak:!!s.isBreak
   })):blankSlots()
  });
 }
 function scopeOptions(type){
  if(type==='branch')return (o.branches||[]).map(x=>[x._id,x.name]);
  if(type==='wing')return (o.wings||[]).map(x=>[x._id,x.name]);
  if(type==='program')return (o.programs||[]).map(x=>[x._id,x.name]);
  if(type==='section')return (o.sections||[]).map(x=>[x._id,`${x.programId?.name||'Program'} / ${x.name}`]);
  return[];
 }
 function profileScopeLabel(p){
  if(p.scopeType==='college')return'College Default';
  const rows=p.scopeType==='branch'?(o.branches||[]):p.scopeType==='wing'?(o.wings||[]):p.scopeType==='program'?(o.programs||[]):(o.sections||[]);
  const row=rows.find(x=>oid(x)===profileScopeId(p));
  return row?(p.scopeType==='section'?`${row.programId?.name||'Program'} / ${row.name}`:row.name):p.scopeType;
 }

 function toggleWorkingDay(day){
  setSettingsForm(prev=>({
   ...prev,
   workingDays:prev.workingDays.includes(day)
    ?prev.workingDays.filter(x=>x!==day)
    :[...prev.workingDays,day]
  }));
 }
 function addSettingPeriod(){
  const count=settingsForm.scheduleSlots.filter(x=>!x.isBreak).length+1;
  setSettingsForm(prev=>({...prev,scheduleSlots:[...prev.scheduleSlots,{label:`Period ${count}`,startTime:'',endTime:'',isBreak:false}]}));
 }
 function addSettingBreak(){
  setSettingsForm(prev=>({...prev,scheduleSlots:[...prev.scheduleSlots,{label:'Break',startTime:'',endTime:'',isBreak:true}]}));
 }
 function updateSettingSlot(index,key,value){
  setSettingsForm(prev=>({...prev,scheduleSlots:prev.scheduleSlots.map((slot,i)=>i===index?{...slot,[key]:value}:slot)}));
 }
 function removeSettingSlot(index){
  setSettingsForm(prev=>({...prev,scheduleSlots:prev.scheduleSlots.filter((_,i)=>i!==index)}));
 }
 function moveSettingSlot(index,delta){
  setSettingsForm(prev=>{
   const next=[...prev.scheduleSlots],j=index+delta;
   if(j<0||j>=next.length)return prev;
   [next[index],next[j]]=[next[j],next[index]];
   return {...prev,scheduleSlots:next};
  });
 }
 async function saveTimetableSettings(e){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(settingsScope.scopeType!=='college'&&!settingsScope.scopeId){setError('Select the Branch, Wing, Program/Class or Section for this schedule.');setBusy(false);return;}
   const payload={...settingsForm,scopeType:settingsScope.scopeType,scopeId:settingsScope.scopeType==='college'?null:settingsScope.scopeId};
   const {data}=await api.post('/timetable/schedule-profiles',payload);
   const refreshed=await api.get('/timetable/options');
   setO(refreshed.data||{});
   setSettingsScope({scopeType:data.scopeType,scopeId:data.scopeType==='college'?'':profileScopeId(data)});
   setSettingsForm({
    name:data.name||'',
    scopeType:data.scopeType,
    scopeId:data.scopeType==='college'?'':profileScopeId(data),
    workingDays:Array.isArray(data.workingDays)?data.workingDays:[],
    scheduleSlots:Array.isArray(data.scheduleSlots)?data.scheduleSlots.map(s=>({
     label:s.label||'',startTime:s.startTime||'',endTime:s.endTime||'',isBreak:!!s.isBreak
    })):[]
   });
   setMessage(`${data.name||'Schedule'} saved.`);
  }catch(e2){setError(err(e2));}finally{setBusy(false);}
 }

 const selectedGridSection=useMemo(()=>o.sections.find(x=>x._id===view.sectionId)||null,[o.sections,view.sectionId]);
 const resolvedGridProfile=useMemo(()=>{
  if(!selectedGridSection)return null;
  const program=selectedGridSection.programId||{};
  const candidates=[
   ['section',selectedGridSection._id],
   ['program',oid(program)],
   ['wing',oid(program.wingId)],
   ['branch',oid(program.branchId)],
   ['college','']
  ];
  for(const [type,scopeId] of candidates){
   const hit=(o.profiles||[]).find(p=>p.scopeType===type&&(type==='college'||profileScopeId(p)===String(scopeId)));
   if(hit)return hit;
  }
  return null;
 },[o.profiles,o.sections,view.sectionId]);
 const resolvedGridSettings=resolvedGridProfile||(selectedGridSection?o.settings||{}:{});
 const slots=(resolvedGridSettings?.scheduleSlots||[]).filter(s=>!s.isBreak);
 const working=resolvedGridSettings?.workingDays||[];

 return <div className="tt-page">
  <div className="tt-head"><div><h1>Timetable</h1><p>Automatic timetable generation with college-wide teacher, class, room and constraint validation.</p></div></div>
  {error&&<div className="tt-error">{error}</div>}{message&&<div className="tt-success">{message}</div>}
  <div className="module-top-tabs tt-main-tabs">
   <button className={tab==='assignments'?'active':''} onClick={()=>setTab('assignments')}>Data &amp; Assignments</button>
   <button className={tab==='teachers'?'active':''} onClick={()=>setTab('teachers')}>Teachers</button>
   <button className={tab==='classes'?'active':''} onClick={()=>setTab('classes')}>Classes</button>
   <button className={tab==='rooms'?'active':''} onClick={()=>setTab('rooms')}>Rooms</button>
   <button className={tab==='generate'?'active':''} onClick={()=>setTab('generate')}>Generate</button>
   <button className={tab==='verification'?'active':''} onClick={()=>setTab('verification')}>Verification</button>
   <button className={tab==='timetable'?'active':''} onClick={()=>setTab('timetable')}>Timetable</button>
   <button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}>Reports</button>
   <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}>Settings</button>
  </div>

  {tab==='assignments'&&<section className="tt-panel">
   <div className="tt-section-head"><div><h2>Data &amp; Teacher Assignments</h2><p>Classes, sections and subjects come from Academics/Students. Allocate each subject to its teacher once; generation will place lessons automatically.</p></div></div>
   <div className="tt-class-filter">
    <label>Session<select value={selection.academicSessionId} onChange={e=>setSelection({academicSessionId:e.target.value,sectionId:''})}><option value="">Select Session</option>{o.sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
    <label>Class / Section<select value={selection.sectionId} disabled={!selection.academicSessionId} onChange={e=>setSelection(v=>({...v,sectionId:e.target.value}))}><option value="">Select Class / Section</option>{sessionSections.map(x=><option key={x._id} value={x._id}>{x.programId?.name} / {x.name}</option>)}</select></label>
   </div>
   {!selection.sectionId?<div className="tt-empty">Select a Session and Class / Section to load its subjects.</div>:
    !sectionCourses.length?<div className="tt-empty">No subjects are defined for this class/program and academic period.</div>:
    <>
     <div className="tt-bulk-bar"><label><input type="checkbox" checked={allSelected} onChange={e=>toggleAll(e.target.checked)}/> Select All Subjects</label><span>{selectedCount} of {sectionCourses.length} selected</span></div>
     <div className="tt-table-wrap"><table className="tt-table tt-assignment-table"><thead><tr><th className="tt-check-col">Select</th><th>Subject</th><th>Lessons / Week</th><th>Consecutive</th><th>Max / Day</th><th>Spread</th><th>Division</th><th>Teacher</th><th>Room</th></tr></thead><tbody>
      {sectionCourses.map(c=>{const row=subjectRows[c._id]||{};return <tr key={c._id} className={row.selected?'selected-row':''}>
       <td className="tt-check-col"><input type="checkbox" checked={!!row.selected} onChange={e=>updateRow(c._id,{selected:e.target.checked})}/></td>
       <td><strong>{c.name}</strong>{c.code&&<small>{c.code}</small>}</td>
       <td><input type="number" min="1" max="30" disabled={!row.selected} value={row.weeklyPeriods||5} onChange={e=>updateRow(c._id,{weeklyPeriods:e.target.value})}/></td>
       <td><select disabled={!row.selected} value={row.lessonSpan||1} onChange={e=>updateRow(c._id,{lessonSpan:e.target.value})}><option value="1">1</option><option value="2">2 (Double)</option><option value="3">3</option><option value="4">4</option></select></td>
       <td><input type="number" min="1" max="4" disabled={!row.selected} value={row.maxLessonsPerDay||1} onChange={e=>updateRow(c._id,{maxLessonsPerDay:e.target.value})}/></td>
       <td><input type="checkbox" disabled={!row.selected} checked={row.spreadAcrossWeek!==false} onChange={e=>updateRow(c._id,{spreadAcrossWeek:e.target.checked})}/></td>
       <td><select disabled={!row.selected} value={row.divisionId||''} onChange={e=>updateRow(c._id,{divisionId:e.target.value})}><option value="">Whole Section</option>{(o.divisions||[]).filter(d=>oid(d.sectionId)===selection.sectionId).map(d=><option key={d._id} value={d._id}>{d.name}</option>)}</select></td>
       <td><select disabled={!row.selected} value={row.teacherId||''} onChange={e=>updateRow(c._id,{teacherId:e.target.value})}><option value="">Select Teacher</option>{o.teachers.map(x=><option key={x._id} value={x._id}>{x.employeeNo} - {x.name}</option>)}</select></td>
       <td><select disabled={!row.selected} value={row.preferredRoom||''} onChange={e=>updateRow(c._id,{preferredRoom:e.target.value})}><option value="">Any / No Room</option>{(o.rooms||[]).map(r=><option key={r._id} value={r.name}>{r.name}</option>)}</select></td>
      </tr>;})}
     </tbody></table></div>
     <div className="tt-save-row"><button onClick={saveAssignments} disabled={busy||!selectedCount}>{busy?'Saving...':'Save Assignments'}</button></div>
    </>}
  </section>}

  {tab==='grid'&&<section className="tt-panel">
   <div className="tt-filter">
    <select value={view.academicSessionId} onChange={e=>setView({...view,academicSessionId:e.target.value,sectionId:''})}><option value="">Session</option>{o.sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
    <select value={view.sectionId} onChange={e=>setView({...view,sectionId:e.target.value})}><option value="">Select Class / Section</option>{o.sections.filter(x=>!view.academicSessionId||oid(x.academicSessionId)===view.academicSessionId).map(x=><option key={x._id} value={x._id}>{x.programId?.name} / {x.name}</option>)}</select>
    <button onClick={async()=>{const r=await api.get('/timetable/validate');setMessage(r.data.valid?'Timetable has no conflicts.':r.data.issues.join(', '));}}>Validate</button>
   </div>
   {!view.sectionId
    ?<div className="tt-empty">Select a Class / Section to load its timetable and applicable schedule.</div>
    :!slots.length
      ?<div className="tt-empty">No schedule is configured for this class. Define a College, Branch, Wing, Program/Class or Section schedule in <strong>Timetable → Settings</strong>.</div>
      :<>
       <div className="tt-grid-profile-note">Schedule: <strong>{resolvedGridProfile?.name||'College Default (legacy)'}</strong>{resolvedGridProfile&&<> • Scope: {profileScopeLabel(resolvedGridProfile)}</>}</div>
       <div className="tt-grid-wrap"><table className="tt-grid"><thead><tr><th>Day</th>{slots.map(s=><th key={s.periodNo}>{s.label}<small>{s.startTime}-{s.endTime}</small></th>)}</tr></thead><tbody>{working.map(d=><tr key={d}><th>{DAYS.find(x=>x[0]===d)?.[1]||d}</th>{slots.map(s=>{const row=grid.find(g=>g.dayOfWeek===dayNumber(d)&&g.startMinutes===((+s.startTime.slice(0,2))*60+(+s.startTime.slice(3,5))));return <td key={s.periodNo}>{row?<div className="tt-lesson"><strong>{row.courseId?.name}</strong><span>{row.sectionId?.name} • {row.teacherId?.name}</span></div>:<select defaultValue="" onChange={e=>{const a=assignments.find(x=>x._id===e.target.value);if(a)place(a,d,s.periodNo);e.target.value='';}}><option value="">+ Lesson</option>{assignments.filter(a=>oid(a.sectionId)===view.sectionId&&oid(a.academicSessionId)===view.academicSessionId).map(a=><option key={a._id} value={a._id}>{a.courseId?.name} — {a.teacherId?.name}</option>)}</select>}</td>})}</tr>)}</tbody></table></div>
      </>}
  </section>}

  {tab==='timetable'&&<TimetableWholeView options={o}/>}
  {tab==='teachers'&&<TimetableTeachersTab options={o}/>}
  {tab==='classes'&&<TimetableClassesTab options={o} assignments={assignments}/>}

  {tab==='generate'&&<TimetableGenerator options={o} onChanged={async()=>{await load();await loadGrid();}}/>}
  {tab==='verification'&&<TimetableVerification options={o}/>}
  {tab==='reports'&&<TimetableReports options={o}/>}

  {tab==='settings'&&<section className="tt-panel tt-settings-panel">
   <div className="tt-section-head"><div><h2>Timetable Settings</h2><p>Create schedule profiles so different branches, wings, classes/programs or individual sections can use different start/end times and periods.</p></div></div>
   <div className="tt-settings-priority">Resolution priority: <strong>Section → Program/Class → Wing → Branch → College Default</strong></div>
   <form className="tt-settings-form" onSubmit={saveTimetableSettings}>
    <div className="tt-settings-scope">
     <label><span>Schedule Scope</span><select value={settingsScope.scopeType} onChange={e=>loadSettingsScope(e.target.value,'')}><option value="college">College Default</option><option value="branch">Branch</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select></label>
     {settingsScope.scopeType!=='college'&&<label><span>Select {settingsScope.scopeType==='program'?'Program / Class':settingsScope.scopeType.charAt(0).toUpperCase()+settingsScope.scopeType.slice(1)}</span><select required value={settingsScope.scopeId} onChange={e=>loadSettingsScope(settingsScope.scopeType,e.target.value)}><option value="">Select...</option>{scopeOptions(settingsScope.scopeType).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
     <label><span>Schedule Name</span><input required value={settingsForm.name||''} placeholder="e.g. BSCS 09:00–15:30" onChange={e=>setSettingsForm({...settingsForm,name:e.target.value})}/></label>
    </div>
    <div className="tt-settings-block">
     <h3>Working Days</h3>
     <div className="tt-working-days">{DAYS.map(([value,label])=><label key={value}><input type="checkbox" checked={(settingsForm.workingDays||[]).includes(value)} onChange={()=>toggleWorkingDay(value)}/><span>{label}</span></label>)}</div>
    </div>
    <div className="tt-settings-block">
     <div className="tt-settings-title"><div><h3>Period Definitions</h3><p>Each schedule can have its own start time, end time, periods and breaks.</p></div><div><button type="button" onClick={addSettingPeriod}>+ Add Period</button><button type="button" className="tt-secondary" onClick={addSettingBreak}>+ Add Break</button></div></div>
     <div className="tt-setting-slots">
      {(settingsForm.scheduleSlots||[]).map((slot,index)=><div className={`tt-setting-slot ${slot.isBreak?'is-break':''}`} key={`${index}-${slot.label}`}>
       <strong>{index+1}</strong>
       <input value={slot.label||''} placeholder={slot.isBreak?'Break name':'Period name'} onChange={e=>updateSettingSlot(index,'label',e.target.value)}/>
       <input type="time" value={slot.startTime||''} onChange={e=>updateSettingSlot(index,'startTime',e.target.value)}/>
       <input type="time" value={slot.endTime||''} onChange={e=>updateSettingSlot(index,'endTime',e.target.value)}/>
       <span className="tt-slot-type">{slot.isBreak?'Break':'Teaching'}</span>
       <button type="button" className="tt-icon-button" onClick={()=>moveSettingSlot(index,-1)} title="Move up">↑</button>
       <button type="button" className="tt-icon-button" onClick={()=>moveSettingSlot(index,1)} title="Move down">↓</button>
       <button type="button" className="tt-link-button" onClick={()=>removeSettingSlot(index)}>Remove</button>
      </div>)}
      {!(settingsForm.scheduleSlots||[]).length&&<div className="tt-empty">No periods defined for this scope. Add periods or choose another scope to edit its profile.</div>}
     </div>
    </div>
    <div className="tt-save-row"><button disabled={busy}>{busy?'Saving...':'Save Schedule Profile'}</button></div>
   </form>
   <div className="tt-settings-block"><h3>Configured Schedule Profiles</h3><div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Name</th><th>Scope</th><th>Day Start</th><th>Day End</th><th>Teaching Periods</th><th>Working Days</th><th></th></tr></thead><tbody>{(o.profiles||[]).map(p=><tr key={p._id}><td>{p.name}</td><td>{profileScopeLabel(p)}</td><td>{p.dayStartTime||'—'}</td><td>{p.dayEndTime||'—'}</td><td>{p.periodsPerDay||0}</td><td>{(p.workingDays||[]).map(d=>DAYS.find(x=>x[0]===d)?.[1]?.slice(0,3)||d).join(', ')}</td><td><button type="button" onClick={()=>loadSettingsScope(p.scopeType,profileScopeId(p))}>Edit</button></td></tr>)}{!(o.profiles||[]).length&&<tr><td colSpan="7">No saved schedule profiles yet. The old college-wide timetable settings will continue as fallback until a College Default profile is saved.</td></tr>}</tbody></table></div></div>
  </section>}

  {tab==='rooms'&&<section className="tt-panel"><h2>Rooms</h2><form className="tt-room-form" onSubmit={addRoom}><input required placeholder="Room / Lab name" value={room.name} onChange={e=>setRoom({...room,name:e.target.value})}/><input placeholder="Code" value={room.code} onChange={e=>setRoom({...room,code:e.target.value})}/><input type="number" min="1" value={room.capacity} onChange={e=>setRoom({...room,capacity:e.target.value})}/><button>Add Room</button></form><table className="tt-table"><thead><tr><th>Room</th><th>Code</th><th>Capacity</th></tr></thead><tbody>{o.rooms.map(r=><tr key={r._id}><td>{r.name}</td><td>{r.code||'—'}</td><td>{r.capacity}</td></tr>)}</tbody></table></section>}
 </div>;
}
