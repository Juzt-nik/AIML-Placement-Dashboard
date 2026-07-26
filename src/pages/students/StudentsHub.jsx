import { NavLink, Outlet } from 'react-router-dom'

export default function StudentsHub() {
  return (
    <>
      <div className="subtab-bar">
        <NavLink to="/students/details" className={({ isActive }) => (isActive ? 'active' : '')}>
          Student Details
        </NavLink>
        <NavLink to="/students/placement" className={({ isActive }) => (isActive ? 'active' : '')}>
          Placement
        </NavLink>
      </div>
      <Outlet />
    </>
  )
}
