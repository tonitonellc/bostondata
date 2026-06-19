// URL filter sync utilities.
// The app uses hash-based routing: #viewname?param1=val1&param2=val2

// Human-readable operator aliases so shared URLs are legible
const OP_ENCODE = { '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte', '=': 'eq', '!=': 'neq', 'LIKE': 'like' }
const OP_DECODE = Object.fromEntries(Object.entries(OP_ENCODE).map(([k, v]) => [v, k]))

export const encodeOp = op => OP_ENCODE[op] ?? op
export const decodeOp = code => OP_DECODE[code] ?? code

// Read query params from the current hash, e.g. #spending?q=foo&op=gt → { q: 'foo', op: 'gt' }
export function getHashParams() {
  const qi = window.location.hash.indexOf('?')
  if (qi === -1) return {}
  return Object.fromEntries(new URLSearchParams(window.location.hash.slice(qi + 1)))
}

// Write query params into the hash without changing the view segment.
// Entries with null / undefined / '' are omitted so the URL stays clean.
export function setHashParams(params) {
  const hash = window.location.hash
  const qi = hash.indexOf('?')
  const base = qi === -1 ? hash : hash.slice(0, qi)
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const qs = new URLSearchParams(clean).toString()
  history.replaceState(null, '', qs ? `${base}?${qs}` : base)
}
