import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_LABELS = { placed: 'Placed', not_placed: 'Not Placed', removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies' }
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }

function formatOfferType(offer) {
  if (!offer || !offer.offer_type) return null
  const label = OFFER_TYPE_LABELS[offer.offer_type]
  return offer.role === 'Internship' ? `Intern/${label}` : label
}

export default function Mentors() {
  const [mentors, setMentors] = useState([])
  const [students, setStudents] = useState([])
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMentor, setSelectedMentor] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [mentorsRes, studentsRes, offersRes, companiesRes] = await Promise.all([
        supabase.from('mentors').select('*').order('name'),
        supabase.from('students').select('*'),
        supabase.from('offers').select('*'),
        supabase.from('companies').select('*'),
      ])
      if (mentorsRes.error || studentsRes.error) {
        setError(mentorsRes.error?.message || studentsRes.error?.message)
      } else {
        setMentors(mentorsRes.data)
        setStudents(studentsRes.data)
        setOffers(offersRes.data || [])
        setCompanies(companiesRes.data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const acceptedOffers = useMemo(() => offers.filter((o) => o.is_accepted), [offers])
  const companyMap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies])

  const rollups = useMemo(() => {
    return mentors.map((m) => {
      const mentees = students.filter((s) => s.mentor_id === m.id)
      const placed = mentees.filter((s) => s.placement_status === 'placed')
      const menteeIds = new Set(placed.map((s) => s.id))
      const ctcs = acceptedOffers.filter((o) => menteeIds.has(o.student_id)).map((o) => Number(o.ctc))
      const avgCtc = ctcs.length ? (ctcs.reduce((a, b) => a + b, 0) / ctcs.length).toFixed(2) : '\u2014'
      const pct = mentees.length ? ((placed.length / mentees.length) * 100).toFixed(0) : '0'
      return { ...m, menteeCount: mentees.length, placedCount: placed.length, pct, avgCtc }
    })
  }, [mentors, students, acceptedOffers])

  const mentor = mentors.find((m) => String(m.id) === selectedMentor)

  const scoped = useMemo(() => {
    if (!mentor) return null
    const mentees = students.filter((s) => s.mentor_id === mentor.id)
    const menteeIds = new Set(mentees.map((s) => s.id))
    const mentorOffers = acceptedOffers.filter((o) => menteeIds.has(o.student_id))

    const offerTypeCounts = { normal: 0, dream: 0, super_dream: 0, marquee: 0 }
    mentorOffers.forEach((o) => { if (o.offer_type) offerTypeCounts[o.offer_type] = (offerTypeCounts[o.offer_type] || 0) + 1 })

    return {
      allocated: mentees.length,
      placed: mentees.filter((s) => s.placement_status === 'placed').length,
      higherStudies: mentees.filter((s) => s.placement_status === 'higher_studies').length,
      offers: mentorOffers.length,
      offerTypeCounts,
      mentees,
    }
  }, [mentor, students, acceptedOffers])

  const offersByStudent = useMemo(() => {
    const map = {}
    offers.forEach((o) => {
      if (!map[o.student_id]) map[o.student_id] = []
      map[o.student_id].push(o)
    })
    return map
  }, [offers])

  if (loading) return <p className="state-msg">Loading mentors&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <>
      <div className="filter-bar">
        <select value={selectedMentor} onChange={(e) => setSelectedMentor(e.target.value)}>
          <option value="all">All Mentors</option>
          {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {selectedMentor !== 'all' && (
          <button
            onClick={() => setSelectedMentor('all')}
            style={{ background: '#fff', border: 'none', borderRadius: 999, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--navy-text)' }}
          >
            Clear
          </button>
        )}
      </div>

      {selectedMentor === 'all' ? (
        <div className="panel">
          <div className="panel__header">
            <h3>Mentor-wise Placement Summary</h3>
            <span>Click a mentor, or use the filter above, to see their student roster</span>
          </div>
          <div className="panel__body">
            <div className="mentor-grid">
              {rollups.map((m) => (
                <div className="mentor-card" key={m.id} onClick={() => setSelectedMentor(String(m.id))} style={{ cursor: 'pointer' }}>
                  <div className="mentor-card__name">{m.name}</div>
                  <div className="mentor-card__email">{m.email}</div>
                  <div className="mentor-card__stats">
                    <div className="mentor-card__stat"><b>{m.menteeCount}</b><span>Mentees</span></div>
                    <div className="mentor-card__stat"><b>{m.placedCount}</b><span>Placed</span></div>
                    <div className="mentor-card__stat"><b>{m.pct}%</b><span>Rate</span></div>
                    <div className="mentor-card__stat"><b>{m.avgCtc}</b><span>Avg CTC</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-card stat-card--yellow">
              <div className="stat-card__label">Higher Studies</div>
              <div className="stat-card__value">{scoped.higherStudies}</div>
            </div>
            <div className="stat-card stat-card--green">
              <div className="stat-card__label">No. of Students Placed</div>
              <div className="stat-card__value">{scoped.placed}</div>
            </div>
            <div className="stat-card stat-card--teal">
              <div className="stat-card__label">Offers</div>
              <div className="stat-card__value">{scoped.offers}</div>
            </div>
            <div className="stat-card stat-card--purple">
              <div className="stat-card__label">No. of Students Allocated</div>
              <div className="stat-card__value">{scoped.allocated}</div>
            </div>
          </div>

          <div className="stat-row stat-row--secondary">
            <div className="stat-card stat-card--purple">
              <div className="stat-card__label">Normal</div>
              <div className="stat-card__value">{scoped.offerTypeCounts.normal}</div>
            </div>
            <div className="stat-card stat-card--yellow">
              <div className="stat-card__label">Dream</div>
              <div className="stat-card__value">{scoped.offerTypeCounts.dream}</div>
            </div>
            <div className="stat-card stat-card--pink">
              <div className="stat-card__label">Super Dream</div>
              <div className="stat-card__value">{scoped.offerTypeCounts.super_dream}</div>
            </div>
            <div className="stat-card stat-card--teal">
              <div className="stat-card__label">Marquee</div>
              <div className="stat-card__value">{scoped.offerTypeCounts.marquee}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel__header">
              <h3>Student Records</h3>
              <span>{scoped.mentees.length} students</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Register No.</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Status</th>
                    <th>Offer Type</th>
                    <th>Offer 1</th>
                    <th>Offer 2</th>
                    <th>Offer 3</th>
                  </tr>
                </thead>
                <tbody>
                  {scoped.mentees.map((s, i) => {
                    const studentOffers = offersByStudent[s.id] || []
                    const primaryOffer = studentOffers.find((o) => o.is_accepted)
                    return (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>{s.register_number}</td>
                        <td>{s.name}</td>
                        <td>{s.category}</td>
                        <td><span className={`badge badge--${s.placement_status}`}>{STATUS_LABELS[s.placement_status]}</span></td>
                        <td>{primaryOffer ? formatOfferType(primaryOffer) : '\u2014'}</td>
                        {[0, 1, 2].map((idx) => (
                          <td key={idx}>{studentOffers[idx] ? `${companyMap[studentOffers[idx].company_id] || '\u2014'} (\u20b9${Number(studentOffers[idx].ctc).toFixed(1)})` : '\u2014'}</td>
                        ))}
                      </tr>
                    )
                  })}
                  {scoped.mentees.length === 0 && (
                    <tr><td colSpan={9} className="state-msg">No students allocated to this mentor yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}