import {useMemo,useState} from 'react';
import api from '../../api/client';

const err=e=>e?.response?.data?.error||e?.message||'Request failed';

export default function TimetableVerification({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[form,setForm]=useState({academicSessionId:current,scopeType:'college',scopeId:''});
 const[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scopeOptions=useMemo(()=>{
  if(form.scopeType==='wing')return (options.wings||[]).map(x=>[x._id,x.name]);
  if(form.scopeType==='program')return (options.programs||[]).map(x=>[x._id,x.name]);
  if(form.scopeType==='section')return (options.sections||[]).map(x=>[x._id,`${x.programId?.name||'Program'} / ${x.name}`]);
  return[];
 },[form.scopeType,options]);
 async function verify(){setBusy(true);setError('');try{
  const r=await api.get('/timetable/verify-detailed',{params:form});setResult(r.data);
 }catch(e){setError(err(e));}finally{setBusy(false);}}
 return <section className="tt-panel">
  <div className="tt-section-head"><div><h2>Verification</h2><p>Check the generated timetable before publishing. Hard conflicts, missing lessons and rule violations are reported here.</p></div></div>
  {error&&<div className="tt-error">{error}</div>}
  <div className="tt-verify-filter">
   <select value={form.academicSessionId} onChange={e=>setForm({...form,academicSessionId:e.target.value})}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select>
   <select value={form.scopeType} onChange={e=>setForm({...form,scopeType:e.target.value,scopeId:''})}><option value="college">Whole College</option><option value="wing">Wing</option><option value="program">Program / Class</option><option value="section">Section</option></select>
   {form.scopeType!=='college'&&<select value={form.scopeId} onChange={e=>setForm({...form,scopeId:e.target.value})}><option value="">Select...</option>{scopeOptions.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select>}
   <button type="button" onClick={verify} disabled={busy||!form.academicSessionId||(form.scopeType!=='college'&&!form.scopeId)}>{busy?'Checking...':'Run Verification'}</button>
  </div>
  {result&&<>
   <div className="tt-verify-summary">
    <div><small>Quality</small><strong>{result.score}%</strong></div>
    <div><small>Hard Errors</small><strong>{result.errors}</strong></div>
    <div><small>Warnings</small><strong>{result.warnings}</strong></div>
    <div><small>Lessons</small><strong>{result.lessons}</strong></div>
    <div><small>Assignments</small><strong>{result.assignments}</strong></div>
   </div>
   <div className={result.valid?'tt-success':'tt-error'}>{result.valid?'Timetable is valid and ready for publication.':'Resolve hard errors before publishing.'}</div>
   <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Severity</th><th>Check</th><th>Details</th></tr></thead><tbody>
    {(result.issues||[]).map((x,i)=><tr key={`${x.type}-${i}`}><td><span className={`tt-severity ${x.severity}`}>{x.severity}</span></td><td>{String(x.type||'').replaceAll('_',' ')}</td><td>{x.message}</td></tr>)}
    {!result.issues?.length&&<tr><td colSpan="3">No verification issues found.</td></tr>}
   </tbody></table></div>
  </>}
 </section>;
}
