import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const DAYS=[['Monday',1],['Tuesday',2],['Wednesday',3],['Thursday',4],['Friday',5],['Saturday',6],['Sunday',0]];
const err=e=>e?.response?.data?.error||e?.message||'Request failed';
const minutes=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;};

export default function TimetableWholeView({options,generator,verification}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[filter,setFilter]=useState({academicSessionId:current,scopeType:'college',scopeId:'',teacherId:''});
 const[rows,setRows]=useState([]),[error,setError]=useState(''),[busyLock,setBusyLock]=useState(false);
 const[open,setOpen]=useState(true),[selected,setSelected]=useState(null),[tool,setTool]=useState('');
 const scopes=useMemo(()=>{if(filter.scopeType==='wing')return(options.wings||[]).map(x=>[x._id,x.name]);if(filter.scopeType==='program')return(options.programs||[]).map(x=>[x._id,x.name]);if(filter.scopeType==='section')return(options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Program'} / ${x.name}`]);return[];},[filter.scopeType,options]);
 async function load(){if(!filter.academicSessionId)return;try{const r=await api.get('/timetable/whole-grid',{params:filter});setRows(Array.isArray(r.data)?r.data:[]);setError('');}catch(e){setError(err(e));}}
 async function setLocks(items,value){if(!items.length)return;setBusyLock(true);setError('');try{await api.put('/timetable/grid/bulk-lock',{ids:items.map(r=>r._id),isLocked:value});await load();setSelected(s=>s?{...s,isLocked:value}:s);}catch(e){setError(err(e));}finally{setBusyLock(false);}}
 async function toggleLock(row){await setLocks([row],!row.isLocked);}
 useEffect(()=>{
  if(!filter.academicSessionId&&current){
   setFilter(f=>({...f,academicSessionId:current}));
   return;
  }
  load();
 },[current,filter.academicSessionId,filter.scopeType,filter.scopeId,filter.teacherId]);
 const sectionGroups=useMemo(()=>{const map=new Map();rows.forEach(r=>{const key=oid(r.sectionId);if(!map.has(key))map.set(key,{section:r.sectionId,rows:[]});map.get(key).rows.push(r);});return[...map.values()].sort((a,b)=>String(a.section?.name||'').localeCompare(String(b.section?.name||'')));},[rows]);
 const configuredStarts=useMemo(()=>[...new Set((options.settings?.scheduleSlots||[]).filter(s=>!s.isBreak&&s.type!=='break').map(s=>minutes(s.startTime)).filter(Number.isFinite))].sort((a,b)=>a-b),[options.settings]);
 const startsByDay=useMemo(()=>{const out={};for(const[,day]of DAYS){const actual=[...new Set(rows.filter(r=>Number(r.dayOfWeek)===day).map(r=>Number(r.startMinutes)).filter(Number.isFinite))].sort((a,b)=>a-b);out[day]=configuredStarts.length?configuredStarts:actual;}return out;},[rows,configuredStarts]);
 const visibleDays=DAYS.filter(([,d])=>startsByDay[d]?.length&&rows.some(r=>Number(r.dayOfWeek)===d));
 const totalPeriods=visibleDays.reduce((n,[,d])=>n+startsByDay[d].length,0);
 const toggleRow=async g=>{const allLocked=g.rows.length&&g.rows.every(r=>r.isLocked);await setLocks(g.rows,!allLocked);};
 const togglePeriod=async(day,start)=>{const items=rows.filter(r=>Number(r.dayOfWeek)===day&&Number(r.startMinutes)===start);const allLocked=items.length&&items.every(r=>r.isLocked);await setLocks(items,!allLocked);};
 const close=()=>{setOpen(false);setSelected(null);setTool('');};
 const publish=async()=>{if(!filter.academicSessionId)return;try{const r=await api.post('/timetable/generate/publish',{academicSessionId:filter.academicSessionId});setError(r.data?.message||`Published ${r.data?.published||0} lesson(s).`);await load();}catch(e){setError(err(e));}};
 const workspace=<div className="tt-workspace-shell" role="dialog" aria-modal="true" aria-label="Whole timetable workspace">
  <div className="tt-workspace-toolbar">
   <div><h2>Whole Timetable</h2><p>Section × day/period view. Select a card to see its details below.</p></div>
  </div>
  {error&&<div className="tt-error">{error}</div>}
  <div className="tt-workspace-filters">
   <div className="tt-workspace-filter-controls">
    <select value={filter.academicSessionId} onChange={e=>setFilter({...filter,academicSessionId:e.target.value})}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select>
    <select value={filter.scopeType} onChange={e=>setFilter({...filter,scopeType:e.target.value,scopeId:''})}><option value="college">Whole College</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select>
    {filter.scopeType!=='college'&&<select value={filter.scopeId} onChange={e=>setFilter({...filter,scopeId:e.target.value})}><option value="">All / Select</option>{scopes.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select>}
    <select value={filter.teacherId} onChange={e=>setFilter({...filter,teacherId:e.target.value})}><option value="">All Teachers</option>{(options.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select>
   </div>
   <div className="tt-workspace-actions"><button type="button" className={tool==='generate'?'active':''} onClick={()=>setTool(tool==='generate'?'':'generate')}>Generate / Regenerate</button><button type="button" className={tool==='verification'?'active':''} onClick={()=>setTool(tool==='verification'?'':'verification')}>Verification</button><button type="button" onClick={publish}>Publish Verified Draft</button><button type="button" className="tt-secondary" disabled={busyLock||!rows.some(r=>r.isLocked)} onClick={()=>setLocks(rows.filter(r=>r.isLocked),false)}>🔓 Unlock All</button><button type="button" className="tt-workspace-close" onClick={close} title="Close">×</button></div>
  </div>
  {tool&&<div className="tt-workspace-toolpanel"><div className="tt-toolpanel-head"><strong>{tool==='generate'?'Generate / Regenerate':'Verification'}</strong><button type="button" onClick={()=>setTool('')}>×</button></div><div className="tt-toolpanel-body">{tool==='generate'?generator:verification}</div></div>}
  <div className="tt-workspace-grid"><table className="tt-asc-table"><thead><tr><th rowSpan="2" className="tt-asc-corner">Section</th>{visibleDays.map(([name,day])=><th key={day} colSpan={startsByDay[day].length} className="tt-asc-day">{name}</th>)}</tr><tr>{visibleDays.flatMap(([,day])=>startsByDay[day].map((start,i)=>{const items=rows.filter(r=>Number(r.dayOfWeek)===day&&Number(r.startMinutes)===start),locked=items.length&&items.every(r=>r.isLocked);return <th key={`${day}-${start}`} className={`tt-asc-period ${locked?'locked':''}`} onClick={()=>!busyLock&&togglePeriod(day,start)} title={`${hm(start)} — click to ${locked?'unlock':'lock'} column`}><span>{i+1}</span></th>}))}</tr></thead><tbody>
   {sectionGroups.map(g=>{const rowLocked=g.rows.length&&g.rows.every(r=>r.isLocked);return <tr key={oid(g.section)}><th className={`tt-asc-section ${rowLocked?'locked':''}`} onClick={()=>!busyLock&&toggleRow(g)} title={`Click to ${rowLocked?'unlock':'lock'} row`}><span>{g.section?.name||'Section'}</span>{rowLocked&&<small>🔒</small>}</th>{visibleDays.flatMap(([,day])=>startsByDay[day].map(start=>{const cards=g.rows.filter(r=>Number(r.dayOfWeek)===day&&Number(r.startMinutes)===start);return <td key={`${day}-${start}`} className="tt-asc-cell">{cards.map(r=><button type="button" key={r._id} className={`tt-asc-card ${r.isLocked?'locked':''} ${oid(selected)===oid(r)?'selected':''}`} onClick={()=>setSelected(r)} title={`${r.courseId?.name||''} — ${r.teacherId?.name||''}`}><span className="tt-asc-subject">{r.courseId?.code||r.courseId?.name||'Subject'}</span>{r.isLocked&&<small>🔒</small>}</button>)}</td>}))}</tr>})}
   {!sectionGroups.length&&<tr><td colSpan={Math.max(1,totalPeriods+1)} className="tt-asc-empty">No timetable lessons found for this selection.</td></tr>}
  </tbody></table></div>
  <div className="tt-workspace-footer">
   <div className="tt-card-info">{selected?<><strong>{selected.courseId?.name||selected.courseId?.code||'Subject'}</strong><span><b>Teacher:</b> {selected.teacherId?.name||'—'}</span><span><b>Section:</b> {selected.sectionId?.name||'—'}</span><span><b>Time:</b> {DAYS.find(([,d])=>d===Number(selected.dayOfWeek))?.[0]||'—'} · {hm(selected.startMinutes)}–{hm(selected.endMinutes)}</span><span><b>Room:</b> {selected.room||'—'}</span><button type="button" className="tt-info-lock" disabled={busyLock} onClick={()=>toggleLock(selected)}>{selected.isLocked?'🔓 Unlock Card':'🔒 Lock Card'}</button></>:<span>Select a subject card to view teacher, section, time, room and lock information.</span>}</div>
  </div>
 </div>;
 return <section className="tt-panel tt-workspace-launch"><div><h2>Whole Timetable</h2><p>Open the large timetable workspace for a clear section-by-period view.</p></div><button type="button" onClick={()=>setOpen(true)}>Open Whole Timetable</button>{open&&<div className="tt-workspace-overlay">{workspace}</div>}</section>;
}
