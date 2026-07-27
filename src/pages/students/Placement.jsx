import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['AIML-A', 'AIML-B', 'AIML-C', 'AIML-D']
const STATUS_LABELS = { placed: 'Placed', not_placed: 'Not Placed', removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies' }
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }
const TRACK_LABELS = { all: 'All', placement: 'Placement', higher_studies: 'Higher Studies', entrepreneurship: 'Entrepreneurship' }

function matchesTrack(status, track) {
  if (track === 'all') return true
  if (track === 'placement') return status === 'placed' || status === 'not_placed'
  if (track === 'higher_studies') return status === 'higher_studies'
  if (track === 'entrepreneurship') return status === 'removed_from_placement'
  return true
}

// shows "Intern/Dream" style label when the offer is an internship, plain label otherwise
function formatOfferType(offer) {
  if (!offer || !offer.offer_type) return null
  const label = OFFER_TYPE_LABELS[offer.offer_type]
  return offer.role === 'Internship' ? `Intern/${label}` : label
}

export default function Placement() {
  const [students, setStudents] = useState([])
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [mentors, setMentors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [mentorFilter, setMentorFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [offerTypeFilter, setOfferTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [studentsRes, offersRes, companiesRes, mentorsRes] = await Promise.all([
        supabase.from('students').select('*').order('register_number'),
        supabase.from('offers').select('*'),
        supabase.from('companies').select('*'),
        supabase.from('mentors').select('*'),
      ])
      if (studentsRes.error) {
        setError(studentsRes.error.message)
      } else {
        setStudents(studentsRes.data)
        setOffers(offersRes.data || [])
        setCompanies(companiesRes.data || [])
        setMentors(mentorsRes.data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const companyMap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies])
  const mentorMap = useMemo(() => Object.fromEntries(mentors.map((m) => [m.id, m.name])), [mentors])

  // group all offers (accepted + not) per student, ordered, so we can show Offer1..Offer5
  const offersByStudent = useMemo(() => {
    const map = {}
    offers.forEach((o) => {
      if (!map[o.student_id]) map[o.student_id] = []
      map[o.student_id].push(o)
    })
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.offer_date) - new Date(b.offer_date)))
    return map
  }, [offers])

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
      if (mentorFilter !== 'all' && String(s.mentor_id) !== mentorFilter) return false
      if (!matchesTrack(s.placement_status, trackFilter)) return false
      if (search && !(`${s.name} ${s.register_number}`.toLowerCase().includes(search.toLowerCase()))) return false
      const studentOffers = offersByStudent[s.id] || []
      if (companyFilter !== 'all' && !studentOffers.some((o) => String(o.company_id) === companyFilter)) return false
      if (offerTypeFilter !== 'all' && !studentOffers.some((o) => o.offer_type === offerTypeFilter)) return false
      return true
    })
  }, [students, categoryFilter, mentorFilter, trackFilter, companyFilter, offerTypeFilter, search, offersByStudent])

  if (loading) return <p className="state-msg">Loading students&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <>
      <div className="filter-bar">
        <select value={mentorFilter} onChange={(e) => setMentorFilter(e.target.value)}>
          <option value="all">All Mentors</option>
          {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
          {Object.entries(TRACK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
          <option value="all">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={offerTypeFilter} onChange={(e) => setOfferTypeFilter(e.target.value)}>
          <option value="all">All Offer Types</option>
          {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search name / reg no&hellip;"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="filter-bar__count">{filtered.length} students</span>
      </div>

      <div className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Register No.</th>
                <th>Student Name</th>
                <th>Category</th>
                <th>Offer Type</th>
                <th>Offer 1</th>
                <th>Offer 2</th>
                <th>Offer 3</th>
                <th>Offer 4</th>
                <th>Offer 5</th>
                <th>Mentor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const studentOffers = offersByStudent[s.id] || []
                const primaryOffer = studentOffers.find((o) => o.is_accepted)
                return (
                  <tr key={s.id}>
                    <td>{s.register_number}</td>
                    <td>{s.name}</td>
                    <td>{s.category}</td>
                    <td>{primaryOffer ? formatOfferType(primaryOffer) : <span className={`badge badge--${s.placement_status}`}>{STATUS_LABELS[s.placement_status]}</span>}</td>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <td key={i}>{studentOffers[i] ? `${companyMap[studentOffers[i].company_id] || '\u2014'} (\u20b9${Number(studentOffers[i].ctc).toFixed(1)})` : '\u2014'}</td>
                    ))}
                    <td>{mentorMap[s.mentor_id] || '\u2014'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="state-msg">No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}