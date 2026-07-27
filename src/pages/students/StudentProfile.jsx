import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const STATUS_LABELS = {
  placed: 'Placed', not_placed: 'Not Placed',
  removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies',
}
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }
const REQUEST_STATUS_BADGE = { pending: 'not_placed', approved: 'placed', rejected: 'removed_from_placement' }

const emptyOfferForm = { companyId: '', newCompany: '', role: 'Direct Offer', ctc: '', offerType: 'dream', offerDate: '', isAccepted: true }
const emptyRequestForm = { company: '', role: 'Direct Offer', ctc: '', offerType: 'dream', offerDate: '' }

// shows "Intern/Dream" style label when the offer is an internship, plain label otherwise
function formatOfferType(offer) {
  if (!offer || !offer.offer_type) return null
  const label = OFFER_TYPE_LABELS[offer.offer_type]
  return offer.role === 'Internship' ? `Intern/${label}` : label
}

export default function StudentProfile() {
  const { className, studentId } = useParams()
  const { profile, isCoordinator } = useAuth()

  const [student, setStudent] = useState(null)
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [mentor, setMentor] = useState(null)
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState(null)

  const [addingOffer, setAddingOffer] = useState(false)
  const [offerForm, setOfferForm] = useState(emptyOfferForm)
  const [savingOffer, setSavingOffer] = useState(false)
  const [offerError, setOfferError] = useState(null)

  const [requesting, setRequesting] = useState(false)
  const [requestForm, setRequestForm] = useState(emptyRequestForm)
  const [savingRequest, setSavingRequest] = useState(false)
  const [requestError, setRequestError] = useState(null)

  const [requestingDetails, setRequestingDetails] = useState(false)
  const [detailsRequestForm, setDetailsRequestForm] = useState(null)
  const [savingDetailsRequest, setSavingDetailsRequest] = useState(false)
  const [detailsRequestError, setDetailsRequestError] = useState(null)

  async function loadAll() {
    setLoading(true)
    const { data: s, error: sErr } = await supabase.from('students').select('*').eq('id', studentId).single()
    if (sErr) { setError(sErr.message); setLoading(false); return }

    const [offersRes, companiesRes, mentorRes, requestsRes] = await Promise.all([
      supabase.from('offers').select('*').eq('student_id', studentId),
      supabase.from('companies').select('*').order('name'),
      s.mentor_id ? supabase.from('mentors').select('*').eq('id', s.mentor_id).single() : Promise.resolve({ data: null }),
      supabase.from('change_requests').select('*').eq('student_id', studentId).order('requested_at', { ascending: false }),
    ])

    setStudent(s)
    setOffers(offersRes.data || [])
    setCompanies(companiesRes.data || [])
    setMentor(mentorRes.data || null)
    setMyRequests(requestsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [studentId])

  function startEdit() {
    setEditForm({
      placement_status: student.placement_status,
      cgpa: student.cgpa ?? '',
      tenth_percent: student.tenth_percent ?? '',
      twelfth_percent: student.twelfth_percent ?? '',
    })
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit() {
    setSavingEdit(true)
    setEditError(null)
    const { error: updErr } = await supabase.from('students').update({
      placement_status: editForm.placement_status,
      cgpa: editForm.cgpa === '' ? null : Number(editForm.cgpa),
      tenth_percent: editForm.tenth_percent === '' ? null : Number(editForm.tenth_percent),
      twelfth_percent: editForm.twelfth_percent === '' ? null : Number(editForm.twelfth_percent),
    }).eq('id', studentId)

    if (updErr) {
      setEditError(updErr.message.includes('policy') || updErr.code === '42501'
        ? 'You don\u2019t have permission to edit student records directly.'
        : updErr.message)
      setSavingEdit(false)
      return
    }
    setSavingEdit(false)
    setEditing(false)
    await loadAll()
  }

  async function saveOffer() {
    setSavingOffer(true)
    setOfferError(null)

    let companyId = offerForm.companyId
    if (!companyId && offerForm.newCompany.trim()) {
      const { data: newCo, error: coErr } = await supabase
        .from('companies').insert({ name: offerForm.newCompany.trim() }).select().single()
      if (coErr) {
        setOfferError(coErr.message)
        setSavingOffer(false)
        return
      }
      companyId = newCo.id
    }

    if (!companyId) {
      setOfferError('Choose an existing company or type a new one.')
      setSavingOffer(false)
      return
    }
    if (!offerForm.ctc) {
      setOfferError('CTC is required.')
      setSavingOffer(false)
      return
    }

    const { error: offErr } = await supabase.from('offers').insert({
      student_id: studentId,
      company_id: companyId,
      role: offerForm.role || null,
      ctc: Number(offerForm.ctc),
      offer_type: offerForm.offerType,
      offer_date: offerForm.offerDate || null,
      is_accepted: offerForm.isAccepted,
    })

    if (offErr) {
      setOfferError(offErr.message.includes('policy') || offErr.code === '42501'
        ? 'You don\u2019t have permission to add offers directly.'
        : offErr.message)
      setSavingOffer(false)
      return
    }

    if (offerForm.isAccepted && student.placement_status !== 'placed') {
      await supabase.from('students').update({ placement_status: 'placed' }).eq('id', studentId)
    }

    setSavingOffer(false)
    setAddingOffer(false)
    setOfferForm(emptyOfferForm)
    await loadAll()
  }

  async function deleteOffer(offerId) {
    if (!confirm('Remove this offer?')) return
    const { error: delErr } = await supabase.from('offers').delete().eq('id', offerId)
    if (delErr) {
      alert(delErr.message.includes('policy') || delErr.code === '42501'
        ? 'You don\u2019t have permission to delete offers directly.'
        : delErr.message)
      return
    }
    await loadAll()
  }

  async function submitRequest() {
    setSavingRequest(true)
    setRequestError(null)

    if (!requestForm.company.trim() || !requestForm.ctc) {
      setRequestError('Company and CTC are required.')
      setSavingRequest(false)
      return
    }

    const { error: reqErr } = await supabase.from('change_requests').insert({
      student_id: studentId,
      requested_by: profile.id,
      change_type: 'mark_placed',
      proposed_data: {
        company: requestForm.company.trim(),
        role: requestForm.role || null,
        ctc: requestForm.ctc,
        offer_type: requestForm.offerType,
        offer_date: requestForm.offerDate || null,
      },
    })

    if (reqErr) {
      setRequestError(reqErr.message.includes('policy') || reqErr.code === '42501'
        ? 'You don\u2019t have permission to submit a request for this student.'
        : reqErr.message)
      setSavingRequest(false)
      return
    }

    setSavingRequest(false)
    setRequesting(false)
    setRequestForm(emptyRequestForm)
    await loadAll()
  }

  function startDetailsRequest() {
    setDetailsRequestForm({
      placement_status: student.placement_status,
      cgpa: student.cgpa ?? '',
      tenth_percent: student.tenth_percent ?? '',
      twelfth_percent: student.twelfth_percent ?? '',
    })
    setDetailsRequestError(null)
    setRequestingDetails(true)
  }

  async function submitDetailsRequest() {
    setSavingDetailsRequest(true)
    setDetailsRequestError(null)

    const { error: reqErr } = await supabase.from('change_requests').insert({
      student_id: studentId,
      requested_by: profile.id,
      change_type: 'update_details',
      proposed_data: {
        placement_status: detailsRequestForm.placement_status,
        cgpa: detailsRequestForm.cgpa === '' ? null : detailsRequestForm.cgpa,
        tenth_percent: detailsRequestForm.tenth_percent === '' ? null : detailsRequestForm.tenth_percent,
        twelfth_percent: detailsRequestForm.twelfth_percent === '' ? null : detailsRequestForm.twelfth_percent,
      },
    })

    if (reqErr) {
      setDetailsRequestError(reqErr.message.includes('policy') || reqErr.code === '42501'
        ? 'You don\u2019t have permission to submit a request for this student.'
        : reqErr.message)
      setSavingDetailsRequest(false)
      return
    }

    setSavingDetailsRequest(false)
    setRequestingDetails(false)
    await loadAll()
  }

  function requestSummary(r) {
    const d = r.proposed_data || {}
    if (r.change_type === 'mark_placed') {
      return `Placement \u2014 ${d.company || ''}${d.role ? ` (${d.role})` : ''}, \u20b9${d.ctc} LPA`
    }
    if (r.change_type === 'update_details') {
      const parts = []
      if (d.placement_status) parts.push(`Status \u2192 ${STATUS_LABELS[d.placement_status] || d.placement_status}`)
      if (d.cgpa !== null && d.cgpa !== undefined) parts.push(`CGPA \u2192 ${d.cgpa}`)
      if (d.tenth_percent !== null && d.tenth_percent !== undefined) parts.push(`10th% \u2192 ${d.tenth_percent}`)
      if (d.twelfth_percent !== null && d.twelfth_percent !== undefined) parts.push(`12th% \u2192 ${d.twelfth_percent}`)
      return `Details \u2014 ${parts.join(', ') || 'no changes'}`
    }
    return r.change_type
  }

  if (loading) return <p className="state-msg">Loading profile&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>
  if (!student) return <p className="state-msg">Student not found.</p>

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]))

  return (
    <>
      <Link to={`/students/details/${className}`} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'inline-block', marginBottom: 14 }}>
        &larr; Back to {className}
      </Link>

      <div className="panel">
        <div className="panel__body profile-header">
          <div className="profile-header__avatar">{student.name.charAt(0)}</div>
          <div>
            <div className="profile-header__name">{student.name}</div>
            <div className="profile-header__meta">{student.register_number} &middot; {student.category}</div>
          </div>
          {!editing && !requestingDetails && (
            <>
              <span className={`badge badge--${student.placement_status}`} style={{ marginLeft: 'auto', fontSize: 13, padding: '5px 14px' }}>
                {STATUS_LABELS[student.placement_status]}
              </span>
              {isCoordinator
                ? <button className="link-btn" style={{ marginLeft: 14 }} onClick={startEdit}>Edit</button>
                : <button className="link-btn" style={{ marginLeft: 14 }} onClick={startDetailsRequest}>Request Edit</button>}
            </>
          )}
        </div>

        {!editing && !requestingDetails ? (
          <div className="profile-facts">
            <div className="profile-fact"><span>Register No.</span><b>{student.register_number}</b></div>
            <div className="profile-fact"><span>Class</span><b>{student.category}</b></div>
            <div className="profile-fact"><span>CGPA</span><b>{student.cgpa ?? '\u2014'}</b></div>
            <div className="profile-fact"><span>10th %</span><b>{student.tenth_percent ?? '\u2014'}</b></div>
            <div className="profile-fact"><span>12th %</span><b>{student.twelfth_percent ?? '\u2014'}</b></div>
            <div className="profile-fact"><span>Mentor</span><b>{mentor?.name || '\u2014'}</b></div>
            <div className="profile-fact"><span>Batch</span><b>{student.batch_year || '\u2014'}</b></div>
            <div className="profile-fact"><span>Backlogs</span><b>{student.backlogs ?? '\u2014'}</b></div>
            <div className="profile-fact"><span>Gender</span><b>{student.gender || '\u2014'}</b></div>
            <div className="profile-fact"><span>Date of Birth</span><b>{student.dob ? new Date(student.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'}</b></div>
            <div className="profile-fact"><span>Official Email</span><b style={{ fontSize: 13, wordBreak: 'break-all' }}>{student.official_email || '\u2014'}</b></div>
            <div className="profile-fact"><span>Personal Email</span><b style={{ fontSize: 13, wordBreak: 'break-all' }}>{student.personal_email || '\u2014'}</b></div>
            <div className="profile-fact"><span>Mobile No.</span><b>{student.mobile_no || '\u2014'}</b></div>
          </div>
        ) : editing ? (
          <div className="panel__body edit-form">
            {editError && <div className="form-error">{editError}</div>}
            <div className="edit-form__grid">
              <div>
                <label>Status</label>
                <select value={editForm.placement_status} onChange={(e) => setEditForm({ ...editForm, placement_status: e.target.value })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label>CGPA</label>
                <input type="number" step="0.01" min="0" max="10" value={editForm.cgpa} onChange={(e) => setEditForm({ ...editForm, cgpa: e.target.value })} />
              </div>
              <div>
                <label>10th %</label>
                <input type="number" step="0.01" min="0" max="100" value={editForm.tenth_percent} onChange={(e) => setEditForm({ ...editForm, tenth_percent: e.target.value })} />
              </div>
              <div>
                <label>12th %</label>
                <input type="number" step="0.01" min="0" max="100" value={editForm.twelfth_percent} onChange={(e) => setEditForm({ ...editForm, twelfth_percent: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="apply-filters-btn" style={{ marginTop: 0 }} onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving\u2026' : 'Save Changes'}
              </button>
              <button className="link-btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="panel__body edit-form">
            {detailsRequestError && <div className="form-error">{detailsRequestError}</div>}
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
              This won&rsquo;t change the record immediately &mdash; it goes to the placement coordinator for approval.
            </p>
            <div className="edit-form__grid">
              <div>
                <label>Status</label>
                <select value={detailsRequestForm.placement_status} onChange={(e) => setDetailsRequestForm({ ...detailsRequestForm, placement_status: e.target.value })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label>CGPA</label>
                <input type="number" step="0.01" min="0" max="10" value={detailsRequestForm.cgpa} onChange={(e) => setDetailsRequestForm({ ...detailsRequestForm, cgpa: e.target.value })} />
              </div>
              <div>
                <label>10th %</label>
                <input type="number" step="0.01" min="0" max="100" value={detailsRequestForm.tenth_percent} onChange={(e) => setDetailsRequestForm({ ...detailsRequestForm, tenth_percent: e.target.value })} />
              </div>
              <div>
                <label>12th %</label>
                <input type="number" step="0.01" min="0" max="100" value={detailsRequestForm.twelfth_percent} onChange={(e) => setDetailsRequestForm({ ...detailsRequestForm, twelfth_percent: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="apply-filters-btn" style={{ marginTop: 0 }} onClick={submitDetailsRequest} disabled={savingDetailsRequest}>
                {savingDetailsRequest ? 'Submitting\u2026' : 'Submit Request'}
              </button>
              <button className="link-btn" onClick={() => setRequestingDetails(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {!isCoordinator && myRequests.length > 0 && (
        <div className="panel">
          <div className="panel__header">
            <h3>Your Requests for This Student</h3>
            <span>{myRequests.length} submitted</span>
          </div>
          <div className="panel__body">
            {myRequests.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
                <span className={`badge badge--${REQUEST_STATUS_BADGE[r.status]}`}>{r.status}</span>
                <span>{requestSummary(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel__header">
          <h3>Offers</h3>
          <span>{offers.length} received</span>
        </div>
        <div className="table-scroll">
          {offers.length === 0 ? (
            <p className="state-msg">No offers recorded for this student yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>CTC (LPA)</th>
                  <th>Offer Type</th>
                  <th>Date</th>
                  <th>Accepted</th>
                  {isCoordinator && <th></th>}
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>{companyMap[o.company_id] || '\u2014'}</td>
                    <td>{o.role || '\u2014'}</td>
                    <td>{Number(o.ctc).toFixed(2)}</td>
                    <td>{o.offer_type ? formatOfferType(o) : '\u2014'}</td>
                    <td>{o.offer_date || '\u2014'}</td>
                    <td>{o.is_accepted ? 'Yes' : 'No'}</td>
                    {isCoordinator && <td><button className="link-btn" onClick={() => deleteOffer(o.id)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {isCoordinator ? (
          !addingOffer ? (
            <div className="panel__body">
              <button className="link-btn" onClick={() => setAddingOffer(true)}>+ Add Offer</button>
            </div>
          ) : (
            <div className="panel__body edit-form">
              {offerError && <div className="form-error">{offerError}</div>}
              <div className="edit-form__grid">
                <div>
                  <label>Company</label>
                  <select
                    value={offerForm.companyId}
                    onChange={(e) => setOfferForm({ ...offerForm, companyId: e.target.value, newCompany: '' })}
                  >
                    <option value="">&mdash; choose or type new below &mdash;</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Or new company</label>
                  <input
                    type="text" placeholder="Company name"
                    value={offerForm.newCompany}
                    onChange={(e) => setOfferForm({ ...offerForm, newCompany: e.target.value, companyId: '' })}
                  />
                </div>
                <div>
                  <label>Role</label>
                  <select value={offerForm.role} onChange={(e) => setOfferForm({ ...offerForm, role: e.target.value })}>
                    <option value="Direct Offer">Direct Offer</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label>CTC (LPA)</label>
                  <input type="number" step="0.01" value={offerForm.ctc} onChange={(e) => setOfferForm({ ...offerForm, ctc: e.target.value })} />
                </div>
                <div>
                  <label>Offer Type</label>
                  <select value={offerForm.offerType} onChange={(e) => setOfferForm({ ...offerForm, offerType: e.target.value })}>
                    {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label>Offer Date</label>
                  <input type="date" value={offerForm.offerDate} onChange={(e) => setOfferForm({ ...offerForm, offerDate: e.target.value })} />
                </div>
                <div>
                  <label>Accepted</label>
                  <select value={offerForm.isAccepted ? 'yes' : 'no'} onChange={(e) => setOfferForm({ ...offerForm, isAccepted: e.target.value === 'yes' })}>
                    <option value="yes">Yes &mdash; this is the offer they took</option>
                    <option value="no">No &mdash; just an offer received</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="apply-filters-btn" style={{ marginTop: 0 }} onClick={saveOffer} disabled={savingOffer}>
                  {savingOffer ? 'Saving\u2026' : 'Save Offer'}
                </button>
                <button className="link-btn" onClick={() => { setAddingOffer(false); setOfferForm(emptyOfferForm); setOfferError(null) }}>Cancel</button>
              </div>
            </div>
          )
        ) : (
          // ----- Mentor/FA view: request a change instead of editing directly -----
          <div className="panel__body">
            {!requesting ? (
              <button className="link-btn" onClick={() => setRequesting(true)}>+ Request Placement Update</button>
            ) : (
              <div className="edit-form">
                {requestError && <div className="form-error">{requestError}</div>}
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
                  This won&rsquo;t change the record immediately &mdash; it goes to the placement coordinator for approval.
                </p>
                <div className="edit-form__grid">
                  <div>
                    <label>Company</label>
                    <input type="text" value={requestForm.company} onChange={(e) => setRequestForm({ ...requestForm, company: e.target.value })} />
                  </div>
                  <div>
                    <label>Role</label>
                    <select value={requestForm.role} onChange={(e) => setRequestForm({ ...requestForm, role: e.target.value })}>
                      <option value="Direct Offer">Direct Offer</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label>CTC (LPA)</label>
                    <input type="number" step="0.01" value={requestForm.ctc} onChange={(e) => setRequestForm({ ...requestForm, ctc: e.target.value })} />
                  </div>
                  <div>
                    <label>Offer Type</label>
                    <select value={requestForm.offerType} onChange={(e) => setRequestForm({ ...requestForm, offerType: e.target.value })}>
                      {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Offer Date</label>
                    <input type="date" value={requestForm.offerDate} onChange={(e) => setRequestForm({ ...requestForm, offerDate: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button className="apply-filters-btn" style={{ marginTop: 0 }} onClick={submitRequest} disabled={savingRequest}>
                    {savingRequest ? 'Submitting\u2026' : 'Submit Request'}
                  </button>
                  <button className="link-btn" onClick={() => { setRequesting(false); setRequestForm(emptyRequestForm); setRequestError(null) }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}