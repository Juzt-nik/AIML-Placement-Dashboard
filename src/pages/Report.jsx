import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, ImageRun, AlignmentType, PageOrientation, TabStopType, HorizontalPositionAlign, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide, convertInchesToTwip } from 'docx'
import { supabase } from '../lib/supabase'
import { isStipend, isDisclosed, formatComp } from '../lib/compensation'

const CLASSES = ['AIML-A', 'AIML-B', 'AIML-C', 'AIML-D']
const STATUS_LABELS = { placed: 'Placed', not_placed: 'Not Placed', removed_from_placement: 'Entrepreneurship', higher_studies: 'Higher Studies' }
const OFFER_TYPE_LABELS = { normal: 'Normal', dream: 'Dream', super_dream: 'Super Dream', marquee: 'Marquee' }
const NUMERIC_FIELDS = { tenth_percent: '10th %', twelfth_percent: '12th %', cgpa: 'CGPA' }
const OPERATORS = { gte: '\u2265', lte: '\u2264', eq: '=' }
const SORT_FIELDS = { name: 'Name', register_number: 'Register No', category: 'Class', tenth_percent: '10th %', twelfth_percent: '12th %', cgpa: 'CGPA' }
const CATEGORY_LABELS = { all: 'All', placement: 'Placement', higher_studies: 'Higher Studies', others: 'Entrepreneurship' }
const PLACEMENT_TYPE_LABELS = { marquee: 'Marquee', super_dream: 'Super Dream', dream: 'Dream', intern_normal: 'Internship (Normal)', not_mentioned: 'Not Mentioned' }

// Matches a student's accepted offer against the Placement Type filter.
// marquee / super_dream / dream match on offer type (internship or direct);
// intern_normal is the stipend (SPM) case only; not_mentioned = offer with no disclosed salary/stipend.
function matchesPlacementType(offer, type) {
  if (type === 'all') return true
  if (!offer) return false
  if (type === 'intern_normal') return isStipend(offer)
  if (type === 'not_mentioned') return !isDisclosed(offer.ctc)
  return offer.offer_type === type
}

function matchesCategory(status, category) {
  if (category === 'all') return true
  if (category === 'placement') return status === 'placed' || status === 'not_placed'
  if (category === 'higher_studies') return status === 'higher_studies'
  if (category === 'others') return status === 'removed_from_placement'
  return true
}

function formatOfferType(offer) {
  if (!offer || !offer.offer_type) return null
  const label = OFFER_TYPE_LABELS[offer.offer_type]
  return offer.role === 'Internship' ? `Intern/${label}` : label
}

// Loads the college logo from /public/cllglogo.png (if present) as both a
// data URL (for jsPDF) and raw bytes (for the docx ImageRun). Resolves to
// null if the file isn't there yet, so exports still work without it.
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
    // get natural dimensions to keep the aspect ratio correct
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

export default function Report() {
  const [students, setStudents] = useState([])
  const [offers, setOffers] = useState([])
  const [companies, setCompanies] = useState([])
  const [mentors, setMentors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // draft filter state (what the user is currently adjusting)
  const [classFilter, setClassFilter] = useState('all')
  const [reportCategory, setReportCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [placementTypeFilter, setPlacementTypeFilter] = useState('all')
  const [numericFilters, setNumericFilters] = useState([])
  const [sortField, setSortField] = useState('cgpa')
  const [sortDir, setSortDir] = useState('asc')

  // applied snapshot — only updates when "Apply Filters" is clicked
  const [applied, setApplied] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [studentsRes, offersRes, companiesRes, mentorsRes] = await Promise.all([
        supabase.from('students').select('*'),
        supabase.from('offers').select('*').eq('is_accepted', true),
        supabase.from('companies').select('*'),
        supabase.from('mentors').select('*').order('id'),
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
  const offerByStudent = useMemo(() => Object.fromEntries(offers.map((o) => [o.student_id, o])), [offers])

  // ----- Class-wise summary (always visible, independent of the filter form) -----
  const summaryRows = useMemo(() => {
    return CLASSES.map((cat) => {
      const classStudents = students.filter((s) => s.category === cat)
      const placed = classStudents.filter((s) => s.placement_status === 'placed')
      const higherStudies = classStudents.filter((s) => s.placement_status === 'higher_studies')
      const others = classStudents.filter((s) => s.placement_status === 'removed_from_placement')
      const eligible = classStudents.length - higherStudies.length - others.length
      const menteeIds = new Set(placed.map((s) => s.id))
      const ctcs = offers.filter((o) => menteeIds.has(o.student_id) && !isStipend(o) && isDisclosed(o.ctc)).map((o) => Number(o.ctc))
      const avgCtc = ctcs.length ? (ctcs.reduce((a, b) => a + b, 0) / ctcs.length).toFixed(2) : '\u2014'
      const pct = eligible ? ((placed.length / eligible) * 100).toFixed(1) : '0.0'
      return { cat, total: classStudents.length, placed: placed.length, higherStudies: higherStudies.length, others: others.length, pct, avgCtc }
    })
  }, [students, offers])

  const deptTotals = useMemo(() => {
    const total = students.length
    const placed = students.filter((s) => s.placement_status === 'placed').length
    const higherStudies = students.filter((s) => s.placement_status === 'higher_studies').length
    const others = students.filter((s) => s.placement_status === 'removed_from_placement').length
    const eligible = total - higherStudies - others
    const pct = eligible ? ((placed / eligible) * 100).toFixed(1) : '0.0'
    return { total, placed, higherStudies, others, pct }
  }, [students])

  // ----- Filter form helpers -----
  function addNumericFilter() {
    setNumericFilters((prev) => [...prev, { id: Date.now(), field: 'cgpa', op: 'gte', value: '' }])
  }
  function updateNumericFilter(id, patch) {
    setNumericFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function removeNumericFilter(id) {
    setNumericFilters((prev) => prev.filter((f) => f.id !== id))
  }

  function applyFilters() {
    setApplied({ classFilter, reportCategory, statusFilter, placementTypeFilter, numericFilters, sortField, sortDir })
  }

  // ----- Filtered/sorted report rows, computed only from the applied snapshot -----
  const rows = useMemo(() => {
    if (!applied) return []
    let list = students.filter((s) => {
      if (applied.classFilter !== 'all' && s.category !== applied.classFilter) return false
      if (!matchesCategory(s.placement_status, applied.reportCategory)) return false
      if (applied.statusFilter !== 'all' && s.placement_status !== applied.statusFilter) return false
      if (!matchesPlacementType(offerByStudent[s.id], applied.placementTypeFilter)) return false
      for (const f of applied.numericFilters) {
        if (f.value === '' || f.value === null) continue
        const studentVal = Number(s[f.field])
        const filterVal = Number(f.value)
        if (Number.isNaN(studentVal)) return false
        if (f.op === 'gte' && !(studentVal >= filterVal)) return false
        if (f.op === 'lte' && !(studentVal <= filterVal)) return false
        if (f.op === 'eq' && !(studentVal === filterVal)) return false
      }
      return true
    })

    list = [...list].sort((a, b) => {
      let av = a[applied.sortField], bv = b[applied.sortField]
      if (typeof av === 'string') { av = av?.toLowerCase() || ''; bv = bv?.toLowerCase() || '' }
      else { av = Number(av) || 0; bv = Number(bv) || 0 }
      if (av < bv) return applied.sortDir === 'asc' ? -1 : 1
      if (av > bv) return applied.sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list.map((s) => {
      const offer = offerByStudent[s.id]
      return {
        ...s,
        companyName: offer ? companyMap[offer.company_id] : null,
        offerType: offer ? formatOfferType(offer) : null,
        ctc: offer ? formatComp(offer, { symbol: 'Rs. ' }) : null,
        mentorName: mentorMap[s.mentor_id] || null,
      }
    })
  }, [applied, students, offerByStudent, companyMap, mentorMap])

  const filterSummary = applied ? [
    'Dept: AIML',
    `Category: ${CATEGORY_LABELS[applied.reportCategory]}`,
    `Status: ${applied.statusFilter === 'all' ? 'All' : STATUS_LABELS[applied.statusFilter]}`,
    applied.classFilter !== 'all' ? `Class: ${applied.classFilter}` : null,
    applied.placementTypeFilter !== 'all' ? `Placement Type: ${PLACEMENT_TYPE_LABELS[applied.placementTypeFilter]}` : null,
  ].filter(Boolean).join(' | ') : ''

  // matches the reference template's cover-page order: Class | Category | Status
  const coverLine = applied ? [
    `Class: ${applied.classFilter === 'all' ? 'All Classes' : applied.classFilter}`,
    `Category: ${CATEGORY_LABELS[applied.reportCategory]}`,
    `Status: ${applied.statusFilter === 'all' ? 'All' : STATUS_LABELS[applied.statusFilter]}`,
    applied.placementTypeFilter !== 'all' ? `Placement Type: ${PLACEMENT_TYPE_LABELS[applied.placementTypeFilter]}` : null,
  ].filter(Boolean).join(' | ') : ''

  // second cover-page line: Mentor (only shown when every filtered row shares one mentor) | Total Students
  const uniqueMentors = [...new Set(rows.map((r) => r.mentorName).filter(Boolean))]
  const mentorLine = uniqueMentors.length === 1
    ? `Mentor: ${uniqueMentors[0]} | Total Students: ${rows.length}`
    : `Total Students: ${rows.length}`

  const generatedDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' })

  function tableHeaders() {
    return ['#', 'Reg No', 'Name', 'Dept', 'Class', 'Category', 'Status', '10th%', '12th%', 'CGPA', 'CTC / Stipend', 'Offer Type', 'Company', 'Mentor']
  }

  function tableBody() {
    return rows.map((r, i) => [
      i + 1,
      r.register_number,
      r.name,
      'AIML',
      r.category || '\u2014',
      r.placement_status === 'higher_studies' ? 'Higher Studies' : r.placement_status === 'removed_from_placement' ? 'Entrepreneurship' : 'Placement',
      STATUS_LABELS[r.placement_status],
      r.tenth_percent ?? '\u2014',
      r.twelfth_percent ?? '\u2014',
      r.cgpa ?? '\u2014',
      r.ctc ?? '\u2014',
      r.offerType || '\u2014',
      r.companyName || '\u2014',
      r.mentorName || '\u2014',
    ])
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
    doc.text(coverLine, marginLeft, y)
    y += 5
    doc.text(`Date: ${generatedDate}`, marginLeft, y)
    y += 5
    doc.text(mentorLine, marginLeft, y)
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

    doc.save(`AIML_Placement_Report_${generatedDate.replace(/\//g, '-')}.pdf`)
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
      new Paragraph({ children: [new TextRun({ text: coverLine, font: FONT })] }),
      new Paragraph({ children: [new TextRun({ text: `Date: ${generatedDate}`, font: FONT })] }),
      new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: mentorLine, font: FONT })] }),
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
              width: convertInchesToTwip(11.69),  // A4 landscape — standard size, matches the PDF export
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
    a.download = `AIML_Placement_Report_${generatedDate.replace(/\//g, '-')}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="state-msg">Loading report&hellip;</p>
  if (error) return <p className="state-msg">Couldn&rsquo;t load data: {error}</p>

  return (
    <>
      {/* Class-wise summary — always visible */}
      <div className="panel">
        <div className="panel__header">
          <h3>Class-wise Placement Summary</h3>
          <span>Department totals across all classes</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Total</th>
                <th>Placed</th>
                <th>Higher Studies</th>
                <th>Entrepreneurship</th>
                <th>Placement %</th>
                <th>Avg. CTC (LPA)</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r) => (
                <tr key={r.cat}>
                  <td>{r.cat}</td>
                  <td>{r.total}</td>
                  <td>{r.placed}</td>
                  <td>{r.higherStudies}</td>
                  <td>{r.others}</td>
                  <td>{r.pct}%</td>
                  <td>{r.avgCtc}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: '#f9fafc' }}>
                <td>Department Total</td>
                <td>{deptTotals.total}</td>
                <td>{deptTotals.placed}</td>
                <td>{deptTotals.higherStudies}</td>
                <td>{deptTotals.others}</td>
                <td>{deptTotals.pct}%</td>
                <td>&mdash;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed filterable report */}
      <div className="panel">
        <div className="panel__header" style={{ background: 'var(--blue)' }}>
          <h3 style={{ color: '#fff' }}>Report Filters</h3>
        </div>
        <div className="panel__body">
          <div className="report-filter-grid">
            <div>
              <label>Class</label>
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="all">All Classes</option>
                {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Category</label>
              <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label>Placed Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label>Placement Type</label>
              <select value={placementTypeFilter} onChange={(e) => setPlacementTypeFilter(e.target.value)}>
                <option value="all">All</option>
                {Object.entries(PLACEMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>Numeric Filters</label>
            {numericFilters.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic', margin: '0 0 8px' }}>
                No numeric filters &mdash; click &ldquo;+ Add Filter&rdquo; to add one.
              </p>
            )}
            {numericFilters.map((f) => (
              <div key={f.id} className="numeric-filter-row">
                <select value={f.field} onChange={(e) => updateNumericFilter(f.id, { field: e.target.value })}>
                  {Object.entries(NUMERIC_FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={f.op} onChange={(e) => updateNumericFilter(f.id, { op: e.target.value })}>
                  {Object.entries(OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input
                  type="number" step="0.01" placeholder="value"
                  value={f.value}
                  onChange={(e) => updateNumericFilter(f.id, { value: e.target.value })}
                />
                <button className="link-btn" onClick={() => removeNumericFilter(f.id)}>Remove</button>
              </div>
            ))}
            <button className="link-btn" onClick={addNumericFilter}>+ Add Filter</button>
          </div>

          <div className="report-sort-row">
            <div>
              <label>Sort</label>
              <select value={sortField} onChange={(e) => setSortField(e.target.value)}>
                {Object.entries(SORT_FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="sort-dir-toggle">
              <button className={sortDir === 'asc' ? 'active' : ''} onClick={() => setSortDir('asc')}>Ascending</button>
              <button className={sortDir === 'desc' ? 'active' : ''} onClick={() => setSortDir('desc')}>Descending</button>
            </div>
          </div>

          <button className="apply-filters-btn" onClick={applyFilters}>Apply Filters</button>
        </div>
      </div>

      {/* Results — only shown after Apply Filters is clicked */}
      {applied && (
        <div className="panel">
          <div className="panel__header" style={{ background: 'var(--navy-text)' }}>
            <h3 style={{ color: '#fff' }}>
              {rows.length} students &middot; <span style={{ fontWeight: 400, fontSize: 12.5, color: 'rgba(255,255,255,0.82)' }}>{filterSummary}</span>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="export-btn export-btn--pdf" onClick={downloadPdf}>Download PDF</button>
              <button className="export-btn export-btn--docx" onClick={downloadDocx}>Download DOCX</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>{tableHeaders().map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{r.register_number}</td>
                    <td><Link to={`/students/details/${r.category}/${r.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.name}</Link></td>
                    <td>AIML</td>
                    <td>{r.category || '\u2014'}</td>
                    <td>{r.placement_status === 'higher_studies' ? 'Higher Studies' : r.placement_status === 'removed_from_placement' ? 'Entrepreneurship' : 'Placement'}</td>
                    <td><span className={`badge badge--${r.placement_status}`}>{STATUS_LABELS[r.placement_status]}</span></td>
                    <td>{r.tenth_percent ?? '\u2014'}</td>
                    <td>{r.twelfth_percent ?? '\u2014'}</td>
                    <td>{r.cgpa ?? '\u2014'}</td>
                    <td>{r.ctc ?? '\u2014'}</td>
                    <td>{r.offerType || '\u2014'}</td>
                    <td>{r.companyName || '\u2014'}</td>
                    <td>{r.mentorName || '\u2014'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={14} className="state-msg">No students match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}