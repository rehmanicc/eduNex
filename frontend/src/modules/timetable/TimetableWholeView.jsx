import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const err=e=>e?.response?.data?.error||e?.message||'Request failed';

export default function TimetableWholeView({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[filter,setFilter]=useState({academicSessionId:current,scopeType:'college',scopeId:'',teacherId:''});
 const[rows,setRows]=useState([]),[error,setError]=useState('');
 const scopes=useMemo(()=>{
  if(filter.scopeType==='wing')return (options.wings||[]).map(x=>[x._id,x.name]);
  if(filter.scopeType==='program')return (options.programs||[]).map(x=>[x._id,x.name]);
  if(filter.scopeType==='section')return (options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Program'} / ${x.name}`]);
  return[];
 },[filter.scopeType,options]);
 async function load(){if(!filter.academicSessionId)return;try{const r=await api.get('/timetable/whole-grid',{params:filter});setRows(Array.isArray(r.data)?r.data:[]);setError('');}catch(e){setError(err(e));}}
 async function toggleLock(row){try{await api.put(`/timetable/grid/${row._id}/lock`,{isLocked:!row.isLocked});await load();}catch(e){setError(err(e));}}
 useEffect(()=>{load();},[filter.academicSessionId,filter.scopeType,filter.scopeId,filter.teacherId]);
 const sectionGroups=useMemo(()=>{
  const map=new Map();
  rows.forEach(r=>{const key=oid(r.sectionId);if(!map.has(key))map.set(key,{section:r.sectionId,rows:[]});map.get(key).rows.push(r);});
  return [...map.values()].sort((a,b)=>String(a.section?.programId?.name||'').localeCompare(String(b.section?.programId?.name||''))||String(a.section?.name||'').localeCompare(String(b.section?.name||'')));
 },[rows]);
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Whole Timetable</h2><p>View college, wing, program/class, section or teacher schedules in one place.</p></div></div>
  {error&&<div className="tt-error">{error}</div>}
  <div className="tt-whole-filter">
   <select value={filter.academicSessionId} onChange={e=>setFilter({...filter,academicSessionId:e.target.value})}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select>
   <select value={filter.scopeType} onChange={e=>setFilter({...filter,scopeType:e.target.value,scopeId:''})}><option value="college">Whole College</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select>
   {filter.scopeType!=='college'&&<select value={filter.scopeId} onChange={e=>setFilter({...filter,scopeId:e.target.value})}><option value="">All / Select</option>{scopes.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select>}
   <select value={filter.teacherId} onChange={e=>setFilter({...filter,teacherId:e.target.value})}><option value="">All Teachers</option>{(options.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select>
  </div>
  <div className="tt-whole-table-wrap"><table className="tt-table tt-whole-table"><thead><tr><th>Class / Section</th>{DAYS.slice(1,7).concat(DAYS[0]).map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>
   {sectionGroups.map(g=><tr key={oid(g.section)}><th>{g.section?.programId?.name||'Program'} / {g.section?.name}</th>{[1,2,3,4,5,6,0].map(day=><td key={day}>{g.rows.filter(r=>Number(r.dayOfWeek)===day).sort((a,b)=>a.startMinutes-b.startMinutes).map(r=><div className={`tt-whole-lesson ${r.isLocked?'locked':''}`} key={r._id}><strong>{hm(r.startMinutes)} {r.courseId?.code||r.courseId?.name}</strong><span>{r.teacherId?.name}</span><small>{r.generationStatus||'draft'} • {r.source||'manual'}</small><button type="button" className="tt-lock-button" onClick={()=>toggleLock(r)}>{r.isLocked?'🔒 Locked':'🔓 Lock'}</button></div>)}</td>)}</tr>)}
   {!sectionGroups.length&&<tr><td colSpan="8">No timetable lessons found for this selection.</td></tr>}
  </tbody></table></div>
 </section>;
}
