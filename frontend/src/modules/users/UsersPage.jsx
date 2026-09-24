import{useEffect,useMemo,useState}from'react';
import api from'../../api/client';
import'./users.css';

const idOf=x=>String(x?._id||x?.id||x||'');

export default function UsersPage(){
  const[users,setUsers]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const[filters,setFilters]=useState({type:'all',status:'all',q:''});

  async function load(next=filters){
    try{
      setError('');
      const params=new URLSearchParams();
      if(next.type!=='all')params.set('type',next.type);
      if(next.status!=='all')params.set('status',next.status);
      if(next.q.trim())params.set('q',next.q.trim());
      const{data}=await api.get(`/users${params.toString()?`?${params}`:''}`);
      setUsers(data||[]);
    }catch(e){setError(e.response?.data?.error||e.message)}
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{const t=setTimeout(()=>load(filters),250);return()=>clearTimeout(t)},[filters.type,filters.status,filters.q]);

  async function resetPassword(user){
    if(!window.confirm(`Reset ${user.name}'s password to user@123?`))return;
    setBusy(true);setError('');setMessage('');
    try{const{data}=await api.post(`/users/${user._id}/reset-password`);setMessage(data.message);await load()}catch(e){setError(e.response?.data?.error||e.message)}finally{setBusy(false)}
  }
  async function toggleActive(user){
    const action=user.isActive?'deactivate':'activate';
    if(!window.confirm(`${action[0].toUpperCase()+action.slice(1)} ${user.name}'s login?`))return;
    setBusy(true);setError('');setMessage('');
    try{await api.put(`/users/${user._id}`,{isActive:!user.isActive});setMessage(`User ${action}d successfully.`);await load()}catch(e){setError(e.response?.data?.error||e.message)}finally{setBusy(false)}
  }

  const counts=useMemo(()=>({all:users.length,students:users.filter(u=>u.linkedStudentId).length,employees:users.filter(u=>u.linkedEmployeeId).length}),[users]);
  const typeOf=u=>u.linkedStudentId?'Student':u.linkedEmployeeId?'Employee':'Other';
  const identity=u=>u.linkedStudentId||u.linkedEmployeeId||null;
  const loginText=u=>{
    if(u.linkedStudentId)return [u.linkedStudentId.rollNo||u.loginRollNo,u.emailIsSynthetic?'':u.email].filter(Boolean).join(' / ')||'—';
    if(u.linkedEmployeeId)return [u.cnic||u.linkedEmployeeId.cnic,u.emailIsSynthetic?'':u.email].filter(Boolean).join(' / ')||'—';
    return [u.cnic,u.emailIsSynthetic?'':u.email].filter(Boolean).join(' / ')||'—';
  };

  return <div className="users-page">
    <div className="users-heading"><div><h1>User Accounts</h1><p>Account control only. Student accounts are created when a Roll No is assigned; employee accounts are created from Employee Management.</p></div></div>
    {error&&<div className="users-alert error">{error}</div>}
    {message&&<div className="users-alert success">{message}</div>}

    <section className="users-card">
      <div className="users-card-title"><div><h2>Find Account</h2><small>Search students by Name, Roll No or Email; employees by Name, Employee No, CNIC or Email.</small></div><span className="default-password">Reset default: user@123</span></div>
      <div className="users-filter-grid">
        <label><span>Account Type</span><select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="all">All</option><option value="student">Students</option><option value="employee">Employees</option></select></label>
        <label><span>Status</span><select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="all">All</option><option value="active">Active</option><option value="inactive">Deactivated</option></select></label>
        <label className="users-search"><span>Search</span><input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} placeholder="Name, Roll No, Employee No, CNIC or Email"/></label>
      </div>
    </section>

    <section className="users-card">
      <div className="users-card-title"><div><h2>User Directory</h2><small>{counts.all} account(s) shown</small></div></div>
      <div className="users-table-wrap"><table className="users-table account-only"><thead><tr><th>User</th><th>Type</th><th>Login</th><th>Role(s)</th><th>Linked Record</th><th>Password</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {!users.length?<tr><td colSpan="8" className="users-empty">No matching user accounts.</td></tr>:users.map(u=>{const linked=identity(u);return <tr key={u._id}>
        <td><strong>{u.name}</strong></td>
        <td><span className={`account-type ${typeOf(u).toLowerCase()}`}>{typeOf(u)}</span></td>
        <td><strong>{loginText(u)}</strong></td>
        <td>{(u.roleIds||[]).map(r=>r.name).join(' + ')||'—'}</td>
        <td>{u.linkedStudentId?<><strong>Roll No: {u.linkedStudentId.rollNo||'—'}</strong><small>Student: {u.linkedStudentId.status||'—'}</small></>:u.linkedEmployeeId?<><strong>{u.linkedEmployeeId.employeeNo||u.linkedEmployeeId.employeeCode||'Employee'}</strong><small>{u.linkedEmployeeId.isActive===false?'Left / Inactive':'Active employee'}</small></>:<span>Manual account</span>}</td>
        <td>{u.mustChangePassword?<span className="status-pill warning">Change required</span>:<span className="status-pill ok">Set</span>}</td>
        <td><span className={`status-pill ${u.isActive?'ok':'off'}`}>{u.isActive?'Active':'Deactivated'}</span></td>
        <td><div className="users-actions"><button type="button" disabled={busy} onClick={()=>resetPassword(u)}>Reset Password</button><button type="button" disabled={busy} className={u.isActive?'danger':''} onClick={()=>toggleActive(u)}>{u.isActive?'Deactivate':'Activate'}</button></div></td>
      </tr>})}
      </tbody></table></div>
    </section>
  </div>;
}
