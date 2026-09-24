import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';

const oid=v=>String(v?._id||v||'');
const errMsg=e=>e?.response?.data?.error||e?.message||'Request failed';

export default function TimetableDivisions({options}){
 const current=options.sessions?.find(x=>x.isCurrent)?._id||options.sessions?.[0]?._id||'';
 const[form,setForm]=useState({academicSessionId:current,sectionId:'',name:'',code:''});
 const[rows,setRows]=useState([]);
 const[editing,setEditing]=useState(null);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');

 const sections=useMemo(
   ()=>(options.sections||[]).filter(s=>!form.academicSessionId||oid(s.academicSessionId)===form.academicSessionId),
   [options.sections,form.academicSessionId]
 );

 async function load(){
   const r=await api.get('/timetable/divisions',{params:{sectionId:form.sectionId||undefined}});
   setRows(Array.isArray(r.data)?r.data:[]);
 }
 useEffect(()=>{load().catch(()=>{})},[form.sectionId]);

 async function save(e){
   e.preventDefault();setError('');setNotice('');
   try{
     await api.post('/timetable/divisions',form);
     setForm(f=>({...f,name:'',code:''}));
     setNotice('Timetable division created.');
     await load();
   }catch(e2){setError(errMsg(e2))}
 }

 function startEdit(d){
   setEditing({_id:d._id,name:d.name||'',code:d.code||''});
   setError('');setNotice('');
 }

 async function saveEdit(){
   try{
     await api.put(`/timetable/divisions/${editing._id}`,{name:editing.name,code:editing.code});
     setEditing(null);
     setNotice('Timetable division updated.');
     await load();
   }catch(e){setError(errMsg(e))}
 }

 async function remove(d){
   if(!window.confirm(`Delete timetable division "${d.name}"?`))return;
   try{
     await api.delete(`/timetable/divisions/${d._id}`);
     if(editing?._id===d._id)setEditing(null);
     setNotice('Timetable division deleted.');
     await load();
   }catch(e){setError(errMsg(e))}
 }

 return <section className="tt-panel">
  <div className="tt-section-head">
   <div>
    <h2>Timetable Divisions / Groups</h2>
    <p>Create scheduling groups inside a section for subjects that can run simultaneously. No student assignment is required.</p>
   </div>
  </div>

  {error&&<div className="tt-error">{error}</div>}
  {notice&&<div className="tt-success">{notice}</div>}

  <form className="tt-constraint-form" onSubmit={save}>
   <label><span>Session</span><select value={form.academicSessionId} onChange={e=>setForm({...form,academicSessionId:e.target.value,sectionId:''})}>{(options.sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
   <label><span>Class / Section</span><select required value={form.sectionId} onChange={e=>setForm({...form,sectionId:e.target.value})}><option value="">Select...</option>{sections.map(s=><option key={s._id} value={s._id}>{s.programId?.name} / {s.name}</option>)}</select></label>
   <label><span>Division / Group Name</span><input required placeholder="e.g. Physics Group" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <label><span>Code</span><input placeholder="PHY-G1" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label>
   <button>Create Division</button>
  </form>

  <div className="tt-inline-note">
   Example: create <strong>Physics Group</strong> and <strong>Statistics Group</strong> for the same section, then select the appropriate group in Data &amp; Assignments. The generator may place different groups of that section at the same time while still preventing teacher and room conflicts.
  </div>

  <div className="tt-table-wrap">
   <table className="tt-table">
    <thead><tr><th>Division / Group</th><th>Class / Section</th><th>Code</th><th>Actions</th></tr></thead>
    <tbody>
     {rows.map(d=><tr key={d._id}>
      <td><strong>{d.name}</strong></td>
      <td>{d.sectionId?.programId?.name?`${d.sectionId.programId.name} / `:''}{d.sectionId?.name||'—'}</td>
      <td>{d.code||'—'}</td>
      <td className="tt-action-cell"><button type="button" className="tt-secondary" onClick={()=>startEdit(d)}>Edit</button><button type="button" className="tt-link-button" onClick={()=>remove(d)}>Delete</button></td>
     </tr>)}
     {!rows.length&&<tr><td colSpan="4">No timetable divisions configured.</td></tr>}
    </tbody>
   </table>
  </div>

  {editing&&<div className="tt-settings-block">
   <h3>Edit Timetable Division</h3>
   <div className="tt-constraint-form">
    <label><span>Division / Group Name</span><input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
    <label><span>Code</span><input value={editing.code} onChange={e=>setEditing({...editing,code:e.target.value})}/></label>
   </div>
   <div className="tt-save-row"><button type="button" onClick={saveEdit}>Save Changes</button><button type="button" className="tt-secondary" onClick={()=>setEditing(null)}>Cancel</button></div>
  </div>}
 </section>
}
