import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['AIML-A', 'AIML-B', 'AIML-C', 'AIML-D']
const STATUS_COLORS = { placed: '#1f7a3d', not_placed: '#b23b3b', higher_studies: '#916a0a', removed_from_placement: '#8a8d94' }
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }

export default function Dashboard() {
  const [students, setStudents] = useState([])
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [classFilter, setClassFilter] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [studentsRes, offersRes, companiesRes] = await Promise.all([
        supabase.from('students').select('*'),
        supabase.from('offers').select('*').eq('is_accepted', true),
        supabase.from('companies').select('*'),
      ])
      if (studentsRes.error || offersRes.error || companiesRes.error) {
        setError(studentsRes.error?.message || offersRes.error?.message || companiesRes.error?.message)
      } else {
        setStudents(studentsRes.data)
        setOffers(offersRes.data)
        setCompanies(companiesRes.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  const scopedStudents = useMemo(
    () => (classFilter === 'all' ? students : students.filter((s) => s.category === classFilter)),
    [students, classFilter]
  )
  const scopedIds = useMemo(() => new Set(scopedStudents.map((s) => s.id)), [scopedStudents])
  const scopedOffers = useMemo(() => offers.filter((o) => scopedIds.has(o.student_id)), [offers, scopedIds])

  const stats = useMemo(() => {
    const total = scopedStudents.length
    const placed = scopedStudents.filter((s) => s.placement_status === 'placed').length
    const higherStudies = scopedStudents.filter((s) => s.placement_status === 'higher_studies').length
    const removedFromPlacement = scopedStudents.filter((s) => s.placement_status === 'removed_from_placement').length
    const notPlaced = scopedStudents.filter((s) => s.placement_status === 'not_placed').length
    const placementPool = total - higherStudies - removedFromPlacement
    return { total, placed, higherStudies, notPlaced, placementPool, offers: scopedOffers.length }
  }, [scopedStudents, scopedOffers])

  const offerTypeCounts = useMemo(() => {
    const counts = { normal: 0, dream: 0, super_dream: 0, marquee: 0 }
    scopedOffers.forEach((o) => { if (o.offer_type) counts[o.offer_type] = (counts[o.offer_type] || 0) + 1 })
    return counts
  }, [scopedOffers])

  const statusBreakdown = useMemo(() => {
    const counts = { placed: 0, not_placed: 0, higher_studies: 0, removed_from_placement: 0 }
    scopedStudents.forEach((s) => { counts[s.placement_status] = (counts[s.placement_status] || 0) + 1 })
    return [
      { name: 'Placed', key: 'placed', value: counts.placed },
      { name: 'Not Placed', key: 'not_placed', value: counts.not_placed },
      { name: 'Higher Studies', key: 'higher_studies', value: counts.higher_studies },
      { name: 'Entrepreneurship', key: 'removed_from_placement', value: counts.removed_from_placement },
    ].filter((d) => d.value > 0)
  }, [scopedStudents])

  const companyOffers = useMemo(() => {
    const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]))
    const counts = {}
    scopedOffers.forEach((o) => {
      const name = companyMap[o.company_id] || 'Unknown'
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [scopedOffers, companies])

  if (loading) return <p className="state-msg">Loading dashboard&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <>
      <div className="filter-bar">
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="all">All Classes</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="stat-row">
        <div className="stat-card stat-card--purple">
          <div className="stat-card__label">Strength</div>
          <div className="stat-card__value">{stats.total.toLocaleString()}</div>
        </div>
        <div className="stat-card stat-card--yellow">
          <div className="stat-card__label">Higher Studies</div>
          <div className="stat-card__value">{stats.higherStudies}</div>
        </div>
        <div className="stat-card stat-card--purple">
          <div className="stat-card__label">Placement</div>
          <div className="stat-card__value">{stats.placementPool}</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-card__label">Placed</div>
          <div className="stat-card__value">{stats.placed}</div>
        </div>
        <div className="stat-card stat-card--pink">
          <div className="stat-card__label">Not Placed</div>
          <div className="stat-card__value">{stats.notPlaced}</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card stat-card--teal">
          <div className="stat-card__label">Offers</div>
          <div className="stat-card__value">{stats.offers}</div>
        </div>
        <div className="stat-card stat-card--purple">
          <div className="stat-card__label">Normal</div>
          <div className="stat-card__value">{offerTypeCounts.normal}</div>
        </div>
        <div className="stat-card stat-card--yellow">
          <div className="stat-card__label">Dream</div>
          <div className="stat-card__value">{offerTypeCounts.dream}</div>
        </div>
        <div className="stat-card stat-card--pink">
          <div className="stat-card__label">Super Dream</div>
          <div className="stat-card__value">{offerTypeCounts.super_dream}</div>
        </div>
        <div className="stat-card stat-card--teal">
          <div className="stat-card__label">Marquee</div>
          <div className="stat-card__value">{offerTypeCounts.marquee}</div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel__header">
            <h3>Offers by Company</h3>
            <span>Top recruiters this cycle</span>
          </div>
          <div className="panel__body" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyOffers} margin={{ left: -10 }}>
                <CartesianGrid stroke="#e2e5ec" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1a4bb8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h3>Placement Status</h3>
            <span>{classFilter === 'all' ? 'All classes' : classFilter}</span>
          </div>
          <div className="panel__body" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusBreakdown.map((entry) => <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />)}
                </Pie>
                <Legend verticalAlign="bottom" height={30} iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  )
}