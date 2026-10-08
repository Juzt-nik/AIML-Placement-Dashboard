// Only Intern/Normal offers (role 'Internship' AND offer_type 'normal') are paid as a
// monthly stipend (SPM). Everything else, including Intern/Dream, Intern/Super Dream and
// Intern/Marquee, is an annual CTC in LPA. Both live in offers.ctc, so anything that
// aggregates or labels that column must go through these helpers.
export const isStipend = (offer) => offer?.role === 'Internship' && offer?.offer_type === 'normal'

// ctc of 0 / null / blank means salary or stipend was not disclosed.
export const NOT_MENTIONED = 'Not Mentioned'
export const isDisclosed = (ctc) => ctc != null && ctc !== '' && Number(ctc) > 0

const inr = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// Full display string: "₹25,000/month" for internships, "₹12.00 LPA" otherwise.
// Pass symbol: 'Rs. ' for jsPDF/DOCX output, where the default fonts lack the ₹ glyph.
export function formatComp(offer, { decimals = 2, symbol = '\u20b9' } = {}) {
  if (!offer) return null
  if (!isDisclosed(offer.ctc)) return NOT_MENTIONED
  return isStipend(offer)
    ? `${symbol}${inr(offer.ctc)}/month`
    : `${symbol}${Number(offer.ctc).toFixed(decimals)} LPA`
}

// Compact variant for dense cells: "₹25,000 SPM" or "₹12.0".
export function formatCompShort(offer, lpaDecimals = 1) {
  if (!offer) return null
  if (!isDisclosed(offer.ctc)) return NOT_MENTIONED
  return isStipend(offer)
    ? `\u20b9${inr(offer.ctc)} SPM`
    : `\u20b9${Number(offer.ctc).toFixed(lpaDecimals)}`
}

// Same as formatComp but from a raw role/ctc pair (change-request payloads).
export const formatCompFromData = (d, opts) => formatComp({ role: d?.role, offer_type: d?.offer_type, ctc: d?.ctc }, opts)

export const compLabel = (role, offerType) =>
  (isStipend({ role, offer_type: offerType }) ? 'Stipend (\u20b9/month)' : 'CTC (LPA)')
