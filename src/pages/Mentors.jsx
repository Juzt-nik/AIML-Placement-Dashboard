import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, ImageRun, AlignmentType, PageOrientation, convertInchesToTwip } from 'docx'
import { supabase } from '../lib/supabase'

const CLASSES = ['AIML-A', 'AIML-B', 'AIML-C', 'AIML-D']
const STATUS_LABELS = { placed: 'Placed', not_placed: 'Not Placed', removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies' }
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }
const CATEGORY_LABELS = { all: 'All', placement: 'Placement', higher_studies: 'Higher Studies', others: 'Entrepreneurship' }

function formatOfferType(offer) {
  if (!offer || !offer.offer_type) return null
  const label = OFFER_TYPE_LABELS[offer.offer_type]
  return offer.role === 'Internship' ? `Intern/${label}` : label
}

function matchesCategory(status, category) {
  if (category === 'all') return true
  if (category === 'placement') return status === 'placed' || status === 'not_placed'
  if (category === 'higher_studies') return status === 'higher_studies'
  if (category === 'others') return status === 'removed_from_placement'
  return true
}

// Loads the college logo from /public/cllglogo.png for use in PDF/DOCX exports.
async function loadLogo() {
  try {
    const res = await fetch('/cllglogo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const dims = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => resolve({ width: 300, height: 100 })
      img.src = dataUrl
    })
    return { dataUrl, arrayBuffer, ...dims }
  } catch {
    return null
  }
}

export default function Mentors() {
  const [mentors, setMentors] = useState([])
  const [students, setStudents] = useState([])
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMentor, setSelectedMentor] = useState('all')

  const [classFilter, setClassFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [mentorsRes, studentsRes, offersRes, companiesRes] = await Promise.all([
        supabase.from('mentors').select('*').order('id'),
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

  // filtered + enriched roster used by both the on-screen table and the exports
  const filteredMentees = useMemo(() => {
    if (!scoped) return []
    return scoped.mentees
      .filter((s) => classFilter === 'all' || s.category === classFilter)
      .filter((s) => matchesCategory(s.placement_status, categoryFilter))
      .filter((s) => statusFilter === 'all' || s.placement_status === statusFilter)
  }, [scoped, classFilter, categoryFilter, statusFilter])

  const filterSummary = [
    classFilter !== 'all' ? `Class: ${classFilter}` : 'Class: All Classes',
    `Category: ${CATEGORY_LABELS[categoryFilter]}`,
    `Status: ${statusFilter === 'all' ? 'All' : STATUS_LABELS[statusFilter]}`,
  ].join(' | ')

  const generatedDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' })

  function tableHeaders() {
    return ['#', 'Reg No', 'Name', 'Dept', 'Class', 'Category', 'Status', '10th%', '12th%', 'CGPA', 'Offer Type', 'Company', 'Mentor']
  }

  function tableBody() {
    return filteredMentees.map((s, i) => {
      const studentOffers = offersByStudent[s.id] || []
      const primaryOffer = studentOffers.find((o) => o.is_accepted)
      return [
        i + 1,
        s.register_number,
        s.name,
        'AIML',
        s.category || '\u2014',
        s.placement_status === 'higher_studies' ? 'Higher Studies' : s.placement_status === 'removed_from_placement' ? 'Entrepreneurship' : 'Placement',
        STATUS_LABELS[s.placement_status],
        s.tenth_percent ?? '\u2014',
        s.twelfth_percent ?? '\u2014',
        s.cgpa ?? '\u2014',
        primaryOffer ? formatOfferType(primaryOffer) : '\u2014',
        primaryOffer ? (companyMap[primaryOffer.company_id] || '\u2014') : '\u2014',
        mentor.name,
      ]
    })
  }

  async function downloadPdf() {
    const doc = new jsPDF({ orientation: 'landscape' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const centerX = pageWidth / 2
    let y = 30

    const logo = await loadLogo()
    if (logo) {
      const logoWidth = 60
      const logoHeight = (logo.height / logo.width) * logoWidth
      doc.addImage(logo.dataUrl, 'PNG', centerX - logoWidth / 2, y, logoWidth, logoHeight)
      y += logoHeight + 14
    } else {
      y += 10
    }

    doc.setFontSize(13)
    doc.text('SRM Institute of Science and Technology, Ramapuram', centerX, y, { align: 'center' })
    y += 7
    doc.setFontSize(11)
    doc.text('Department of AIML | Batch 2026-2027', centerX, y, { align: 'center' })
    y += 16

    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Placement Report', centerX, y, { align: 'center' })
    doc.setFont(undefined, 'normal')
    y += 18

    const marginLeft = 20
    doc.setFontSize(10.5)
    doc.text(filterSummary, marginLeft, y)
    y += 6
    doc.text(`Date: ${generatedDate}`, marginLeft, y)
    y += 6
    doc.text(`Mentor: ${mentor.name} | Total Students: ${filteredMentees.length}`, marginLeft, y)
    y += 14

    autoTable(doc, {
      startY: y,
      head: [tableHeaders()],
      body: tableBody(),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 22, 44] },
    })

    doc.save(`${mentor.name.replace(/\s+/g, '_')}_Placement_Report_${generatedDate.replace(/\//g, '-')}.pdf`)
  }

  async function downloadDocx() {
    const logo = await loadLogo()

    const headerCells = tableHeaders().map((h) =>
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16 })] })] })
    )
    const bodyRows = tableBody().map((row) =>
      new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 16 })] })] })),
      })
    )

    const coverChildren = []

    if (logo) {
      const logoWidth = 220
      const logoHeight = (logo.height / logo.width) * logoWidth
      coverChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: logo.arrayBuffer, transformation: { width: logoWidth, height: logoHeight } })],
        })
      )
    }

    coverChildren.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: 'SRM Institute of Science and Technology, Ramapuram', size: 26 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Department of AIML | Batch 2026-2027', size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 }, children: [new TextRun({ text: 'Placement Report', bold: true, size: 40 })] }),
      new Paragraph({ text: filterSummary }),
      new Paragraph({ text: `Date: ${generatedDate}` }),
      new Paragraph({ text: `Mentor: ${mentor.name} | Total Students: ${filteredMentees.length}`, spacing: { after: 300 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: headerCells }), ...bodyRows],
      }),
    )

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
              width: convertInchesToTwip(11.69),
              height: convertInchesToTwip(8.27),
            },
            margin: {
              top: convertInchesToTwip(0.4),
              bottom: convertInchesToTwip(0.4),
              left: convertInchesToTwip(0.4),
              right: convertInchesToTwip(0.4),
            },
          },
        },
        children: coverChildren,
      }],
    })

    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${mentor.name.replace(/\s+/g, '_')}_Placement_Report_${generatedDate.replace(/\//g, '-')}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

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

          <div className="filter-bar">
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">All Classes</option>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="filter-bar__count">{filteredMentees.length} students</span>
          </div>

          <div className="panel">
            <div className="panel__header" style={{ background: 'var(--navy-text)' }}>
              <h3 style={{ color: '#fff' }}>Student Records</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="export-btn export-btn--pdf" onClick={downloadPdf}>Download PDF</button>
                <button className="export-btn export-btn--docx" onClick={downloadDocx}>Download DOCX</button>
              </div>
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
                  {filteredMentees.map((s, i) => {
                    const studentOffers = offersByStudent[s.id] || []
                    const primaryOffer = studentOffers.find((o) => o.is_accepted)
                    return (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>{s.register_number}</td>
                        <td><Link to={`/students/details/${s.category}/${s.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>{s.name}</Link></td>
                        <td>{s.category}</td>
                        <td><span className={`badge badge--${s.placement_status}`}>{STATUS_LABELS[s.placement_status]}</span></td>
                        <td>{primaryOffer ? formatOfferType(primaryOffer) : '\u2014'}</td>
                        {[0, 1, 2].map((idx) => (
                          <td key={idx}>{studentOffers[idx] ? `${companyMap[studentOffers[idx].company_id] || '\u2014'} (\u20b9${Number(studentOffers[idx].ctc).toFixed(1)})` : '\u2014'}</td>
                        ))}
                      </tr>
                    )
                  })}
                  {filteredMentees.length === 0 && (
                    <tr><td colSpan={9} className="state-msg">No students match these filters.</td></tr>
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