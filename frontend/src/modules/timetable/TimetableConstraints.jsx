import {useEffect,useState} from 'react';
import api from '../../api/client';

const DAYS=[['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday'],['0','Sunday']];
const toMin=v=>{const[h,m]=String(v||'00:00').split(':').map(Number);return (h||0)*60+(m||0);};
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const err=e=>e?.response?.data?.error||e?.message||'Request failed';

export default function TimetableConstraints({options}){
 const[rows,setRows]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 const[form,setForm]=useState({teacherId:'',type:'unavailable',dayOfWeek:'1',startTime:'08:00',endTime:'09:00',maxPeriodsPerDay:6,maxConsecutivePeriods:4,note:''});
 async function load(){try{const r=await api.get('/timetable/constraints');setRows(Array.isArray(r.data)?r.data:[]);}catch(e){setError(err(e));}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();setError('');setMessage('');try{
  const payload={...form,dayOfWeek:Number(form.dayOfWeek),startMinutes:toMin(form.startTime),endMinutes:toMin(form.endTime),maxPeriodsPerDay:Number(form.maxPeriodsPerDay||6),maxConsecutivePeriods:Number(form.maxConsecutivePeriods||4)};
  await api.post('/timetable/constraints',payload);setMessage('Constraint saved.');await load();
 }catch(e2){setError(err(e2));}}
 async function remove(id){try{await api.delete(`/timetable/constraints/${id}`);await load();}catch(e){setError(err(e));}}
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Constraints</h2><p>Teacher rules are college-wide, so a teacher teaching in different wings cannot be scheduled in two places at the same time.</p></div></div>
  {error&&<div className="tt-error">{error}</div>}{message&&<div className="tt-success">{message}</div>}
  <form className="tt-constraint-form" onSubmit={save}>
   <label><span>Teacher</span><select required value={form.teacherId} onChange={e=>setForm({...form,teacherId:e.target.value})}><option value="">Select Teacher</option>{(options.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select></label>
   <label><span>Rule</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="unavailable">Unavailable</option><option value="preferred">Preferred Time</option><option value="max_daily">Maximum Periods / Day</option><option value="max_consecutive">Maximum Consecutive Periods</option><option value="avoid_first">Prefer Avoid First Period</option><option value="avoid_last">Prefer Avoid Last Period</option></select></label>
   {form.type==='max_daily'?<label><span>Max Periods / Day</span><input type="number" min="1" max="20" value={form.maxPeriodsPerDay} onChange={e=>setForm({...form,maxPeriodsPerDay:e.target.value})}/></label>:form.type==='max_consecutive'?<label><span>Max Consecutive</span><input type="number" min="1" max="12" value={form.maxConsecutivePeriods} onChange={e=>setForm({...form,maxConsecutivePeriods:e.target.value})}/></label>:['avoid_first','avoid_last'].includes(form.type)?<div className="tt-inline-note">{form.type==='avoid_first'?'Generator will prefer not to place this teacher in the first teaching period.':'Generator will prefer not to place this teacher in the last teaching period.'}</div>:<>
    <label><span>Day</span><select value={form.dayOfWeek} onChange={e=>setForm({...form,dayOfWeek:e.target.value})}>{DAYS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label><span>From</span><input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})}/></label>
    <label><span>To</span><input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})}/></label>
   </>}
   <label className="tt-constraint-note"><span>Note</span><input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Optional"/></label>
   <button>Save Rule</button>
  </form>
  <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Teacher</th><th>Rule</th><th>Day / Time</th><th>Note</th><th></th></tr></thead><tbody>
   {rows.map(r=><tr key={r._id}><td>{r.teacherId?.employeeNo} - {r.teacherId?.name}</td><td>{r.type==='max_daily'?`Max ${r.maxPeriodsPerDay}/day`:r.type==='max_consecutive'?`Max ${r.maxConsecutivePeriods} consecutive`:r.type==='avoid_first'?'Avoid first period':r.type==='avoid_last'?'Avoid last period':r.type==='preferred'?'Preferred':'Unavailable'}</td><td>{['max_daily','max_consecutive','avoid_first','avoid_last'].includes(r.type)?'All working days':`${DAYS.find(x=>Number(x[0])===Number(r.dayOfWeek))?.[1]||'—'} ${hm(r.startMinutes)}-${hm(r.endMinutes)}`}</td><td>{r.note||'—'}</td><td><button type="button" className="tt-link-button" onClick={()=>remove(r._id)}>Remove</button></td></tr>)}
   {!rows.length&&<tr><td colSpan="5">No teacher constraints configured.</td></tr>}
  </tbody></table></div>
 </section>;
}
