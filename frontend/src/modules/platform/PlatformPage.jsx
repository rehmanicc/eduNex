import {useEffect,useState} from 'react';
import api from '../../api/client';

const emptyCollege={name:'',code:'',subdomain:'',branchLimit:1};
const emptyDirector={name:'',email:'',phone:'',password:''};

const StatusBadge=({active=true})=><span className={`po-badge ${active?'is-active':'is-inactive'}`}>{active?'Active':'Inactive'}</span>;

export default function PlatformPage(){
  const [dashboard,setDashboard]=useState({});
  const [colleges,setColleges]=useState([]);
  const [plans,setPlans]=useState([]);
  const [tab,setTab]=useState('dashboard');
  const [msg,setMsg]=useState('');
  const [selected,setSelected]=useState(null);
  const [structure,setStructure]=useState(null);
  const [collegeForm,setCollegeForm]=useState(emptyCollege);
  const [directorForm,setDirectorForm]=useState(emptyDirector);
  const [manageTab,setManageTab]=useState('overview');
  const [busy,setBusy]=useState(false);
  const [branchLimit,setBranchLimit]=useState(1);

  const err=e=>setMsg(e?.response?.data?.error||e.message);
  async function load(){
    const [d,c,p]=await Promise.all([api.get('/platform/dashboard'),api.get('/platform/colleges'),api.get('/platform/plans')]);
    setDashboard(d.data||{});setColleges(c.data||[]);setPlans(p.data||[]);
  }
  useEffect(()=>{load().catch(err);},[]);

  async function createInstitution(e){
    e.preventDefault();setBusy(true);setMsg('');
    try{const r=await api.post('/platform/colleges',collegeForm);setCollegeForm(emptyCollege);await load();await openStructure(r.data);}
    catch(e2){err(e2)}finally{setBusy(false)}
  }
  async function openStructure(college){
    setSelected(college);setManageTab('overview');setMsg('');
    try{const r=await api.get(`/platform/colleges/${college._id}/structure`);setStructure(r.data);setBranchLimit(r.data?.college?.branchLimit||1);}catch(e){err(e)}
  }
  async function refreshStructure(){if(!selected)return;const r=await api.get(`/platform/colleges/${selected._id}/structure`);setStructure(r.data);setBranchLimit(r.data?.college?.branchLimit||1)}
  async function saveBranchLimit(){setBusy(true);setMsg('');try{await api.put(`/platform/colleges/${selected._id}`,{branchLimit:Number(branchLimit)});await refreshStructure();setMsg('Allowed branch count updated.')}catch(e){err(e)}finally{setBusy(false)}}
  async function addDirector(e){
    e.preventDefault();setBusy(true);setMsg('');
    try{await api.post(`/platform/colleges/${selected._id}/directors`,directorForm);setDirectorForm(emptyDirector);await refreshStructure();setManageTab('director')}catch(e2){err(e2)}finally{setBusy(false)}
  }
  async function toggleDirector(d){
    setBusy(true);setMsg('');try{await api.put(`/platform/colleges/${selected._id}/directors/${d._id}`,{isActive:!d.isActive});await refreshStructure();setManageTab('director')}catch(e){err(e)}finally{setBusy(false)}
  }
  async function resetDirector(d){
    const password=window.prompt(`New password for ${d.name} (minimum 8 characters)`);if(!password)return;
    setBusy(true);setMsg('');try{await api.post(`/platform/colleges/${selected._id}/directors/${d._id}/reset-password`,{password});setMsg('Director password updated.')}catch(e){err(e)}finally{setBusy(false)}
  }

  const Stat=({label,value,meta})=><div className="po-stat-card"><div className="po-stat-label">{label}</div><div className="po-stat-value">{value||0}</div>{meta&&<div className="po-stat-meta">{meta}</div>}</div>;

  return <section className="po-page">
    <div className="po-header">
      <div>
        <div className="po-eyebrow">SYSTEM CONTROL CENTER</div>
        <h1>Platform Administration</h1>
        <p>Create institutions, Directors and branch entitlements. Each institution manages its own Branches, Wings and operating settings.</p>
      </div>
      <div className="po-header-chip">Platform Owner</div>
    </div>

    {msg&&<div className={`po-alert ${msg.includes('updated')?'success':'error'}`}>{msg}</div>}

    <div className="po-tabs">
      {[
        ['dashboard','Dashboard'],
        ['colleges','Institutions'],
        ['plans','Plans']
      ].map(([value,label])=><button className={tab===value?'active':''} key={value} onClick={()=>{setTab(value);setSelected(null);setStructure(null)}}>{label}</button>)}
    </div>

    {tab==='dashboard'&&<>
      <div className="po-stats-grid">
        <Stat label="Institutions" value={dashboard.colleges}/>
        <Stat label="Active Institutions" value={dashboard.activeColleges}/>
        <Stat label="Students" value={dashboard.students}/>
        <Stat label="Employees" value={dashboard.employees}/>
        <Stat label="Active Subscriptions" value={dashboard.activeSubscriptions}/>
      </div>

      <div className="po-panel">
        <div className="po-panel-head">
          <div><h2>Institutions Overview</h2><p>Quick operational view of all institutions on the platform.</p></div>
          <button className="po-secondary-btn" onClick={()=>setTab('colleges')}>Manage Institutions</button>
        </div>
        <div className="po-table-wrap">
          <table className="po-table">
            <thead><tr><th>Institution</th><th>Code</th><th>Status</th><th>Students</th><th>Employees</th><th></th></tr></thead>
            <tbody>
              {(colleges||[]).length===0&&<tr><td colSpan="6" className="po-empty">No institutions created yet.</td></tr>}
              {(colleges||[]).slice(0,8).map(c=><tr key={c._id}>
                <td><div className="po-primary-cell">{c.name}</div><div className="po-subcell">{c.slug||'—'}</div></td>
                <td>{c.code||'—'}</td>
                <td><StatusBadge active={c.isActive}/></td>
                <td>{c.studentCount||0}</td>
                <td>{c.employeeCount||0}</td>
                <td className="po-actions"><button className="po-link-btn" onClick={()=>{setTab('colleges');openStructure(c)}}>Manage</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>}

    {tab==='colleges'&&!selected&&<>
      <div className="po-panel">
        <div className="po-panel-head"><div><h2>Create Institution</h2><p>Add a new tenant/institution to the platform.</p></div></div>
        <form onSubmit={createInstitution} className="po-form-grid">
          <label><span>Institution Name</span><input required placeholder="e.g. ABC School System" value={collegeForm.name} onChange={e=>setCollegeForm({...collegeForm,name:e.target.value})}/></label>
          <label><span>Code</span><input placeholder="e.g. ABC" value={collegeForm.code} onChange={e=>setCollegeForm({...collegeForm,code:e.target.value})}/></label>
          <label><span>Allowed Branches</span><input required type="number" min="1" value={collegeForm.branchLimit} onChange={e=>setCollegeForm({...collegeForm,branchLimit:e.target.value})}/></label>
          <label><span>Subdomain</span><input placeholder="Optional" value={collegeForm.subdomain} onChange={e=>setCollegeForm({...collegeForm,subdomain:e.target.value})}/></label>
          <div className="po-form-action"><button disabled={busy}>Create Institution</button></div>
        </form>
      </div>

      <div className="po-panel">
        <div className="po-panel-head"><div><h2>Institutions</h2><p>{(colleges||[]).length} institution{(colleges||[]).length===1?'':'s'} configured.</p></div></div>
        <div className="po-table-wrap">
          <table className="po-table">
            <thead><tr><th>Institution</th><th>Code</th><th>Status</th><th>Students</th><th>Employees</th><th>Action</th></tr></thead>
            <tbody>
              {(colleges||[]).length===0&&<tr><td colSpan="6" className="po-empty">No institutions found.</td></tr>}
              {(colleges||[]).map(c=><tr key={c._id}>
                <td><div className="po-primary-cell">{c.name}</div><div className="po-subcell">{c.slug||'No slug'}</div></td>
                <td>{c.code||'—'}</td>
                <td><StatusBadge active={c.isActive}/></td>
                <td>{c.studentCount||0}</td>
                <td>{c.employeeCount||0}</td>
                <td className="po-actions"><button className="po-link-btn" onClick={()=>openStructure(c)}>Manage Institution</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>}

    {tab==='colleges'&&selected&&structure&&<>
      <div className="po-manage-title">
        <button className="po-back-btn" onClick={()=>{setSelected(null);setStructure(null)}}>← Institutions</button>
        <div><div className="po-eyebrow">INSTITUTION MANAGEMENT</div><h2>{structure.college?.name||selected.name}</h2></div>
        <StatusBadge active={structure.college?.isActive}/>
      </div>

      <div className="po-subtabs">
        {[
          ['overview','Overview'],
          ['director','Director']
        ].map(([value,label])=><button className={manageTab===value?'active':''} key={value} onClick={()=>setManageTab(value)}>{label}</button>)}
      </div>

      {manageTab==='overview'&&<>
        <div className="po-detail-grid">
          <div className="po-panel po-summary-panel">
            <div className="po-panel-head"><div><h2>Institution Overview</h2><p>Core tenant details and operational totals.</p></div></div>
            <div className="po-kv-grid">
              <div><span>Slug</span><strong>{structure.college?.slug||'—'}</strong></div>
              <div><span>Code</span><strong>{structure.college?.code||'—'}</strong></div>
              <div><span>Branches</span><strong>{(structure.branches||[]).length} / {structure.college?.branchLimit||1}</strong></div>
              <div className="po-branch-limit-setting"><span>Allowed Branches</span><div className="po-action-row"><input type="number" min="1" value={branchLimit} onChange={e=>setBranchLimit(e.target.value)}/><button type="button" className="po-secondary-btn small" disabled={busy} onClick={saveBranchLimit}>Save</button></div></div>
              <div><span>Directors</span><strong>{(structure.directors||[]).length}</strong></div>
            </div>
          </div>
        </div></>}

      {manageTab==='director'&&<>
        <div className="po-panel">
          <div className="po-panel-head"><div><h2>Create Director</h2><p>The Director belongs to this institution and automatically has access to all branches.</p></div></div>
          <form onSubmit={addDirector} className="po-form-grid">
            <label><span>Director Name</span><input required placeholder="Full name" value={directorForm.name} onChange={e=>setDirectorForm({...directorForm,name:e.target.value})}/></label>
            <label><span>Email</span><input required type="email" placeholder="director@example.com" value={directorForm.email} onChange={e=>setDirectorForm({...directorForm,email:e.target.value})}/></label>
            <label><span>Phone</span><input placeholder="Phone number" value={directorForm.phone} onChange={e=>setDirectorForm({...directorForm,phone:e.target.value})}/></label>
            <label><span>Initial Password</span><input required type="password" minLength={8} placeholder="Minimum 8 characters" value={directorForm.password} onChange={e=>setDirectorForm({...directorForm,password:e.target.value})}/></label>
            <div className="po-form-action"><button disabled={busy}>Create Director</button></div>
          </form>
        </div>

        <div className="po-panel">
          <div className="po-panel-head"><div><h2>Directors</h2><p>Institution-wide management accounts.</p></div></div>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead><tr><th>Director</th><th>Phone</th><th>Branch Access</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {(structure.directors||[]).length===0&&<tr><td colSpan="5" className="po-empty">No Director created yet.</td></tr>}
                {(structure.directors||[]).map(d=><tr key={d._id}>
                  <td><div className="po-primary-cell">{d.name}</div><div className="po-subcell">{d.email}</div></td>
                  <td>{d.phone||'—'}</td>
                  <td><span className="po-access-chip">All Branches</span></td>
                  <td><StatusBadge active={d.isActive}/></td>
                  <td className="po-actions"><div className="po-action-row"><button className={d.isActive?'po-danger-soft':'po-success-soft'} disabled={busy} onClick={()=>toggleDirector(d)}>{d.isActive?'Deactivate':'Activate'}</button><button className="po-secondary-btn small" disabled={busy} onClick={()=>resetDirector(d)}>Reset Password</button></div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </>}

    {tab==='plans'&&<div className="po-panel">
      <div className="po-panel-head"><div><h2>Subscription Plans</h2><p>Available commercial plans configured for the platform.</p></div></div>
      <div className="po-table-wrap">
        <table className="po-table">
          <thead><tr><th>Plan</th><th>Code</th><th>Monthly</th><th>Annual</th></tr></thead>
          <tbody>
            {(plans||[]).length===0&&<tr><td colSpan="4" className="po-empty">No subscription plans configured.</td></tr>}
            {(plans||[]).map(p=><tr key={p._id}>
              <td><div className="po-primary-cell">{p.name}</div></td>
              <td><span className="po-code-chip">{p.code}</span></td>
              <td><strong>{p.currency} {p.monthlyPrice}</strong><div className="po-subcell">per month</div></td>
              <td><strong>{p.currency} {p.annualPrice}</strong><div className="po-subcell">per year</div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}
  </section>;
}
