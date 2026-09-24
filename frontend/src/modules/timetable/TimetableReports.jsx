import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');
const DAYS=[['monday','Mon',1],['tuesday','Tue',2],['wednesday','Wed',3],['thursday','Thu',4],['friday','Fri',5],['saturday','Sat',6],['sunday','Sun',0]];
const mins=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const teacherShort=t=>String(t?.name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'—';
const chunks=(arr,n)=>Array.from({length:Math.ceil(arr.length/n)},(_,i)=>arr.slice(i*n,i*n+n));

function MultiPicker({label,items,selected,setSelected,allLabel}){
 const all=selected.length===0;
 return <details className="tt-multi"><summary>{all?allLabel:`${selected.length} selected`}</summary><div className="tt-multi-menu"><label><input type="checkbox" checked={all} onChange={()=>setSelected([])}/>{allLabel}</label>{items.map(x=><label key={x._id}><input type="checkbox" checked={selected.includes(x._id)} onChange={e=>setSelected(s=>e.target.checked?[...s,x._id]:s.filter(id=>id!==x._id))}/>{x.label||x.name}</label>)}</div></details>;
}

function Grid({title,rows,slots,workingDays,mode}){
 const byCell=new Map(rows.map(r=>[`${r.dayOfWeek}:${r.startMinutes}`,r]));
 return <article className="tt-report-sheet"><h2>{title}</h2><table className="tt-print-grid"><thead><tr><th>Day / Lec</th>{slots.map((s,i)=><th key={`${s.start}-${i}`}>{s.label||`Lec ${i+1}`}<small>{mins(s.start)}-{mins(s.end)}</small></th>)}</tr></thead><tbody>{workingDays.map(([key,label,num])=><tr key={key}><th>{label}</th>{slots.map((s,i)=>{const r=byCell.get(`${num}:${s.start}`);return <td key={i}>{r&&<>{mode==='teacher'?<><small className="tt-cell-corner">{r.courseId?.code||r.courseId?.name||''}</small><strong>{r.sectionId?.name||''}</strong></>:<><small className="tt-cell-corner">{teacherShort(r.teacherId)}</small><strong>{r.courseId?.code||r.courseId?.name||''}</strong></>}</>}</td>})}</tr>)}</tbody></table></article>;
}

export default function TimetableReports({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[reportType,setReportType]=useState('teacher'); const[scope,setScope]=useState('college'); const[wingId,setWingId]=useState('');
 const[sessionId,setSessionId]=useState(current); const[teacherIds,setTeacherIds]=useState([]); const[classIds,setClassIds]=useState([]); const[perPage,setPerPage]=useState(1);
 const[rows,setRows]=useState([]); const[busy,setBusy]=useState(false); const[error,setError]=useState('');
 useEffect(()=>{setSessionId(v=>v||current)},[current]);
 const programWing=p=>oid(p?.wingId); const sectionWing=s=>programWing(s?.programId);
 const scopedSections=useMemo(()=>(options.sections||[]).filter(s=>(!sessionId||oid(s.academicSessionId)===sessionId)&&(scope!=='wing'||!wingId||sectionWing(s)===wingId)),[options.sections,sessionId,scope,wingId]);
 const sectionSet=new Set(scopedSections.map(x=>x._id));
 const scopedTeachers=useMemo(()=>{const ids=new Set(rows.filter(r=>sectionSet.has(oid(r.sectionId))).map(r=>oid(r.teacherId)));return (options.teachers||[]).filter(t=>!rows.length||ids.has(t._id)).map(t=>({...t,label:t.name}));},[options.teachers,rows,scopedSections]);
 const classChoices=scopedSections.map(s=>({...s,label:`${s.programId?.name||'Class'} — ${s.name}`}));
 async function generate(){setBusy(true);setError('');try{const r=await api.get('/timetable/grid',{params:{academicSessionId:sessionId}});setRows(r.data||[]);}catch(e){setError(e?.response?.data?.error||e.message)}finally{setBusy(false)}}
 useEffect(()=>{if(sessionId)generate()},[sessionId]);
 useEffect(()=>{setTeacherIds([]);setClassIds([])},[scope,wingId,reportType]);
 const filtered=rows.filter(r=>sectionSet.has(oid(r.sectionId)));
 const slots=useMemo(()=>{const configured=(options.settings?.scheduleSlots||[]).filter(s=>!s.isBreak).map((s,i)=>({label:s.label||`Lec ${i+1}`,start:Number(String(s.startTime||'0:0').split(':')[0])*60+Number(String(s.startTime||'0:0').split(':')[1]||0),end:Number(String(s.endTime||'0:0').split(':')[0])*60+Number(String(s.endTime||'0:0').split(':')[1]||0)}));if(configured.length)return configured;const m=new Map();filtered.forEach(r=>m.set(r.startMinutes,{start:r.startMinutes,end:r.endMinutes}));return [...m.values()].sort((a,b)=>a.start-b.start).map((s,i)=>({...s,label:`Lec ${i+1}`}));},[options.settings,filtered]);
 const wd=(options.settings?.workingDays||DAYS.slice(0,6).map(x=>x[0])).map(d=>DAYS.find(x=>x[0]===d)).filter(Boolean);
 const reports=useMemo(()=>{if(reportType==='teacher'){const ids=teacherIds.length?teacherIds:[...new Set(filtered.map(r=>oid(r.teacherId)))];return ids.map(id=>{const t=(options.teachers||[]).find(x=>x._id===id)||filtered.find(r=>oid(r.teacherId)===id)?.teacherId;return{key:id,title:`Teacher ${t?.name||'—'}`,rows:filtered.filter(r=>oid(r.teacherId)===id),mode:'teacher'}})}if(reportType==='class'){const ids=classIds.length?classIds:scopedSections.map(s=>s._id);return ids.map(id=>{const s=scopedSections.find(x=>x._id===id);return{key:id,title:`${s?.programId?.name||'Class'} — ${s?.name||''}`,rows:filtered.filter(r=>oid(r.sectionId)===id),mode:'class'}})}return[]},[reportType,teacherIds,classIds,filtered,scopedSections,options.teachers]);
 const teacherSummary=useMemo(()=>scopedTeachers.map(t=>{const rr=filtered.filter(r=>oid(r.teacherId)===t._id);return{name:t.name,classes:new Set(rr.map(r=>oid(r.sectionId))).size,subjects:new Set(rr.map(r=>oid(r.courseId))).size,periods:rr.length}}),[scopedTeachers,filtered]);
 const classSummary=useMemo(()=>scopedSections.map(s=>{const rr=filtered.filter(r=>oid(r.sectionId)===s._id);return{name:`${s.programId?.name||'Class'} — ${s.name}`,teachers:new Set(rr.map(r=>oid(r.teacherId))).size,subjects:new Set(rr.map(r=>oid(r.courseId))).size,periods:rr.length}}),[scopedSections,filtered]);
 function print(){document.body.classList.add('tt-printing');window.print();setTimeout(()=>document.body.classList.remove('tt-printing'),500)}
 const pages=chunks(reports,Number(perPage)); const college=options.college||{};
 return <section className="tt-panel tt-reports"><div className="tt-section-head"><div><h2>Timetable Reports</h2><p>Teacher-wise, class-wise and summary reports.</p></div></div>
  <div className="tt-report-controls"><label>Report Type<select value={reportType} onChange={e=>setReportType(e.target.value)}><option value="class">Class Wise</option><option value="teacher">Teacher Wise</option><option value="classSummary">Summary of Classes</option><option value="teacherSummary">Summary of Teachers</option></select></label><label>Scope<select value={scope} onChange={e=>setScope(e.target.value)}><option value="college">Whole College</option><option value="wing">Wing</option></select></label>{scope==='wing'&&<label>Wing<select value={wingId} onChange={e=>setWingId(e.target.value)}><option value="">Select Wing</option>{(options.wings||[]).map(w=><option key={w._id} value={w._id}>{w.name}</option>)}</select></label>}<label>Session<select value={sessionId} onChange={e=>setSessionId(e.target.value)}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
  {reportType==='teacher'&&<label>Teachers<MultiPicker items={scopedTeachers} selected={teacherIds} setSelected={setTeacherIds} allLabel="All Teachers"/></label>}{reportType==='class'&&<label>Classes<MultiPicker items={classChoices} selected={classIds} setSelected={setClassIds} allLabel="All Classes"/></label>}
  <label>Print Layout<select value={perPage} onChange={e=>setPerPage(Number(e.target.value))}><option value="1">1 per page</option><option value="2">2 per page</option><option value="4">4 per page</option></select></label><div className="tt-report-actions"><button onClick={generate} disabled={busy}>{busy?'Loading…':'Generate Report'}</button><button onClick={print} disabled={busy}>Print / PDF</button></div></div>{error&&<div className="tt-error">{error}</div>}
  <div className={`tt-print-root tt-per-${perPage}`}>
   {['teacher','class'].includes(reportType)?pages.map((page,pi)=><div className="tt-print-page" key={pi}><header><span>{college.name||'College'}</span><span>Published: {new Date().toLocaleDateString()}</span></header><div className="tt-page-grid">{page.map(x=><Grid key={x.key} {...x} slots={slots} workingDays={wd}/>)}</div><footer><strong>eduNex</strong><span>Powered by TrackiaTech</span></footer></div>):<div className="tt-print-page"><header><span>{college.name||'College'}</span><span>Published: {new Date().toLocaleDateString()}</span></header><article className="tt-summary-sheet"><h2>{reportType==='teacherSummary'?'Summary of Teachers':'Summary of Classes'}</h2>{reportType==='teacherSummary'?<table><thead><tr><th>Teacher</th><th>Classes / Sections</th><th>Subjects</th><th>Periods / Week</th></tr></thead><tbody>{teacherSummary.map(x=><tr key={x.name}><td>{x.name}</td><td>{x.classes}</td><td>{x.subjects}</td><td>{x.periods}</td></tr>)}</tbody></table>:<table><thead><tr><th>Class / Section</th><th>Teachers</th><th>Subjects</th><th>Periods / Week</th></tr></thead><tbody>{classSummary.map(x=><tr key={x.name}><td>{x.name}</td><td>{x.teachers}</td><td>{x.subjects}</td><td>{x.periods}</td></tr>)}</tbody></table>}</article><footer><strong>eduNex</strong><span>Powered by TrackiaTech</span></footer></div>}
  </div>
 </section>;
}
