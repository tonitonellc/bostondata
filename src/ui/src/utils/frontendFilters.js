// Used for resources from Boston CKAN APIs that lack SQL query support

export function filterRecordsByDateRange(records, dateField, fromDate, toDate) {
  if (!fromDate && !toDate) return records

  return records.filter((record) => {
    const recordDate = new Date(record[dateField])

    if (isNaN(recordDate.getTime())) {
      return true // Skip records with invalid dates
    }

    if (fromDate) {
      const from = new Date(fromDate)
      if (recordDate < from) return false
    }

    if (toDate) {
      const to = new Date(toDate)
      // Include entire day by adding 1 day
      to.setDate(to.getDate() + 1)
      if (recordDate >= to) return false
    }

    return true
  })
}

export function filterRecordsByField(records, fieldName, operator, value) {
  if (!value) return records

  return records.filter((record) => {
    const fieldValue = String(record[fieldName] || "").toLowerCase()
    const searchValue = String(value).toLowerCase()

    switch (operator) {
      case "LIKE":
      case "contains":
        return fieldValue.includes(searchValue)
      case "=":
        return fieldValue === searchValue
      case "!=":
        return fieldValue !== searchValue
      case ">":
        return Number.parseFloat(fieldValue) > Number.parseFloat(searchValue)
      case "<":
        return Number.parseFloat(fieldValue) < Number.parseFloat(searchValue)
      case ">=":
        return Number.parseFloat(fieldValue) >= Number.parseFloat(searchValue)
      case "<=":
        return Number.parseFloat(fieldValue) <= Number.parseFloat(searchValue)
      default:
        return true
    }
  })
}

export function applyAllFilters(records, filters) {
  let filtered = records

  // Apply date range filtering
  if (filters.dateField && (filters.fromDate || filters.toDate)) {
    filtered = filterRecordsByDateRange(filtered, filters.dateField, filters.fromDate, filters.toDate)
  }

  // Apply field filtering
  if (filters.fieldName && filters.operator && filters.value) {
    filtered = filterRecordsByField(filtered, filters.fieldName, filters.operator, filters.value)
  }

  return filtered
}
