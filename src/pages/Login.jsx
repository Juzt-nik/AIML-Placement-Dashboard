import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const from = location.state?.from?.pathname || '/'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/cllglogo.png" alt="College logo" className="letterhead__logo" style={{ margin: '0 auto 16px', display: 'block' }} />

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="letterhead__eyebrow">Department of AIML</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy-text)' }}>Advisor &amp; Mentor Sign In</div>
        </div>

        {error && (
          <div style={{ background: 'var(--pastel-pink-bg)', color: 'var(--pastel-pink-text)', fontSize: 13, padding: '8px 12px', marginBottom: 16, borderRadius: 6 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', marginBottom: 14, border: '1px solid var(--border)', borderRadius: 6, fontSize: 14 }}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', marginBottom: 20, border: '1px solid var(--border)', borderRadius: 6, fontSize: 14 }}
        />

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Signing in\u2026' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}