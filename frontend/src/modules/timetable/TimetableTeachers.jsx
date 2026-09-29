import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');

export default function TimetableTeachers({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[sessionId,setSessionId]=useState(current),[teacherId,setTeacherId]=useState(''),[rows,setRows]=useState([]);
 useEffect(()=>{if(!sessionId)return;api.get('/timetable/whole-grid',{params:{academicSessionId:sessionId,teacherId}}).then(r=>setRows(Array.isArray(r.data)?r.data:[])).catch(()=>setRows([]));},[sessionId,teacherId]);
 const stats=useMemo(()=>(options.teachers||[]).map(t=>{
  const lessons=rows.filter(r=>oid(r.teacherId)===oid(t));
  const grouped=new Map();
  lessons.forEach(l=>{
   const section=l.sectionId?.name||'Section';
   const code=String(l.courseId?.code||'—').trim().toUpperCase();
   const key=`${oid(l.sectionId)}|${oid(l.courseId)}`;
   const hit=grouped.get(key)||{section,code,count:0};
   hit.count+=1;grouped.set(key,hit);
  });
  const bySection=new Map();
  [...grouped.values()].forEach(x=>{if(!bySection.has(x.section))bySection.set(x.section,[]);bySection.get(x.section).push(`${x.code}-${x.count}`);});
  const workload=[...bySection.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([section,items])=>`${section} [${items.join(', ')}]`);
  return{teacher:t,lessons,workload};
 }),[options.teachers,rows]);
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Teachers</h2><p>Compact teacher workload by section, subject code and weekly lesson count.</p></div></div>
  <div className="tt-whole-filter"><select value={sessionId} onChange={e=>setSessionId(e.target.value)}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select><select value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">All Teachers</option>{(options.teachers||[]).map(t=><option key={t._id} value={t._id}>{t.employeeNo} - {t.name}</option>)}</select></div>
  <div className="tt-table-wrap"><table className="tt-table tt-teacher-workload-table"><thead><tr><th>Teacher</th><th>Workload</th><th>Total Lessons</th></tr></thead><tbody>
   {stats.filter(x=>!teacherId||oid(x.teacher)===teacherId).map(x=><tr key={x.teacher._id}><td>{x.teacher.employeeNo} - {x.teacher.name}</td><td>{x.workload.length?x.workload.map(item=><span className="tt-mini-chip" key={item}>{item}</span>):'—'}</td><td>{x.lessons.length}</td></tr>)}
  </tbody></table></div>
 </section>;
}
