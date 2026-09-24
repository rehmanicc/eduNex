import {useMemo,useState} from 'react';

const oid=v=>String(v?._id||v||'');

export default function TimetableClasses({options,assignments}){
 const[sessionId,setSessionId]=useState(options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'');
 const rows=useMemo(()=>(options.sections||[]).filter(s=>!sessionId||oid(s.academicSessionId)===sessionId).map(s=>{
  const subjectAssignments=(assignments||[]).filter(a=>oid(a.sectionId)===oid(s));
  const p=s.programId||{};
  const candidates=[['section',s._id],['program',oid(p)],['wing',oid(p.wingId)],['branch',oid(p.branchId)],['college','']];
  let profile=null;
  for(const[type,scopeId]of candidates){profile=(options.profiles||[]).find(x=>x.scopeType===type&&(type==='college'||oid(x.scopeId)===String(scopeId)));if(profile)break;}
  return{section:s,assignments:subjectAssignments,profile};
 }),[options.sections,options.profiles,assignments,sessionId]);
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Classes / Sections</h2><p>Classes and sections are read from CollegeCMS academic data; timetable requirements and resolved schedules are shown here.</p></div></div>
  <div className="tt-whole-filter"><select value={sessionId} onChange={e=>setSessionId(e.target.value)}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
  <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Program / Class</th><th>Section</th><th>Assigned Subjects</th><th>Weekly Lessons</th><th>Schedule Profile</th></tr></thead><tbody>
   {rows.map(x=><tr key={x.section._id}><td>{x.section.programId?.name}</td><td>{x.section.name}</td><td>{x.assignments.length}</td><td>{x.assignments.reduce((n,a)=>n+Number(a.weeklyPeriods||0),0)}</td><td>{x.profile?.name||'No schedule'}</td></tr>)}
   {!rows.length&&<tr><td colSpan="5">No sections found.</td></tr>}
  </tbody></table></div>
 </section>;
}
