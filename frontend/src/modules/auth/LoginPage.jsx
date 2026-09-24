import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const data = await login(form);
      nav(data.user?.mustChangePassword ? '/change-password' : '/');
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>College Management</h1>
        {err && <p className="error">{err}</p>}
        <input
          type="text"
          placeholder="Email or CNIC"
          autoComplete="username"
          required
          value={form.identifier}
          onChange={e => setForm({ ...form, identifier: e.target.value })}
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
        />
        <button>Login</button>
      </form>
    </main>
  );
}
