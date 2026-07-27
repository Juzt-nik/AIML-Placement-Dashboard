import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_LABELS = {
  placed: 'Placed', not_placed: 'Not Placed',
  removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies',
}

export default function ClassRoster() {
  const { className } = useParams()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('category', className)
        .order('register_number')
      if (error) setError(error.message)
      else setStudents(data)
      setLoading(false)
    }
    load()
  }, [className])

  if (loading) return <p className="state-msg">Loading roster&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <div className="panel">
      <div className="panel__header">
        <h3>{className}</h3>
        <Link to="/students/details" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>&larr; All Classes</Link>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Register No.</th>
              <th>Name</th>
              <th>CGPA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="clickable-row" onClick={() => navigate(`/students/details/${className}/${s.id}`)}>
                <td>{s.register_number}</td>
                <td>{s.name}</td>
                <td>{s.cgpa ?? '\u2014'}</td>
                <td><span className={`badge badge--${s.placement_status}`}>{STATUS_LABELS[s.placement_status]}</span></td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={4} className="state-msg">No students in this class yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}