import { nextTick, ref, watch } from "vue"
import { debounce } from '../utils/debounce'
import { getHashParams, setHashParams } from '../utils/urlFilters'

// useMapDisplay - Leaflet map initialization and location display
export function useMapDisplay(mapId) {
  let mapInstance = null
  const isMapReady = ref(false)

  const initializeMap = () => {
    // Dynamically import Leaflet
    if (typeof window !== "undefined" && !window.L) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      document.head.appendChild(link)

      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
      script.onload = () => {
        createMap()
      }
      document.head.appendChild(script)
    } else if (window.L && !mapInstance) {
      createMap()
    }
  }

  const createMap = () => {
    // Wait for DOM to be ready
    setTimeout(() => {
      const container = document.getElementById(mapId)
      if (!container || mapInstance) return

      mapInstance = window.L.map(mapId).setView([42.3601, -71.0589], 12)
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(mapInstance)
      isMapReady.value = true
    }, 100)
  }

  const displayLocation = (lat, lon, label = "") => {
    if (!mapInstance || !window.L) {
      console.warn("[v0] Map not ready, attempting to reinitialize")
      initializeMap()
      setTimeout(() => displayLocation(lat, lon, label), 500)
      return
    }

    clearMarkers()
    mapInstance.setView([lat, lon], 14)
    window.L.marker([lat, lon]).bindPopup(label).addTo(mapInstance).openPopup()
  }

  const clearMarkers = () => {
    if (mapInstance) {
      mapInstance.eachLayer((layer) => {
        if (layer instanceof window.L.Marker || layer instanceof window.L.Popup) {
          mapInstance.removeLayer(layer)
        }
      })
    }
  }

  // onMounted(() => {
  //   initializeMap()
  // })

  return { initializeMap, displayLocation, clearMarkers, isMapReady }
}

// useSortable - Column sorting state and logic
export function useSortable() {
  const sortField = ref(null)
  const sortDirection = ref("asc")

  const sortBy = (field) => {
    if (sortField.value === field) {
      sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc"
    } else {
      sortField.value = field
      sortDirection.value = "asc"
    }
  }

  const getSortIndicator = (field) => {
  if (sortField.value !== field) return ''
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

  const sortRecords = (records, field) => {
    if (!field) return records
    const sorted = [...records].sort((a, b) => {
      let valA = a[field]
      let valB = b[field]

      // Handle numeric values
      if (typeof valA === "string" && !isNaN(valA)) valA = Number.parseFloat(valA)
      if (typeof valB === "string" && !isNaN(valB)) valB = Number.parseFloat(valB)

      if (valA < valB) return sortDirection.value === "asc" ? -1 : 1
      if (valA > valB) return sortDirection.value === "asc" ? 1 : -1
      return 0
    })
    return sorted
  }

  return { sortField, sortDirection, sortBy, getSortIndicator, sortRecords }
}

// useDataFilters - Case-insensitive filters and date range handling
export function useDataFilters() {
  const filters = ref({
    fromDate: null,
    toDate: null,
    searchQuery: "",
    selectedField: null,
    selectedOperator: "=",
    filterValue: "",
  })

  const buildCaseInsensitiveSQL = (fieldValue, operator, value) => {
    if (operator === "LIKE") {
      return `UPPER("${fieldValue}") LIKE UPPER('%${value}%')`
    } else if (operator === "=") {
      return `UPPER("${fieldValue}") = UPPER('${value}')`
    } else {
      // For numeric comparisons (>, <, !=, etc.)
      return `"${fieldValue}" ${operator} '${value}'`
    }
  }

  const buildDateRangeSQL = (dateField, fromDate, toDate) => {
    let sql = ""
    if (fromDate) {
      sql += `"${dateField}" >= '${fromDate}'`
    }
    if (toDate) {
      if (sql) sql += " AND "
      sql += `"${dateField}" <= '${toDate}'`
    }
    return sql
  }

  return {
    filters,
    buildCaseInsensitiveSQL,
    buildDateRangeSQL,
  }
}

// useHelpModal - Help button and dataset link modal
export function useHelpModal() {
  const showModal = ref(false)
  const modalContent = ref({
    title: "",
    url: "",
    description: "",
  })

  const openHelpModal = (title, url, description) => {
    modalContent.value = {
      title,
      url,
      description,
    }
    showModal.value = true
  }

  const closeModal = () => {
    showModal.value = false
  }

  return { showModal, modalContent, openHelpModal, closeModal }
}

// useStatistics - Statistics calculation and display
export function useStatistics() {
  const calculateStats = (records, fieldMappings) => {
    const stats = {}

    for (const [label, field] of Object.entries(fieldMappings)) {
      const values = records
        .map((r) => {
          let val = r[field]
          // Strip currency symbols and commas if present
          if (typeof val === "string") {
            val = val.replace(/[$,]/g, "")
            val = Number.parseFloat(val)
          }
          return isNaN(val) ? 0 : val
        })
        .filter((v) => v !== 0)

      stats[label] = {
        total: values.reduce((a, b) => a + b, 0),
        average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        count: values.length,
      }
    }

    return stats
  }

  return { calculateStats }
}

// useCollapsibleSections - Manage collapsible UI sections
// Accepts an optional invalidateSize callback (from useMapDisplay) so the map
// tiles fill the container whenever the map section is toggled open — without
// requiring each component to add its own watch.
export function useCollapsibleSections(onMapShow = null) {
  const showCharts = ref(true)
  const showMap = ref(true)
  const showTable = ref(true)

  // When the map section transitions from hidden → visible, Leaflet needs to
  // recalculate the container size or tiles only render in a small corner.
  watch(showMap, (visible) => {
    if (visible && typeof onMapShow === 'function') {
      // Use nextTick + rAF so the DOM has fully painted before invalidating
      nextTick(() => requestAnimationFrame(() => onMapShow()))
    }
  })

  // Call this after data loads and the outer content container (v-show/v-if)
  // becomes visible. When showMap is already true (default), the watch above
  // never fires for the initial data-load reveal, so we need an explicit nudge.
  // Components should call this from their watch([records, loading]) handler
  // once loading is false and records are present.
  const notifyMapVisible = () => {
    if (showMap.value && typeof onMapShow === 'function') {
      nextTick(() => requestAnimationFrame(() => onMapShow()))
    }
  }

  return { showCharts, showMap, showTable, notifyMapVisible }
}

// useMostRecentDate - Calculate most recent date from records
export function useMostRecentDate() {
  const getMostRecentDate = (records, dateField) => {
    if (!records || records.length === 0) return null
    
    const dates = records
      .map(r => {
        const dateStr = r[dateField]
        if (!dateStr) return null
        const date = new Date(dateStr)
        return isNaN(date.getTime()) ? null : date
      })
      .filter(d => d !== null)
    
    if (dates.length === 0) return null
    
    return new Date(Math.max(...dates))
  }

  return { getMostRecentDate }
}

// usePersistedFilters - Auto-save/restore filter state to localStorage per explorer
// Config keys: searchQuery, filters (ref with fromDate/toDate), filterValue,
//              selectedField (object ref), selectedOperator, limit, fieldOptions (array or computed),
//              plus any extra named refs (e.g. selectedYear, selectedFiscalYear)
export function usePersistedFilters(storageKey, config = {}) {
  const {
    searchQuery = null,
    filters = null,
    filterValue = null,
    selectedField = null,
    selectedOperator = null,
    limit = null,
    fieldOptions = null,
    ...extras
  } = config

  const STORAGE_KEY = `boston-filter-${storageKey}`

  const _serialize = () => {
    const data = {}
    if (searchQuery) data.searchQuery = searchQuery.value
    if (filters) {
      data.fromDate = filters.value.fromDate ?? ''
      data.toDate = filters.value.toDate ?? ''
    }
    if (filterValue) data.filterValue = filterValue.value
    if (selectedField) {
      const sf = selectedField.value
      data.selectedField = sf && typeof sf === 'object' ? sf.value : sf
    }
    if (selectedOperator) data.selectedOperator = selectedOperator.value
    if (limit) data.limit = limit.value
    for (const [k, r] of Object.entries(extras)) {
      if (r != null && typeof r === 'object' && 'value' in r) data[k] = r.value
    }
    return data
  }

  const restore = () => {
    let saved = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) saved = JSON.parse(raw)
    } catch (e) {}
    if (!saved) return

    if (searchQuery && saved.searchQuery != null) searchQuery.value = saved.searchQuery
    if (filters) {
      if (saved.fromDate != null) filters.value.fromDate = saved.fromDate
      if (saved.toDate != null) filters.value.toDate = saved.toDate
    }
    if (filterValue && saved.filterValue != null) filterValue.value = saved.filterValue
    if (selectedField && fieldOptions && saved.selectedField != null) {
      const fo = Array.isArray(fieldOptions) ? fieldOptions : fieldOptions.value
      const match = fo?.find(f => f.value === saved.selectedField)
      if (match) selectedField.value = match
    }
    if (selectedOperator && saved.selectedOperator != null) selectedOperator.value = saved.selectedOperator
    if (limit && saved.limit != null) limit.value = Number(saved.limit)
    for (const [k, r] of Object.entries(extras)) {
      if (r != null && typeof r === 'object' && 'value' in r && saved[k] != null) r.value = saved[k]
    }
  }

  const clear = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
  }

  const watchTargets = [
    searchQuery, filters, filterValue, selectedField, selectedOperator, limit,
    ...Object.values(extras).filter(r => r != null && typeof r === 'object' && 'value' in r)
  ].filter(Boolean)

  if (watchTargets.length > 0) {
    watch(watchTargets, () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_serialize())) } catch (e) {}
    }, { deep: true })
  }

  return { restore, clear }
}

// useSavedQueries - Save and load query filters to local storage
export function useSavedQueries() {
  const saveQuery = (queryName, queryData) => {
    try {
      const allQueries = JSON.parse(localStorage.getItem('bostonData_savedQueries') || '{}')
      allQueries[queryName] = {
        ...queryData,
        savedAt: new Date().toISOString()
      }
      localStorage.setItem('bostonData_savedQueries', JSON.stringify(allQueries))
      return true
    } catch (err) {
      console.error('[composables] Error saving query:', err)
      return false
    }
  }

  const loadQuery = (queryName) => {
    try {
      const allQueries = JSON.parse(localStorage.getItem('bostonData_savedQueries') || '{}')
      return allQueries[queryName] || null
    } catch (err) {
      console.error('[composables] Error loading query:', err)
      return null
    }
  }

  const getSavedQueries = () => {
    try {
      return JSON.parse(localStorage.getItem('bostonData_savedQueries') || '{}')
    } catch (err) {
      console.error('[composables] Error getting saved queries:', err)
      return {}
    }
  }

  const deleteQuery = (queryName) => {
    try {
      const allQueries = JSON.parse(localStorage.getItem('bostonData_savedQueries') || '{}')
      delete allQueries[queryName]
      localStorage.setItem('bostonData_savedQueries', JSON.stringify(allQueries))
      return true
    } catch (err) {
      console.error('[composables] Error deleting query:', err)
      return false
    }
  }

  return { saveQuery, loadQuery, getSavedQueries, deleteQuery }
}

// useUrlSync — bidirectional sync between filter state and URL hash params.
//
// Usage (in <script setup>):
//   const readUrlParams = useUrlSync(() => ({ q: searchQuery.value, ... }), deps)
//   onMounted(() => { restore(); readUrlParams(p => { ... apply p to state ... }); fetchData() })
//
// getParams:  () => Object  — maps current filter state to URL param object.
//                             Falsy values are omitted automatically.
// deps:       reactive refs to watch (triggers URL update on change).
//
// Returns readUrlParams(applyFn) — call in onMounted after restore() to apply
// any URL params to state before the first fetch.
export function useUrlSync(getParams, deps) {
  const syncUrl = debounce(() => setHashParams(getParams()), 250)
  watch(deps, syncUrl, { deep: true })

  // Returns the result of applyFn so callers can `await readUrlParams(async p => { ... })`
  // when the apply function itself is async (e.g. needs a nextTick after changing year).
  return function readUrlParams(applyFn) {
    const params = getHashParams()
    if (Object.keys(params).length > 0) return applyFn(params)
  }
}

// useDrillDown — Handle drill-down hyperlink clicks in record cells
//
// Usage (in <script setup>):
//   const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchFn)
//   // In template: @click.stop="drillDown('FIELD_NAME', record.fieldValue)"
//
// fieldOptions:     Array of { label, value } objects
// searchQuery:      Ref to the search query text
// filters:          Ref to { fromDate, toDate }
// selectedField:    Ref to currently selected field object
// selectedOperator: Ref to filter operator
// filterValue:      Ref to filter value
// offset:           Ref to pagination offset
// fetchFn:          Function to execute the search (e.g., fetchCrimeData, fetchInspections)
export function useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchFn) {
  const drillDown = (fieldKey, displayValue) => {
    const field = fieldOptions.find(f => f.value === fieldKey)
    if (!field) return
    searchQuery.value = ''
    filters.value.fromDate = ''
    filters.value.toDate = ''
    selectedField.value = field
    selectedOperator.value = '='
    filterValue.value = displayValue
    offset.value = 0
    fetchFn()
  }

  return { drillDown }
}
