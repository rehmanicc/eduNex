import {useEffect,useMemo,useState} from 'react';
import api from '../../api/client';
import './assignments.css';

const todayKey=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Karachi'});
const label=a=>[a.program?.name,a.section?.name,a.course?.name].filter(Boolean).join(' • ');

export default function AssignmentsPage(){
  const[classes,setClasses]=useState([]),[rows,setRows]=useState([]),[loading,setLoading]=useState(true);
  const[error,setError]=useState(''),[message,setMessage]=useState('');
  const[form,setForm]=useState({teacherAssignmentId:'',title:'',instructions:'',dueDate:todayKey()});
  const active=useMemo(()=>rows.filter(x=>!x.isExpired),[rows]);
  const expired=useMemo(()=>rows.filter(x=>x.isExpired),[rows]);

  async function load(){
    setLoading(true);setError('');
    try{
      const[c,a]=await Promise.all([api.get('/portal/teacher/classes'),api.get('/portal/teacher/assignments')]);
      setClasses(c.data.classes||[]);setRows(a.data.assignments||[]);
      setForm(f=>({...f,teacherAssignmentId:f.teacherAssignmentId||c.data.classes?.[0]?.id||''}));
    }catch(e){setError(e.response?.data?.error||e.message||'Unable to load assignments');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  async function submit(e){
    e.preventDefault();setError('');setMessage('');
    try{
      await api.post('/portal/teacher/assignments',form);
      setMessage('Assignment published successfully.');
      setForm(f=>({...f,title:'',instructions:'',dueDate:todayKey()}));
      await load();
    }catch(e){setError(e.response?.data?.error||e.message||'Unable to publish assignment');}
  }

  return <section className="assignment-page">
    <div className="assignment-heading"><div><p className="assignment-kicker">Teacher Portal</p><h2>Assignments</h2><p>Publish homework only to your assigned classes and subjects.</p></div></div>
    {error?<div className="assignment-alert error">{error}</div>:null}{message?<div className="assignment-alert success">{message}</div>:null}
    <div className="assignment-layout">
      <form className="assignment-panel" onSubmit={submit}>
        <h3>New Assignment</h3>
        <label>Class / Section / Subject<select required value={form.teacherAssignmentId} onChange={e=>setForm({...form,teacherAssignmentId:e.target.value})}><option value="">Select assigned class</option>{classes.map(c=><option key={c.id} value={c.id}>{label(c)}</option>)}</select></label>
        <label>Title<input required maxLength="160" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Chapter 4 exercises"/></label>
        <label>Homework / Instructions<textarea required maxLength="4000" rows="6" value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Write the work students should complete..."/></label>
        <label>Due Date<input required type="date" min={todayKey()} value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label>
        <button type="submit" disabled={!classes.length}>Publish Assignment</button>
        {!classes.length&&!loading?<small>No active teaching assignment is available for this account.</small>:null}
      </form>
      <div className="assignment-panel assignment-list"><h3>Assignment History</h3>{loading?<p>Loading...</p>:null}
        {!loading&&!rows.length?<p className="assignment-empty">No assignments published yet.</p>:null}
        {active.length?<><h4>Active</h4>{active.map(a=><article key={a.id}><div><strong>{a.title}</strong><span>{label(a)}</span></div><time>Due {a.dueDate}</time><p>{a.instructions}</p></article>)}</>:null}
        {expired.length?<details><summary>Past assignments ({expired.length})</summary>{expired.map(a=><article className="expired" key={a.id}><div><strong>{a.title}</strong><span>{label(a)}</span></div><time>Due {a.dueDate}</time><p>{a.instructions}</p></article>)}</details>:null}
      </div>
    </div>
  </section>;
}
