import {useEffect,useState} from 'react';
import api from '../../api/client';
import './wings.css';

const EMPTY={name:'',code:'',academicType:'school'};

export default function WingsPage({embedded=false}){
  const [data,setData]=useState({wings:[],branches:[],academicTypes:[]});
  const [form,setForm]=useState(EMPTY);
  const [editingId,setEditingId]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    const r=await api.get('/wings/structure');
    setData(r.data||{wings:[],branches:[],academicTypes:[]});
  }

  useEffect(()=>{load().catch(e=>setError(e.response?.data?.error||e.message));},[]);

  function edit(w){
    setEditingId(w._id);
    setForm({name:w.name||'',code:w.code||'',academicType:w.academicType||'school'});
  }

  function cancel(){
    setEditingId(null);
    setForm(EMPTY);
    setError('');
  }

  async function save(e){
    e.preventDefault();setBusy(true);setError('');
    try{
      if(editingId) await api.put(`/wings/${editingId}`,form);
      else await api.post('/wings',form);
      cancel();await load();
    }catch(e2){setError(e2.response?.data?.error||e2.message)}
    finally{setBusy(false)}
  }

  async function toggleWing(w){
    setBusy(true);setError('');
    try{await api.put(`/wings/${w._id}`,{isActive:!w.isActive});await load()}
    catch(e){setError(e.response?.data?.error||e.message)}
    finally{setBusy(false)}
  }

  async function toggleBranchWing(branch,wingId){
    const current=new Set(branch.wingIds||[]);
    current.has(wingId)?current.delete(wingId):current.add(wingId);
    setBusy(true);setError('');
    try{
      await api.put(`/wings/branches/${branch._id}`,{wingIds:[...current]});
      await load();
    }catch(e){setError(e.response?.data?.error||e.message)}
    finally{setBusy(false)}
  }

  const typeLabel=v=>data.academicTypes?.find(x=>x.value===v)?.label||v;

  return <div className="wing-page">
    {!embedded&&<div className="wing-head">
      <div>
        <h1>Wings</h1>
        <p>Institution management defines Wings and their Academic Type. Then assign each Wing to the Branches that offer it.</p>
      </div>
    </div>}
    {embedded&&<div className="wing-head"><div><h2>Wings</h2><p>Define Wings and assign them to the Branches that offer them.</p></div></div>}

    {error&&<div className="wing-error">{error}</div>}

    <section className="wing-panel">
      <h2>{editingId?'Edit Wing':'Create Wing'}</h2>
      <form className="wing-form" onSubmit={save}>
        <input required placeholder="Wing name e.g. Junior Section" value={form.name}
          onChange={e=>setForm({...form,name:e.target.value})}/>
        <input required placeholder="Code e.g. JUNIOR" value={form.code}
          onChange={e=>setForm({...form,code:e.target.value})}/>
        <select required value={form.academicType}
          onChange={e=>setForm({...form,academicType:e.target.value})}>
          <option value="school">School</option>
          <option value="college">College</option>
          <option value="cambridge">Cambridge</option>
          <option value="university">University</option>
        </select>
        <button disabled={busy}>{editingId?'Update Wing':'Create Wing'}</button>
        {editingId&&<button type="button" onClick={cancel}>Cancel</button>}
      </form>
    </section>

    <section className="wing-panel">
      <h2>Wings</h2>
      <table>
        <thead><tr><th>Wing</th><th>Code</th><th>Academic Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {data.wings?.map(w=><tr key={w._id}>
            <td>{w.name}</td><td>{w.code}</td><td>{typeLabel(w.academicType)}</td>
            <td>{w.isActive===false?'Inactive':'Active'}</td>
            <td><button onClick={()=>edit(w)}>Edit</button>{' | '}
              <button onClick={()=>toggleWing(w)}>{w.isActive===false?'Activate':'Deactivate'}</button></td>
          </tr>)}
          {!data.wings?.length&&<tr><td colSpan="5">No Wings created yet.</td></tr>}
        </tbody>
      </table>
    </section>

    <section className="wing-panel">
      <h2>Assign Wings to Branches</h2>
      <p className="muted">A Wing may be used by one or many Branches.</p>
      {data.branches?.map(branch=><div className="wing-branch" key={branch._id}>
        <strong>{branch.name} ({branch.code})</strong>
        <div className="wing-checks">
          {data.wings?.filter(w=>w.isActive!==false).map(w=><label key={w._id}>
            <input type="checkbox" checked={(branch.wingIds||[]).includes(w._id)}
              onChange={()=>toggleBranchWing(branch,w._id)} disabled={busy}/>
            <span>{w.name} <small>{typeLabel(w.academicType)}</small></span>
          </label>)}
        </div>
      </div>)}
    </section>
  </div>;
}
