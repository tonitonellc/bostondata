// Escape single quotes for SQL by doubling them
function escapeSqlString(str) {
  return String(str).replace(/'/g, "''")
}

export function buildWhereClause(clauses) {
  const validClauses = clauses.filter((c) => c && c.trim())
  if (validClauses.length === 0) return ""
  return "WHERE " + validClauses.join(" AND ")
}

// Strip currency symbols, commas, and whitespace from a user-supplied numeric value.
// e.g. "$1,200.50" → "1200.50",  "$ 500" → "500",  "1,000" → "1000"
// Returns null if the result isn't a valid number (guards against bad SQL too).
export function sanitizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null
  const cleaned = String(value).replace(/[$,\s]/g, '').trim()
  if (cleaned === '' || isNaN(Number(cleaned))) return null
  return cleaned
}

// Helper to build comparison clauses for numeric fields
// Options:
//   isNativeNumeric    — field is already a DB numeric type, no cast needed
//   needsCommaCleaning — field is text with commas only (e.g. "1,200.50")
//   needsCurrencyCleaning — field is text with $ and commas (e.g. "$1,200.50")
//                           uses REGEXP_REPLACE to strip both in one DB-side pass
export function buildNumericClause(fieldName, operator, value, options = {}) {
  if (!value) return null

  // sanitizeNumericValue strips $, commas, and spaces from the user input
  // and returns null if the result isn't a valid number — prevents NaN in SQL
  const cleanValue = sanitizeNumericValue(value)
  if (cleanValue === null) return null

  const { isNativeNumeric = false, needsCommaCleaning = false, needsCurrencyCleaning = false } = options

  // 1. Field is already a native DB numeric — no cast needed
  if (isNativeNumeric) {
    return `"${fieldName}" ${operator} ${cleanValue}`
  }

  // 2. Text field stored with $ and commas (e.g. "$36,500.00")
  //    REGEXP_REPLACE strips both in one pass before casting
  if (needsCurrencyCleaning) {
    return `REGEXP_REPLACE("${fieldName}", '[$,]', '', 'g')::numeric ${operator} ${cleanValue}`
  }

  // 3. Text field stored with commas only (e.g. "1,200.50")
  if (needsCommaCleaning) {
    return `REPLACE("${fieldName}", ',', '')::numeric ${operator} ${cleanValue}`
  }

  // 4. Default: plain text numeric (e.g. "1200.50") — just cast it
  return `"${fieldName}"::numeric ${operator} ${cleanValue}`
}

// Helper to build UPPER() text comparisons for case-insensitive filtering
export function buildTextClause(fieldName, operator, value) {
  if (!value) return null
  const escapedValue = escapeSqlString(value)
  if (operator === "LIKE") {
    return `UPPER("${fieldName}") LIKE UPPER('%${escapedValue}%')`
  } else if (operator === "=") {
    return `UPPER("${fieldName}") = UPPER('${escapedValue}')`
  }
  return `"${fieldName}" ${operator} '${escapedValue}'`
}

// Helper for date range clauses
export function buildDateClause(fieldName, fromDate, toDate) {
  const clauses = []
  if (fromDate) clauses.push(`"${fieldName}"::date >= '${escapeSqlString(fromDate)}'`)
  if (toDate) clauses.push(`"${fieldName}"::date <= '${escapeSqlString(toDate)}'`)
  return clauses
}

// Helper to build a multi-field text search clause (OR LIKE across all fields)
export function buildSearchClause(fields, query) {
  if (!query || !fields || fields.length === 0) return null
  const escapedQuery = escapeSqlString(query)
  const conditions = fields.map(f => `UPPER("${f}") LIKE UPPER('%${escapedQuery}%')`)
  return conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`
}
