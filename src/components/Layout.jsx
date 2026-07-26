import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/students', label: 'Students' },
  { to: '/mentors', label: 'Mentors' },
  { to: '/report', label: 'Report' },
]

export default function Layout({ children }) {
  const { session, signOut, isCoordinator } = useAuth()
  const navItems = isCoordinator ? [...NAV_ITEMS, { to: '/requests', label: 'Requests' }] : NAV_ITEMS

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__label">Navigation</div>
        <nav>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="content">
        <div className="letterhead">
          <img src="/cllglogo.png" alt="College logo" className="letterhead__logo" />
          <div className="letterhead__divider" />
          <div>
            <div className="letterhead__eyebrow">Department of Artificial Intelligence and Machine Learning</div>
            <div className="letterhead__title">Placement Statistics AY 2026&ndash;2027</div>
          </div>
          {session && (
            <div className="letterhead__account">
              <span>{session.user.email}</span>
              <button className="letterhead__signout" onClick={signOut}>Sign Out</button>
            </div>
          )}
        </div>

        {children}
      </main>

      <nav className="bottom-nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}