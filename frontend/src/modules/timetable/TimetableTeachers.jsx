import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');
const hm=n=>`${String(Math.floor(Number(n||0)/60)).padStart(2,'0')}:${String(Number(n||0)%60).padStart(2,'0')}`;
const day=n=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(n)]||'';

export default function TimetableTeachers({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[sessionId,setSessionId]=useState(current),[teacherId,setTeacherId]=useState(''),[rows,setRows]=useState([]);
 useEffect(()=>{if(!sessionId)return;api.get('/timetable/whole-grid',{params:{academicSessionId:sessionId,teacherId}}).then(r=>setRows(Array.isArray(r.data)?r.data:[])).catch(()=>setRows([]));},[sessionId,teacherId]);
 const stats=useMemo(()=>(options.teachers||[]).map(t=>{
  const lessons=rows.filter(r=>oid(r.teacherId)===oid(t));
  const wings=[...new Set(lessons.map(r=>r.sectionId?.programId?.wingId).filter(Boolean).map(oid))];
  const programs=[...new Set(lessons.map(r=>r.sectionId?.programId?.name).filter(Boolean))];
  return{teacher:t,lessons,wings,programs};
 }),[options.teachers,rows]);
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Teachers</h2><p>College-wide teacher workload. A teacher teaching in multiple wings is shown as one shared scheduling resource.</p></div></div>
  <div className="tt-whole-filter"><select value={sessionId} onChange={e=>setSessionId(e.target.value)}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select><select value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">All Teachers</option>{(options.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select></div>
  <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Teacher</th><th>Programs / Classes</th><th>Lessons</th><th>Scheduled Times</th></tr></thead><tbody>
   {stats.filter(x=>!teacherId||oid(x.teacher)===teacherId).map(x=><tr key={x.teacher._id}><td>{x.teacher.employeeNo} - {x.teacher.name}</td><td>{x.programs.join(', ')||'—'}</td><td>{x.lessons.length}</td><td>{x.lessons.slice(0,8).map(l=><span className="tt-mini-chip" key={l._id}>{day(l.dayOfWeek)} {hm(l.startMinutes)} {l.sectionId?.name}</span>)}{x.lessons.length>8&&<span className="tt-mini-chip">+{x.lessons.length-8}</span>}</td></tr>)}
  </tbody></table></div>
 </section>;
}
