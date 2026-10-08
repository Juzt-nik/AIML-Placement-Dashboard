import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, ImageRun, AlignmentType, PageOrientation, TabStopType, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide, convertInchesToTwip } from 'docx'
import { supabase } from '../lib/supabase'
import { isStipend, isDisclosed, formatCompShort } from '../lib/compensation'

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
      const ctcs = acceptedOffers.filter((o) => menteeIds.has(o.student_id) && !isStipend(o) && isDisclosed(o.ctc)).map((o) => Number(o.ctc))
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
    const pageHeight = doc.internal.pageSize.getHeight()
    const centerX = pageWidth / 2
    const marginLeft = 20
    const marginRight = pageWidth - 20
    let y = 14

    const logo = await loadLogo()
    let textStartX = marginLeft
    let headerBottom = y + 15
    if (logo) {
      const logoWidth = 42
      const logoHeight = (logo.height / logo.width) * logoWidth
      doc.addImage(logo.dataUrl, 'PNG', marginLeft, y, logoWidth, logoHeight)
      textStartX = marginLeft + logoWidth + 8
      headerBottom = Math.max(headerBottom, y + logoHeight)
    }

    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text('SRM Institute of Science and Technology, Ramapuram', textStartX, y + 5)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(11)
    doc.text('Department of Artificial Intelligence and Machine Learning', textStartX, y + 10)
    doc.text('Batch 2026-2027', textStartX, y + 15)
    y = headerBottom + 8

    doc.setFontSize(20)
    doc.setFont(undefined, 'bold')
    doc.text('Placement Status Report', centerX, y, { align: 'center' })
    doc.setFont(undefined, 'normal')
    y += 12

    doc.setFontSize(10.5)
    doc.text(filterSummary, marginLeft, y)
    y += 5
    doc.text(`Date: ${generatedDate}`, marginLeft, y)
    y += 5
    doc.text(`Mentor: ${mentor.name} | Total Students: ${filteredMentees.length}`, marginLeft, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [tableHeaders()],
      body: tableBody(),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [16, 22, 44] },
      margin: { left: marginLeft, right: 20, bottom: 22 },
    })

    // signature block — matches the reference template's sign-off, kept on the same
    // page as the table whenever the table itself fits on one page
    let sigY = doc.lastAutoTable.finalY + 28
    if (sigY > pageHeight - 15) {
      doc.addPage()
      sigY = 20
    }
    doc.setFontSize(10.5)
    doc.text('Placement Coordinator', marginLeft, sigY)
    doc.text('Head Of The Department', marginRight, sigY, { align: 'right' })
    sigY += 6
    doc.text('Dept. of Artificial Intelligence and Machine Learning', marginLeft, sigY)
    doc.text('Dept. of Artificial Intelligence and Machine Learning', marginRight, sigY, { align: 'right' })

    doc.save(`${mentor.name.replace(/\s+/g, '_')}_Placement_Report_${generatedDate.replace(/\//g, '-')}.pdf`)
  }

  async function downloadDocx() {
    const logo = await loadLogo()
    const FONT = 'Times New Roman'

    const headerCells = tableHeaders().map((h) =>
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16, font: FONT })] })] })
    )
    const bodyRows = tableBody().map((row) =>
      new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 16, font: FONT })] })] })),
      })
    )

    // right-hand tab stop for the signature block, spanning the usable page width
    const usableWidthTwips = convertInchesToTwip(11.69 - 0.8)

    // first-line runs: the floating logo (docked top-left of this paragraph) followed
    // by hand-spaced text, exactly reproducing the reference template's layout
    const firstLineChildren = []
    if (logo) {
      const logoWidth = 220
      const logoHeight = (logo.height / logo.width) * logoWidth
      firstLineChildren.push(
        new ImageRun({
          data: logo.arrayBuffer,
          transformation: { width: logoWidth, height: logoHeight },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.LEFT },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
            wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
            allowOverlap: true,
          },
        })
      )
    }
    firstLineChildren.push(
      new TextRun({ text: '       ', size: 28, font: FONT }),
      new TextRun({ text: 'SRM Institute of Science and Technology, Ramapuram', bold: true, size: 28, font: FONT }),
    )

    const coverChildren = [
      new Paragraph({ spacing: { before: 200 }, children: firstLineChildren }),
      new Paragraph({ children: [new TextRun({ text: '    Department of Artificial Intelligence and Machine Learning', size: 28, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: '                          Batch 2026-2027', size: 28, font: FONT })] }),
      new Paragraph({ text: '' }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 }, children: [new TextRun({ text: 'Placement Status Report', bold: true, size: 40, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: filterSummary, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: `Date: ${generatedDate}`, font: FONT })] }),
      new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `Mentor: ${mentor.name} | Total Students: ${filteredMentees.length}`, font: FONT })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: headerCells }), ...bodyRows],
      }),
      // 30 blank spacer paragraphs push the sign-off toward the bottom of the page,
      // matching the reference template exactly
      ...Array.from({ length: 30 }, () => new Paragraph({ text: '' })),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: usableWidthTwips }],
        children: [new TextRun({ text: 'Placement Coordinator', font: FONT }), new TextRun('\t'), new TextRun({ text: 'Head Of The Department', font: FONT })],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: usableWidthTwips }],
        children: [
          new TextRun({ text: 'Dept. of Artificial Intelligence and Machine Learning', font: FONT }),
          new TextRun('\t'),
          new TextRun({ text: 'Dept. of Artificial Intelligence and Machine Learning', font: FONT }),
        ],
      }),
      ...Array.from({ length: 5 }, () => new Paragraph({ text: '' })),
    ]

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
                    <div className="mentor-card__stat"><b>{m.avgCtc}</b><span>Avg CTC (LPA)</span></div>
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
                          <td key={idx}>{studentOffers[idx] ? `${companyMap[studentOffers[idx].company_id] || '\u2014'} (${formatCompShort(studentOffers[idx])})` : '\u2014'}</td>
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