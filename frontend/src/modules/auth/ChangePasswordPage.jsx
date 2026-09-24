import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../contexts/AuthContext';

export default function ChangePasswordPage(){
  const{changePassword,logout}=useAuth();
  const nav=useNavigate();
  const[form,setForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const[error,setError]=useState(''),[busy,setBusy]=useState(false);

  async function submit(e){
    e.preventDefault();setError('');
    if(form.newPassword!==form.confirmPassword)return setError('New password and confirmation do not match.');
    if(form.newPassword.length<8)return setError('New password must be at least 8 characters.');
    setBusy(true);
    try{
      await changePassword({currentPassword:form.currentPassword,newPassword:form.newPassword});
      nav('/',{replace:true});
    }catch(e2){setError(e2.response?.data?.error||e2.message)}finally{setBusy(false)}
  }

  return <main className="login">
    <form onSubmit={submit}>
      <h1>Change Password</h1>
      <p style={{marginTop:-4,color:'#64748b'}}>You must set your own password before using CollegeCMS.</p>
      {error&&<p className="error">{error}</p>}
      <input type="password" autoComplete="current-password" placeholder="Current / Default Password" required value={form.currentPassword} onChange={e=>setForm({...form,currentPassword:e.target.value})}/>
      <input type="password" autoComplete="new-password" placeholder="New Password" required minLength={8} value={form.newPassword} onChange={e=>setForm({...form,newPassword:e.target.value})}/>
      <input type="password" autoComplete="new-password" placeholder="Confirm New Password" required minLength={8} value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})}/>
      <button disabled={busy}>{busy?'Updating...':'Change Password'}</button>
      <button type="button" onClick={logout} style={{marginTop:8,background:'#e2e8f0',color:'#0f172a'}}>Logout</button>
    </form>
  </main>;
}
