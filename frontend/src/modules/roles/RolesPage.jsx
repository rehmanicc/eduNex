import{useEffect,useMemo,useState}from'react';
import api from'../../api/client';
import{useAuth}from'../../contexts/AuthContext';
import'./roles.css';

const emptyNew={name:'',code:'',description:''};
const pretty=s=>String(s||'').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export default function RolesPage(){
  const{user}=useAuth();
  const[roles,setRoles]=useState([]),[groups,setGroups]=useState([]),[selectedId,setSelectedId]=useState(''),[draft,setDraft]=useState(null),[newRole,setNewRole]=useState(emptyNew),[showNew,setShowNew]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const canManage=(user?.permissions||[]).includes('*')||(user?.permissions||[]).includes('MANAGE_ROLES');

  async function load(preferId){
    try{
      setError('');
      const[r,p]=await Promise.all([api.get('/roles'),api.get('/roles/permissions')]);
      setRoles(r.data||[]);setGroups(p.data?.groups||[]);
      const id=preferId||selectedId||r.data?.[0]?._id||'';
      setSelectedId(id);
      const role=(r.data||[]).find(x=>x._id===id)||(r.data||[])[0];
      if(role)setDraft({...role,permissions:[...(role.permissions||[])]});
    }catch(e){setError(e.response?.data?.error||e.message)}
  }
  useEffect(()=>{load()},[]);

  const selected=useMemo(()=>roles.find(r=>r._id===selectedId),[roles,selectedId]);
  useEffect(()=>{if(selected)setDraft({...selected,permissions:[...(selected.permissions||[])]})},[selectedId]);

  function togglePermission(code){
    if(!draft||draft.permissions?.includes('*'))return;
    const has=(draft.permissions||[]).includes(code);
    setDraft({...draft,permissions:has?draft.permissions.filter(p=>p!==code):[...(draft.permissions||[]),code]});
  }

  async function save(){
    if(!draft||!canManage)return;setBusy(true);setError('');setMessage('');
    try{
      const payload={permissions:draft.permissions||[]};
      if(!draft.isProtected){payload.name=draft.name;payload.code=draft.code;payload.description=draft.description}
      await api.put(`/roles/${draft._id}`,payload);setMessage('Role permissions saved.');await load(draft._id);
    }catch(e){setError(e.response?.data?.error||e.message)}finally{setBusy(false)}
  }

  async function createRole(e){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{const{data}=await api.post('/roles',{...newRole,permissions:[]});setNewRole(emptyNew);setShowNew(false);setMessage('Custom role created. Select permissions and save.');await load(data._id)}catch(e2){setError(e2.response?.data?.error||e2.message)}finally{setBusy(false)}
  }

  return <div className="roles-page">
    <div className="roles-heading"><div><h1>Roles &amp; Permissions</h1><p>One employee may hold multiple roles. Employee and Teacher baseline roles are automatic for academic staff.</p></div>{canManage&&<button onClick={()=>setShowNew(v=>!v)}>{showNew?'Cancel':'Add Custom Role'}</button>}</div>
    {error&&<div className="roles-alert error">{error}</div>}{message&&<div className="roles-alert success">{message}</div>}

    {showNew&&<section className="roles-card"><form className="new-role-grid" onSubmit={createRole}><label><span>Role Name *</span><input required value={newRole.name} onChange={e=>setNewRole({...newRole,name:e.target.value})}/></label><label><span>Code *</span><input required value={newRole.code} onChange={e=>setNewRole({...newRole,code:e.target.value.toLowerCase().replace(/\s+/g,'_')})} placeholder="admission_officer"/></label><label className="wide"><span>Description</span><input value={newRole.description} onChange={e=>setNewRole({...newRole,description:e.target.value})}/></label><button disabled={busy}>Create Role</button></form></section>}

    <div className="roles-layout">
      <aside className="roles-list roles-card"><h2>Roles</h2>{roles.map(r=><button key={r._id} className={`role-list-item ${selectedId===r._id?'active':''}`} onClick={()=>setSelectedId(r._id)}><span><strong>{r.name}</strong><small>{r.code}</small></span>{r.isProtected&&<em>Protected</em>}</button>)}</aside>

      <section className="roles-card permission-panel">
        {!draft?<p>Select a role.</p>:<>
          <div className="permission-title"><div><h2>{draft.name}</h2><p>{draft.isProtected?'System role: name/code are locked; permissions may be adjusted by Director.':'Custom role'}</p></div>{draft.permissions?.includes('*')&&<span className="all-access">Full Access</span>}</div>
          {!draft.isProtected&&<div className="role-meta-grid"><label><span>Name</span><input value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label><span>Code</span><input value={draft.code||''} onChange={e=>setDraft({...draft,code:e.target.value.toLowerCase().replace(/\s+/g,'_')})}/></label><label className="wide"><span>Description</span><input value={draft.description||''} onChange={e=>setDraft({...draft,description:e.target.value})}/></label></div>}
          <div className="permission-groups">{groups.map(group=><div className="permission-group" key={group.name}><h3>{group.name}</h3><div>{group.permissions.map(item=>{const checked=draft.permissions?.includes('*')||draft.permissions?.includes(item.code);return <label key={item.code} title={item.code}><input type="checkbox" checked={checked} disabled={!canManage||draft.permissions?.includes('*')} onChange={()=>togglePermission(item.code)}/><span>{item.label||pretty(item.code)}</span></label>})}</div></div>)}</div>
          {canManage&&<div className="permission-actions"><button disabled={busy||draft.permissions?.includes('*')&&draft.code==='director'} onClick={save}>{busy?'Saving...':'Save Permissions'}</button>{draft.code==='director'&&<small>Director retains unrestricted full access.</small>}</div>}
        </>}
      </section>
    </div>
  </div>;
}
