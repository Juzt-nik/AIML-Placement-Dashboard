import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatCompFromData } from '../lib/compensation'

const CHANGE_TYPE_LABELS = { mark_placed: 'Mark Placed', update_details: 'Update Details' }
const STATUS_LABELS = { placed: 'Placed', not_placed: 'Not Placed', removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies' }

export default function Requests() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [students, setStudents] = useState([])
  const [requesterProfiles, setRequesterProfiles] = useState([])
  const [mentors, setMentors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [filter, setFilter] = useState('pending')

  async function loadAll() {
    setLoading(true)
    const [reqRes, studentsRes, profilesRes, mentorsRes] = await Promise.all([
      supabase.from('change_requests').select('*').order('requested_at', { ascending: false }),
      supabase.from('students').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('mentors').select('*').order('id'),
    ])
    if (reqRes.error) {
      setError(reqRes.error.message)
    } else {
      setRequests(reqRes.data || [])
      setStudents(studentsRes.data || [])
      setRequesterProfiles(profilesRes.data || [])
      setMentors(mentorsRes.data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const studentMap = Object.fromEntries(students.map((s) => [s.id, s]))
  const profileMap = Object.fromEntries(requesterProfiles.map((p) => [p.id, p]))
  const mentorMap = Object.fromEntries(mentors.map((m) => [m.id, m]))

  function requesterName(requestedBy) {
    const p = profileMap[requestedBy]
    if (!p) return '\u2014'
    if (p.role === 'fa') return `Class FA (${p.assigned_class || 'unknown class'})`
    const m = mentorMap[p.mentor_id]
    return m ? m.name : p.email
  }

  async function approve(id) {
    setBusyId(id)
    setActionError(null)
    const { error: rpcErr } = await supabase.rpc('approve_change_request', { request_id: id })
    if (rpcErr) {
      setActionError(rpcErr.message)
      setBusyId(null)
      return
    }
    setBusyId(null)
    await loadAll()
  }

  async function reject(id) {
    setBusyId(id)
    setActionError(null)
    const { error: updErr } = await supabase.from('change_requests')
      .update({ status: 'rejected', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (updErr) {
      setActionError(updErr.message)
      setBusyId(null)
      return
    }
    setBusyId(null)
    await loadAll()
  }

  const visible = requests.filter((r) => filter === 'all' || r.status === filter)

  if (loading) return <p className="state-msg">Loading requests&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <>
      <div className="filter-bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <span className="filter-bar__count">{visible.length} requests</span>
      </div>

      {actionError && <div className="form-error">{actionError}</div>}

      <div className="panel">
        <div className="panel__header">
          <h3>Change Requests</h3>
          <span>Submitted by mentors, pending your review</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Requested</th>
                <th>Student</th>
                <th>Mentor</th>
                <th>Change</th>
                <th>Details</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const s = studentMap[r.student_id]
                const d = r.proposed_data || {}
                return (
                  <tr key={r.id}>
                    <td>{new Date(r.requested_at).toLocaleDateString('en-IN')}</td>
                    <td>{s ? <Link to={`/students/details/${s.category}/${s.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>{s.name} ({s.register_number})</Link> : '\u2014'}</td>
                    <td>{requesterName(r.requested_by)}</td>
                    <td>{CHANGE_TYPE_LABELS[r.change_type] || r.change_type}</td>
                    <td>
                      {r.change_type === 'mark_placed' ? (
                        <>
                          {d.company || ''}
                          {d.role ? ` \u2014 ${d.role}` : ''}
                          {d.ctc ? ` (${formatCompFromData(d)})` : ''}
                          {d.offer_type ? `, ${d.offer_type}` : ''}
                        </>
                      ) : r.change_type === 'update_details' ? (
                        [
                          d.placement_status ? `Status \u2192 ${STATUS_LABELS[d.placement_status] || d.placement_status}` : null,
                          d.cgpa != null ? `CGPA \u2192 ${d.cgpa}` : null,
                          d.tenth_percent != null ? `10th% \u2192 ${d.tenth_percent}` : null,
                          d.twelfth_percent != null ? `12th% \u2192 ${d.twelfth_percent}` : null,
                        ].filter(Boolean).join(', ')
                      ) : JSON.stringify(d)}
                    </td>
                    <td><span className={`badge badge--${r.status === 'pending' ? 'not_placed' : r.status === 'approved' ? 'placed' : 'removed_from_placement'}`}>{r.status}</span></td>
                    <td>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="export-btn export-btn--docx" style={{ padding: '5px 12px' }} disabled={busyId === r.id} onClick={() => approve(r.id)}>
                            {busyId === r.id ? '\u2026' : 'Approve'}
                          </button>
                          <button className="link-btn" onClick={() => reject(r.id)}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="state-msg">No {filter !== 'all' ? filter : ''} requests.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}