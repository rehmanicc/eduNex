import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [form, setForm] = useState({
    collegeCode: '',
    identifier: '',
    password: ''
  });

  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setSubmitting(true);

    try {
      const data = await login({
        collegeCode: form.collegeCode.trim(),
        identifier: form.identifier.trim(),
        password: form.password
      });

      nav(data.user?.mustChangePassword ? '/change-password' : '/');
    } catch (e2) {
      setErr(
        e2.response?.data?.error ||
        e2.message ||
        'Unable to sign in'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-standalone">
      <main>
        <section className="login-section">
          <div className="login-wrap">
            <form className="login-panel" onSubmit={submit}>

              <div className="login-brand">
                <div className="login-brand-name">
                  edu<span>Nex</span>
                </div>
                <div className="login-brand-subtitle">
                  CAMPUS MANAGEMENT
                </div>
              </div>

              <p className="login-intro">
                Sign in to your account
              </p>

              {err && (
                <p className="login-error" role="alert">
                  {err}
                </p>
              )}

              <div className="login-fields">

                <div className="login-field">
                  <label htmlFor="collegeCode">
                    Institute / College Code
                  </label>
                  <input
                    id="collegeCode"
                    type="text"
                    placeholder="Enter institute code"
                    autoComplete="organization"
                    value={form.collegeCode}
                    onChange={e =>
                      setForm({
                        ...form,
                        collegeCode: e.target.value.toUpperCase()
                      })
                    }
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="identifier">
                    Email / CNIC
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    placeholder="Enter your email or CNIC"
                    autoComplete="username"
                    required
                    value={form.identifier}
                    onChange={e =>
                      setForm({
                        ...form,
                        identifier: e.target.value
                      })
                    }
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    value={form.password}
                    onChange={e =>
                      setForm({
                        ...form,
                        password: e.target.value
                      })
                    }
                  />
                </div>

              </div>

              <button
                className="login-action"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Signing in…' : 'Login'}
              </button>

              <div className="login-help">
                <a href="mailto:trackiatech@gmail.com?subject=eduNex%20account%20deletion%20request">
                  Request deletion of your account
                </a>

                <span>
                  Need help?{' '}
                  <a href="mailto:trackiatech@gmail.com">
                    trackiatech@gmail.com
                  </a>
                </span>
              </div>

              <div className="login-powered">
                Powered by <strong>TrackiaTech</strong>
              </div>

            </form>
          </div>
        </section>
      </main>
    </div>
  );
}