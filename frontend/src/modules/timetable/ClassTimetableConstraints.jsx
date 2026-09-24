import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';
const DAYS=[['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday'],['0','Sunday']];
const toMin=v=>{const[h,m]=String(v||'00:00').split(':').map(Number);return h*60+m};
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const oid=v=>String(v?._id||v||'');
const msg=e=>e?.response?.data?.error||e?.message||'Request failed';

export default function ClassTimetableConstraints({options}){
 const[rows,setRows]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const[form,setForm]=useState({applyTo:'single',sectionId:'',sectionIds:[],programId:'',wingId:'',type:'unavailable',dayOfWeek:'1',startTime:'08:00',endTime:'09:00',relativePosition:'last',relativeCount:2,maxPeriodsPerDay:8,maxConsecutivePeriods:4,note:''});
 async function load(){const r=await api.get('/timetable/class-constraints');setRows(Array.isArray(r.data)?r.data:[])}
 useEffect(()=>{load().catch(e=>setError(msg(e)))},[]);
 const sections=options.sections||[];
 function toggleSection(id){setForm(f=>({...f,sectionIds:f.sectionIds.includes(id)?f.sectionIds.filter(x=>x!==id):[...f.sectionIds,id]}))}
 async function save(e){e.preventDefault();setError('');setNotice('');try{
  const payload={...form,dayOfWeek:Number(form.dayOfWeek),startMinutes:toMin(form.startTime),endMinutes:toMin(form.endTime),relativeCount:Number(form.relativeCount||1)};
  const r=await api.post('/timetable/class-constraints',payload);setNotice(`Constraint applied to ${r.data?.appliedTo||1} class/section(s).`);await load();
 }catch(e2){setError(msg(e2))}}
 async function remove(r){try{if(r.batchId&&r.sourceScopeType!=='single')await api.delete(`/timetable/class-constraint-batches/${r.batchId}`);else await api.delete(`/timetable/class-constraints/${r._id}`);await load()}catch(e){setError(msg(e))}}
 const grouped=useMemo(()=>{const seen=new Set();return rows.filter(r=>{const k=r.batchId||r._id;if(seen.has(k))return false;seen.add(k);return true})},[rows]);
 const scopeLabel=r=>r.sourceScopeType==='all'?'All Classes':r.sourceScopeType==='wing'?'Wing':r.sourceScopeType==='program'?'Program / Class':r.sourceScopeType==='multiple'?'Multiple Sections':r.sectionId?.name||'Section';
 return <section className="tt-panel"><div className="tt-section-head"><div><h2>Class Constraints</h2><p>Create a rule once and apply it to one section, multiple sections, a program/class, a wing, or every class.</p></div></div>
 {error&&<div className="tt-error">{error}</div>}{notice&&<div className="tt-success">{notice}</div>}
 <form className="tt-constraint-form tt-class-constraint-form" onSubmit={save}>
  <label><span>Apply To</span><select value={form.applyTo} onChange={e=>setForm({...form,applyTo:e.target.value})}><option value="single">Single Section</option><option value="multiple">Multiple Sections</option><option value="program">Program / Class</option><option value="wing">Wing</option><option value="all">All Classes</option></select></label>
  {form.applyTo==='single'&&<label><span>Class / Section</span><select required value={form.sectionId} onChange={e=>setForm({...form,sectionId:e.target.value})}><option value="">Select...</option>{sections.map(s=><option key={s._id} value={s._id}>{s.programId?.name} / {s.name}</option>)}</select></label>}
  {form.applyTo==='program'&&<label><span>Program / Class</span><select required value={form.programId} onChange={e=>setForm({...form,programId:e.target.value})}><option value="">Select...</option>{(options.programs||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>}
  {form.applyTo==='wing'&&<label><span>Wing</span><select required value={form.wingId} onChange={e=>setForm({...form,wingId:e.target.value})}><option value="">Select...</option>{(options.wings||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>}
  <label><span>Rule</span><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="unavailable">Unavailable Time</option><option value="relative_unavailable">First / Last Teaching Periods OFF</option><option value="preferred">Preferred Time</option><option value="max_daily">Maximum Periods / Day</option><option value="max_consecutive">Maximum Consecutive Periods</option></select></label>
  {form.type==='max_daily'?<label><span>Max / Day</span><input type="number" min="1" max="20" value={form.maxPeriodsPerDay} onChange={e=>setForm({...form,maxPeriodsPerDay:e.target.value})}/></label>:form.type==='max_consecutive'?<label><span>Max Consecutive</span><input type="number" min="1" max="12" value={form.maxConsecutivePeriods} onChange={e=>setForm({...form,maxConsecutivePeriods:e.target.value})}/></label>:form.type==='relative_unavailable'?<><label><span>Day</span><select value={form.dayOfWeek} onChange={e=>setForm({...form,dayOfWeek:e.target.value})}>{DAYS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label><label><span>Position</span><select value={form.relativePosition} onChange={e=>setForm({...form,relativePosition:e.target.value})}><option value="first">First Teaching Period(s)</option><option value="last">Last Teaching Period(s)</option></select></label><label><span>Number of Periods</span><input type="number" min="1" max="12" value={form.relativeCount} onChange={e=>setForm({...form,relativeCount:e.target.value})}/></label></>:<><label><span>Day</span><select value={form.dayOfWeek} onChange={e=>setForm({...form,dayOfWeek:e.target.value})}>{DAYS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label><label><span>From</span><input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})}/></label><label><span>To</span><input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})}/></label></>}
  <label><span>Note</span><input placeholder="e.g. Friday prayer / early closing" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
  <button>Apply Constraint</button>
 </form>
 {form.applyTo==='multiple'&&<div className="tt-multi-section-picker"><strong>Select Sections</strong><div>{sections.map(s=><label key={s._id}><input type="checkbox" checked={form.sectionIds.includes(s._id)} onChange={()=>toggleSection(s._id)}/><span>{s.programId?.name} / {s.name}</span></label>)}</div></div>}
 <div className="tt-inline-note">Example: choose <strong>All Classes → First / Last Teaching Periods OFF → Friday → Last → 2</strong>. The generator blocks each class's own last two teaching periods, even when classes use different schedule profiles/timings.</div>
 <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Applied To</th><th>Rule</th><th>When / Limit</th><th>Note</th><th></th></tr></thead><tbody>
 {grouped.map(r=><tr key={r.batchId||r._id}><td>{scopeLabel(r)}</td><td>{r.type==='relative_unavailable'?'Teaching Periods OFF':String(r.type).replaceAll('_',' ')}</td><td>{r.type==='relative_unavailable'?`${DAYS.find(x=>Number(x[0])===Number(r.dayOfWeek))?.[1]} — ${r.relativePosition==='first'?'First':'Last'} ${r.relativeCount} period(s)`:r.type==='max_daily'?r.maxPeriodsPerDay:r.type==='max_consecutive'?r.maxConsecutivePeriods:`${DAYS.find(x=>Number(x[0])===Number(r.dayOfWeek))?.[1]} ${hm(r.startMinutes)}-${hm(r.endMinutes)}`}</td><td>{r.note||'—'}</td><td><button type="button" className="tt-link-button" onClick={()=>remove(r)}>Remove</button></td></tr>)}
 {!grouped.length&&<tr><td colSpan="5">No class constraints configured.</td></tr>}</tbody></table></div>
 </section>
}
