import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import WingsPage from '../wings/WingsPage';
import './collegeProfile.css';

const TABS = [
  ['profile', 'College Profile'],
  ['branches', 'Branches'],
  ['wings', 'Wings'],
  ['designations', 'Designations']
];


const THEME_OPTIONS = [
  ['classic_blue', 'Classic Blue'],
  ['royal_indigo', 'Royal Indigo'],
  ['emerald', 'Emerald'],
  ['teal', 'Teal'],
  ['forest', 'Forest Green'],
  ['slate', 'Slate'],
  ['maroon', 'Maroon'],
  ['rose', 'Rose'],
  ['amber', 'Amber'],
  ['graphite', 'Graphite']
];

const emptyBranch = { name: '', code: '', address: '', contactNo: '' };
function errorText(e) {
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Request failed';
}

function ProfileTab({ data, reload }) {
  const { refresh } = useAuth();
  const college = data?.college || {};
  const [form, setForm] = useState({});
  const [logo, setLogo] = useState(null);
  const [banner, setBanner] = useState(null);
  const logoInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      name: college.name || '',
      email: college.email || '',
      website: college.website || '',
      educationalSlogan: college.educationalSlogan || '',
      themePreset: college.theme?.preset || 'classic_blue',
      feeVoucherMode: college.feeVoucherMode || 'bank_and_cash'
    });
  }, [college._id, college.updatedAt]);

  const logoPreview = useMemo(() => logo ? URL.createObjectURL(logo) : (college.logoUrl || ''), [logo, college.logoUrl]);
  const bannerPreview = useMemo(() => banner ? URL.createObjectURL(banner) : (college.bannerUrl || ''), [banner, college.bannerUrl]);
  useEffect(() => () => { if (logoPreview && logo) URL.revokeObjectURL(logoPreview); }, [logoPreview, logo]);
  useEffect(() => () => { if (bannerPreview && banner) URL.revokeObjectURL(bannerPreview); }, [bannerPreview, banner]);

  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api.put('/college-profile', form);
      if (logo) {
        const fd = new FormData(); fd.append('logo', logo);
        await api.post('/college-profile/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      if (banner) {
        const fd = new FormData(); fd.append('banner', banner);
        await api.post('/college-profile/banner', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setLogo(null); setBanner(null);
      await Promise.all([reload(), refresh()]);
      setMessage('College Profile saved.');
    } catch (e2) { setError(errorText(e2)); }
    finally { setBusy(false); }
  }

  return <section className="cp-panel">
    <div className="cp-section-title"><div><h2>College Profile</h2><p>Institution identity, branding and operating defaults.</p></div></div>
    {error && <div className="cp-error">{error}</div>}{message && <div className="cp-success">{message}</div>}
    <form className="cp-form-grid" onSubmit={save}>
      <label><span>College Name *</span><input required value={form.name || ''} onChange={e => setForm({...form, name:e.target.value})}/></label>
      <label><span>Fee Voucher Mode</span><select value={form.feeVoucherMode || 'bank_and_cash'} onChange={e => setForm({...form, feeVoucherMode:e.target.value})}><option value="cash_only">Cash Only</option><option value="bank_only">Bank Only</option><option value="bank_and_cash">Bank &amp; Cash</option></select></label>
      <label><span>Email</span><input type="email" value={form.email || ''} onChange={e => setForm({...form, email:e.target.value})}/></label>
      <label><span>Website</span><input value={form.website || ''} onChange={e => setForm({...form, website:e.target.value})}/></label>
      <label className="cp-span-2"><span>Educational Slogan</span><input maxLength="120" placeholder="e.g. Education Empowers Better Futures" value={form.educationalSlogan || ''} onChange={e => setForm({...form, educationalSlogan:e.target.value})}/></label>

      <label className="cp-span-2"><span>Theme</span><select value={form.themePreset || 'classic_blue'} onChange={e=>setForm({...form,themePreset:e.target.value})}>{THEME_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>

      <div className="cp-span-2 cp-branding-section">
        <div className="cp-branding-heading"><h3>Branding</h3><p>Upload the college logo and optional page banner.</p></div>
        <div className="cp-branding-grid">
          <div className="cp-brand-card cp-logo-card">
            <div className="cp-brand-card-head"><strong>College Logo</strong><small>PNG/JPG/WEBP • max 5 MB</small></div>
            <div className="cp-logo-stage">
              {logoPreview ? <img className="cp-logo-preview" src={logoPreview} alt="College logo preview"/> : <div className="cp-logo-placeholder"><strong>College Logo</strong><small>Any aspect ratio</small></div>}
            </div>
            <div className="cp-file-picker-row">
              <input ref={logoInputRef} className="cp-native-file-hidden" style={{display:'none'}} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setLogo(e.target.files?.[0] || null)} />
              <button type="button" className="cp-upload-button" onClick={() => logoInputRef.current?.click()}>Choose Logo</button>
              <small className="cp-selected-file">{logo?.name || 'No new file selected'}</small>
            </div>
            <small className="cp-help">Transparent PNG recommended. Logo keeps its original shape and aspect ratio.</small>
          </div>

          <div className="cp-brand-card cp-banner-card">
            <div className="cp-brand-card-head"><strong>Banner Image</strong><small>Recommended 1600 × 300 px • max 5 MB</small></div>
            <div className="cp-banner-stage">
              {bannerPreview ? <img className="cp-banner-preview" src={bannerPreview} alt="College banner preview"/> : <div className="cp-banner-placeholder"><strong>Banner Image</strong><small>1600 × 300 px recommended</small></div>}
            </div>
            <div className="cp-file-picker-row">
              <input ref={bannerInputRef} className="cp-native-file-hidden" style={{display:'none'}} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setBanner(e.target.files?.[0] || null)} />
              <button type="button" className="cp-upload-button" onClick={() => bannerInputRef.current?.click()}>Choose Banner</button>
              <small className="cp-selected-file">{banner?.name || 'No new file selected'}</small>
            </div>
            <small className="cp-help">Recommended 1600 × 300 px. Custom banners are displayed without cropping or software overlays.</small>
          </div>
        </div>
      </div>

      <div className="cp-span-2 cp-note"><strong>Branch entitlement:</strong> {data?.branchCount || 0} of {college.branchLimit || 1} branches created. Branch addresses and contact details are maintained in the Branches tab.</div>
      <div className="cp-span-2 cp-actions"><button disabled={busy}>{busy ? 'Saving...' : 'Save College Profile'}</button></div>
    </form>
  </section>;
}

function BranchesTab({ profileData, reloadProfile }) {
  const [data, setData] = useState({branches:[],branchLimit:1});
  const [form, setForm] = useState(emptyBranch);
  const [editingId, setEditingId] = useState('');
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function load(){ const r=await api.get('/college-profile/branches'); setData(r.data || {branches:[],branchLimit:1}); }
  useEffect(()=>{load().catch(e=>setError(errorText(e)));},[]);
  function edit(b){setEditingId(b._id);setForm({name:b.name||'',code:b.code||'',address:b.address||'',contactNo:b.contactNo||''});}
  function reset(){setEditingId('');setForm(emptyBranch);setError('');}
  async function save(e){e.preventDefault();setBusy(true);setError('');try{if(editingId)await api.put(`/college-profile/branches/${editingId}`,form);else await api.post('/college-profile/branches',form);reset();await Promise.all([load(),reloadProfile()]);}catch(e2){setError(errorText(e2));}finally{setBusy(false);}}
  async function toggle(b){setBusy(true);setError('');try{await api.put(`/college-profile/branches/${b._id}`,{isActive:b.isActive===false});await Promise.all([load(),reloadProfile()]);}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  const branchCount=(data.branches||[]).length;
  return <section className="cp-panel"><div className="cp-section-title"><div><h2>Branches</h2><p>Director/Admin can create and manage branches within the Platform Owner branch limit.</p></div><span className="cp-badge">{branchCount} / {data.branchLimit} branches</span></div>
    {error&&<div className="cp-error">{error}</div>}
    <form className="cp-branch-form" onSubmit={save}><input required placeholder="Branch name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input required placeholder="Code" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="Contact" value={form.contactNo} onChange={e=>setForm({...form,contactNo:e.target.value})}/><button disabled={busy}>{editingId?'Update Branch':'Add Branch'}</button>{editingId&&<button type="button" className="cp-secondary" onClick={reset}>Cancel</button>}</form>
    <div className="cp-table-wrap"><table className="cp-table"><thead><tr><th>Branch</th><th>Code</th><th>Address</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.branches.map(b=><tr key={b._id}><td>{b.name}</td><td>{b.code}</td><td>{b.address||'—'}</td><td>{b.contactNo||'—'}</td><td>{b.isActive===false?'Inactive':'Active'}</td><td><button type="button" onClick={()=>edit(b)}>Edit</button> <button type="button" className="cp-link" onClick={()=>toggle(b)}>{b.isActive===false?'Activate':'Deactivate'}</button></td></tr>)}{!data.branches.length&&<tr><td colSpan="6">No branches created yet.</td></tr>}</tbody></table></div>
  </section>;
}

function DesignationsTab() {
  const [items,setItems]=useState([]),[busy,setBusy]=useState(''),[adding,setAdding]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
  async function load(){const r=await api.get('/designations');setItems(r.data||[]);} useEffect(()=>{load().catch(e=>setError(errorText(e)));},[]);
  async function toggle(d){setBusy(d._id);setError('');try{await api.put(`/designations/${d._id}`,{isActive:d.isActive===false});await load();}catch(e){setError(errorText(e));}finally{setBusy('');}}
  async function add(category){if(!name.trim())return setError('Designation name is required.');setBusy(`new-${category}`);setError('');try{await api.post('/designations',{name:name.trim(),category});setAdding('');setName('');await load();}catch(e){setError(errorText(e));}finally{setBusy('');}}
  function column(category,title){const rows=items.filter(x=>x.category===category);return <div className="cp-designation-column"><h3>{title}</h3><div className="cp-designation-list">{rows.map(d=><label key={d._id}><input type="checkbox" checked={d.isActive!==false} disabled={Boolean(busy)} onChange={()=>toggle(d)}/><span>{d.name}</span>{!d.isSystemDefault&&<small>Custom</small>}</label>)}</div>{adding===category?<div className="cp-add-inline"><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Designation name"/><button type="button" onClick={()=>add(category)}>Save</button><button type="button" className="cp-secondary" onClick={()=>{setAdding('');setName('')}}>Cancel</button></div>:<button type="button" className="cp-add-new" onClick={()=>{setAdding(category);setName('')}}>+ Add New</button>}</div>}
  return <section className="cp-panel"><div className="cp-section-title"><div><h2>Designations</h2><p>Select predefined designations or add college-specific designations.</p></div></div>{error&&<div className="cp-error">{error}</div>}<div className="cp-designation-grid">{column('academic_staff','Academic')}{column('non_teaching_staff','Non-Teaching')}</div></section>;
}

export default function CollegeProfilePage(){
  const location=useLocation();
  const navigate=useNavigate();
  const validTabs=new Set(TABS.map(([value])=>value));
  const requestedTab=new URLSearchParams(location.search).get('tab')||'profile';
  const tab=validTabs.has(requestedTab)?requestedTab:'profile';
  const [profileData,setProfileData]=useState({college:null,branchCount:0}),[error,setError]=useState('');
  async function loadProfile(){const r=await api.get('/college-profile');setProfileData(r.data||{});return r.data;}
  useEffect(()=>{loadProfile().catch(e=>setError(errorText(e)));},[]);
  function changeTab(nextTab){
    const params=new URLSearchParams(location.search);
    if(nextTab==='profile')params.delete('tab');else params.set('tab',nextTab);
    const query=params.toString();
    navigate(`/college-profile${query?`?${query}`:''}`);
  }
  return <div className="college-profile-page"><div className="cp-head"><div><h1>College Profile</h1><p>Manage institutional profile, structure and branding.</p></div></div><div className="cp-tabs module-top-tabs">{TABS.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>changeTab(v)}>{l}</button>)}</div>{error&&<div className="cp-error">{error}</div>}{tab==='profile'&&<ProfileTab data={profileData} reload={loadProfile}/>} {tab==='branches'&&<BranchesTab profileData={profileData} reloadProfile={loadProfile}/>} {tab==='wings'&&<WingsPage embedded/>} {tab==='designations'&&<DesignationsTab/>}</div>;
}
