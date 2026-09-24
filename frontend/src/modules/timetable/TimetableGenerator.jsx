import {useMemo,useState} from 'react';
import api from '../../api/client';

const err=e=>e?.response?.data?.error||e?.message||'Request failed';
const oid=v=>String(v?._id||v||'');
const dayName=n=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(n)]||'';
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;

export default function TimetableGenerator({options,onChanged}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[form,setForm]=useState({academicSessionId:current,scopeType:'college',scopeId:'',mode:'generate_new',defaultTeacherMaxDaily:6,maxSameSubjectPerDay:1});
 const[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const scopeOptions=useMemo(()=>{
  if(form.scopeType==='wing')return (options.wings||[]).map(x=>[x._id,x.name]);
  if(form.scopeType==='program')return (options.programs||[]).map(x=>[x._id,x.name]);
  if(form.scopeType==='section')return (options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Program'} / ${x.name}`]);
  return[];
 },[form.scopeType,options]);
 async function previewOnly(){setBusy(true);setError('');setMessage('');try{const r=await api.post('/timetable/generate/preview',form);setPreview(r.data);}catch(e){setError(err(e));}finally{setBusy(false);}}
 async function generateAndPlace(){setBusy(true);setError('');setMessage('');try{
  const r=await api.post('/timetable/generate/preview',form);setPreview(r.data);
  if(r.data?.conflicts?.length){setError('Generation has hard conflicts. Review constraints and run again.');return;}
  if(!r.data?.draft?.length){setMessage('No new lessons need placement for this scope and mode.');return;}
  const saved=await api.post('/timetable/generate/commit',{academicSessionId:form.academicSessionId,mode:form.mode,draft:r.data.draft});
  setMessage(`${saved.data?.message||'Generated timetable saved.'} Verify before publishing.`);
  onChanged?.();
 }catch(e){setError(err(e));}finally{setBusy(false);}}
 async function publish(){setBusy(true);try{const r=await api.post('/timetable/generate/publish',form);setMessage(`${r.data?.published||0} lesson(s) published.`);onChanged?.();}catch(e){setError(err(e));}finally{setBusy(false);}}
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Automatic Timetable Generator</h2><p>Generate a whole-college, wing, program/class or section timetable. Teacher conflicts are always checked across the entire college.</p></div></div>
  {error&&<div className="tt-error">{error}</div>}{message&&<div className="tt-success">{message}</div>}
  <div className="tt-generator-form">
   <label><span>Academic Session</span><select value={form.academicSessionId} onChange={e=>setForm({...form,academicSessionId:e.target.value})}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
   <label><span>Generate For</span><select value={form.scopeType} onChange={e=>setForm({...form,scopeType:e.target.value,scopeId:''})}><option value="college">Whole College</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select></label>
   {form.scopeType!=='college'&&<label><span>Select Scope</span><select required value={form.scopeId} onChange={e=>setForm({...form,scopeId:e.target.value})}><option value="">Select...</option>{scopeOptions.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select></label>}
   <label><span>Generation Mode</span><select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}><option value="generate_new">Generate New</option><option value="improve">Improve Existing</option><option value="regenerate_unlocked">Regenerate Unlocked</option><option value="missing_only">Generate Missing Only</option></select></label>
   <label><span>Default Teacher Max / Day</span><input type="number" min="1" max="12" value={form.defaultTeacherMaxDaily} onChange={e=>setForm({...form,defaultTeacherMaxDaily:e.target.value})}/></label>
   <label><span>Same Subject Max / Day</span><input type="number" min="1" max="3" value={form.maxSameSubjectPerDay} onChange={e=>setForm({...form,maxSameSubjectPerDay:e.target.value})}/></label>
   <div className="tt-generator-command-row"><button type="button" className="tt-secondary" onClick={previewOnly} disabled={busy||!form.academicSessionId||(form.scopeType!=='college'&&!form.scopeId)}>Preview</button><button type="button" onClick={generateAndPlace} disabled={busy||!form.academicSessionId||(form.scopeType!=='college'&&!form.scopeId)}>{busy?'Generating...':'Generate & Place Allocated Teachers'}</button></div>
  </div>
  <div className="tt-generator-note">Classes, sections, subjects and teachers come from Academics / Students / Employees. The generator places the allocated teachers automatically. Published, locked and manual lessons remain fixed; generated lessons are saved as <strong>Draft</strong>.</div>
  {preview&&<>
   <div className="tt-generator-summary"><div><small>Sections</small><strong>{preview.sections}</strong></div><div><small>Assignments</small><strong>{preview.assignments}</strong></div><div><small>Generated Lessons</small><strong>{preview.summary?.generatedLessons||0}</strong></div><div><small>Unallocated</small><strong>{preview.summary?.unallocatedLessons||0}</strong></div><div><small>Conflicts</small><strong>{preview.conflicts?.length||0}</strong></div><div><small>Quality</small><strong>{preview.quality?.score??'—'}%</strong></div></div>
   <div className="tt-generator-actions"><button type="button" className="tt-secondary" onClick={publish} disabled={busy}>Publish Verified Draft</button></div>
   {!!preview.unallocated?.length&&<div className="tt-settings-block"><h3>Unallocated Lessons</h3><div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Remaining</th><th>Reason</th></tr></thead><tbody>{preview.unallocated.map((x,i)=><tr key={`${x.assignmentId}-${i}`}><td>{x.section}</td><td>{x.course}</td><td>{x.teacher}</td><td>{x.remaining}</td><td>{x.reason}</td></tr>)}</tbody></table></div></div>}
   <div className="tt-settings-block"><h3>Generated Draft Preview</h3><div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Day</th><th>Time</th></tr></thead><tbody>{(preview.draft||[]).slice(0,250).map((x,i)=><tr key={`${x.teacherAssignmentId}-${i}`}><td>{x.programName} / {x.sectionName}</td><td>{x.courseName}</td><td>{x.teacherName}</td><td>{dayName(x.dayOfWeek)}</td><td>{hm(x.startMinutes)}-{hm(x.endMinutes)}</td></tr>)}</tbody></table></div>{preview.draft?.length>250&&<p className="tt-muted">Showing first 250 generated lessons.</p>}</div>
  </>}
 </section>;
}
