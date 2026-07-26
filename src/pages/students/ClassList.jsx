import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['AIML-A', 'AIML-B', 'AIML-C', 'AI-A']

export default function ClassList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.from('students').select('*')
      if (error) setError(error.message)
      else setStudents(data)
      setLoading(false)
    }
    load()
  }, [])

  const classSummaries = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const list = students.filter((s) => s.category === cat)
      const placed = list.filter((s) => s.placement_status === 'placed').length
      return { cat, total: list.length, placed }
    })
  }, [students])

  if (loading) return <p className="state-msg">Loading classes&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <div className="class-grid">
      {classSummaries.map((c) => (
        <button key={c.cat} className="class-card" onClick={() => navigate(`/students/details/${c.cat}`)}>
          <div className="class-card__name">{c.cat}</div>
          <div className="class-card__count">{c.total}</div>
          <div className="class-card__sub">{c.total ? `${c.placed} placed` : 'No students yet'}</div>
        </button>
      ))}
    </div>
  )
}
