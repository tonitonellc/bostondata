<!--
Copyright (c) 2026 Toni Tone, LLC
-->
<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { fetchData } from '../utils/fetchData'
import { formatDate, formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('entertainment-map')

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const activeLicenses = ref(0)
const upcomingEvents = ref(0)
const offset = ref(0)
const limit = ref(25)
const selectedRecord = ref(null)


const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'License Type', value: 'license_type' },
  { label: 'Status', value: 'status' },
  { label: 'Business/Event Name', value: 'dba_name' },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'City', value: 'city' },
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

let isInitialMount = true

const resourceId = 'eb683641-e358-4c2c-95de-c84f32c09147'

const { restore, clear } = usePersistedFilters('entertainment', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()

const sortedRecords = computed(() => {
  if (!sortField.value) return records.value
  return sortRecords(records.value, sortField.value)
})

const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
const totalPages = computed(() => Math.ceil(totalRecords.value / limit.value))
const startRecord = computed(() => totalRecords.value === 0 ? 0 : offset.value + 1)
const endRecord = computed(() => Math.min(offset.value + limit.value, totalRecords.value))

const pageOptions = computed(() => {
  const pages = []
  for (let i = 1; i <= totalPages.value; i++) {
    pages.push(i)
  }
  return pages
})

const displayedPins = computed(() => {
  return records.value.length > 200 ? Math.min(100, records.value.length) : records.value.length
})

const selectRecord = (record) => {
  selectedRecord.value = record
}

const calculateStats = () => {
  activeLicenses.value = records.value.filter(r => 
    r.status?.toLowerCase() === 'active' || r.status?.toLowerCase() === 'open'
  ).length
  
  const now = new Date()
  upcomingEvents.value = records.value.filter(r => {
    const startDate = r.issued || r['Issued Date'] || r.issued_date || r.start_date_time
    if (!startDate) return false
    return new Date(startDate) > now
  }).length
}

const fetchEntertainmentData = async () => {
  const clauses = []
  // Use 'issued' for date filtering - exists in Annual and One-Time licenses
  if (filters.value.fromDate || filters.value.toDate) {
    const dateClause = buildDateClause('issued', filters.value.fromDate, filters.value.toDate)
    clauses.push(...dateClause)
  }

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['dba_name', 'address', 'business_name'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-entertainment',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'issued',
    errorPrefix: 'entertainment license data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => {
  offset.value = 0
  setHashParams(getParams())
  fetchEntertainmentData()
}
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchEntertainmentData()
}

const firstPage = () => goToPage(1)
const previousPage = () => goToPage(currentPage.value - 1)
const nextPage = () => goToPage(currentPage.value + 1)
const lastPage = () => goToPage(totalPages.value)

const onPageSelect = (e) => {
  goToPage(Number(e.target.value))
}

const onLimitChange = () => {
  offset.value = 0
  fetchEntertainmentData()
}

// Auto-search when filter field or operator changes
watch([selectedField, selectedOperator], () => {
  if (isInitialMount) return
  offset.value = 0
  fetchEntertainmentData()
})

const resetFilters = () => {
  clear()
  searchQuery.value = ''
  filters.value.fromDate = ''
  filters.value.toDate = ''
  filterValue.value = ''
  selectedField.value = fieldOptions[0]
  selectedOperator.value = '='
  limit.value = 25
  offset.value = 0
  setHashParams({})
  fetchEntertainmentData()
}

const getParams = () => ({
  ...(searchQuery.value && { q: searchQuery.value }),
  ...(filterValue.value && {
    field: selectedField.value.value,
    op: encodeOp(selectedOperator.value),
    val: filterValue.value
  }),
  ...(filters.value.fromDate && { from: filters.value.fromDate }),
  ...(filters.value.toDate && { to: filters.value.toDate }),
  ...(limit.value !== 25 && { limit: limit.value })
})

const readUrlParams = useUrlSync(getParams, [searchQuery, filterValue, selectedField, selectedOperator, filters, limit])

// Chart Logic
const typeChartRef = ref(null)
const sourceChartRef = ref(null)
const neighborhoodChartRef = ref(null)
const statusChartRef = ref(null)
let typeChart, sourceChart, neighborhoodChart, statusChart

const aggregateByType = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.license_type || r.source_dataset || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateBySource = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.source_dataset || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByNeighborhood = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.neighborhood || r.city || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count)
})

const aggregateByStatus = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.status || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (typeChart) typeChart.destroy()
  if (sourceChart) sourceChart.destroy()
  if (neighborhoodChart) neighborhoodChart.destroy()
  if (statusChart) statusChart.destroy()

  if (typeChartRef.value) {
    const data = aggregateByType.value.slice(0, 10)
    typeChart = new Chart(typeChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Count',
          data: data.map(d => d.count),
          backgroundColor: chartColors.primary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    })
  }

  if (sourceChartRef.value) {
    const data = aggregateBySource.value
    sourceChart = new Chart(sourceChartRef.value, {
      type: 'pie',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: data.map((_, i) => getColor(i))
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    })
  }

  if (neighborhoodChartRef.value) {
    const data = aggregateByNeighborhood.value.slice(0, 10)
    neighborhoodChart = new Chart(neighborhoodChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Licenses/Events',
          data: data.map(d => d.count),
          backgroundColor: chartColors.teal
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } }
      }
    })
  }

  if (statusChartRef.value) {
    const data = aggregateByStatus.value
    statusChart = new Chart(statusChartRef.value, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: [chartColors.green, chartColors.red, chartColors.gray, chartColors.blue]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } }
      }
    })
  }
}

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `${r.dba_name || r['App Name'] || r.app_name || 'Event'} — ${r.address || ''}`
    const lat = parseFloat(r.gpsy)
    const lon = parseFloat(r.gpsx)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else if (r.address) {
      const addr = `${r.address}, Boston, MA`
      if (!fallback.has(addr)) fallback.set(addr, label)
    }
  }
  const markers = [...direct]
  let i = 0
  for (const [addr, label] of fallback) {
    const coords = await geocodeAddress(addr)
    if (coords) markers.push({ lat: coords.lat, lon: coords.lon, label })
    if (i < fallback.size - 1) await new Promise(r => setTimeout(r, 250))
    i++
  }
  displayAllLocations(markers)
}

watch([records, loading], () => {
  renderCharts()
  if (!loading.value && records.value.length > 0) {
    selectedRecord.value = null
    notifyMapVisible()
    displayAllPins()
  }
})

const helpModal = useHelpModal()
let drillDownInstance = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchEntertainmentData)
let { drillDown: drillDownFn } = drillDownInstance

// Wrapper to ensure selectedField is always properly set when drill-down is triggered
const drillDown = (fieldName, value) => {
  // Ensure the field object is set in selectedField
  const field = fieldOptions.find(f => f.value === fieldName)
  if (field) {
    selectedField.value = field
  }
  // Call the actual drillDown function
  drillDownFn(fieldName, value)
}

const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)

onMounted(() => {
  restore()
  initializeMap()
  readUrlParams(p => {
    if (p.q) searchQuery.value = p.q
    if (p.field) selectedField.value = fieldOptions.find(f => f.value === p.field) ?? fieldOptions[0]
    if (p.op) selectedOperator.value = decodeOp(p.op)
    if (p.val) filterValue.value = p.val
    if (p.from) filters.value.fromDate = p.from
    if (p.to) filters.value.toDate = p.to
    if (p.limit) limit.value = Number(p.limit)
  })
  isInitialMount = false
  fetchEntertainmentData()
})

onUnmounted(() => {
  destroyMap()
})

watch(selectedRecord, (newRecord) => {
  if (!newRecord) {
    displayAllPins()
    return
  }
  const lat = parseFloat(newRecord.gpsy)
  const lon = parseFloat(newRecord.gpsx)
  const label = `${newRecord.dba_name || newRecord['App Name'] || newRecord.app_name || 'Event'} - ${newRecord.address}`

  if (!isNaN(lat) && !isNaN(lon)) {
    displayLocation(lat, lon, label)
  } else if (newRecord.address) {
    const fullAddress = `${newRecord.address}, Boston, MA`
    displayLocation(null, null, label, fullAddress)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Entertainment Licenses</h1>
      <p class="subtitle">Annual, Special, and One-Time entertainment licenses and permits</p>
      <button @click="helpModal.openHelpModal('Entertainment Licenses', 'https://data.boston.gov/dataset/entertainment-licenses', 'Comprehensive records of entertainment licenses issued by the City of Boston, including annual licenses, special permits, and one-time events.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Licenses (Current Page)</div>
        <div class="stat-value">{{ activeLicenses }}</div>
      </div>
    </div>

    <div class="filters">
      <div class="filter-group">
        <label>Records per page:</label>
        <select v-model.number="limit" @change="onLimitChange">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
          <option :value="400">400</option>
          <option :value="750">750</option>
          <option :value="1000">1000</option>
          <option :value="2000">2000</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Text Search:</label>
        <input v-model="searchQuery" placeholder="Search business, event name..." @keyup.enter="handleSearch" />
      </div>

      <div class="filter-group">
        <label for="from-date">From Date:</label>
        <input id="from-date" type="date" v-model="filters.fromDate" @change="handleSQLSearch" />
      </div>

      <div class="filter-group">
        <label for="to-date">To Date:</label>
        <input id="to-date" type="date" v-model="filters.toDate" @change="handleSQLSearch" />
      </div>

      <div class="filter-group sql-builder">
        <label>Advanced Filter:</label>
        <div class="builder-controls">
          <select v-model="selectedField">
            <option v-for="f in fieldOptions" :key="f.value" :value="f">{{ f.label }}</option>
          </select>
          <select v-model="selectedOperator">
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value="LIKE">Contains</option>
          </select>
          <input v-model="filterValue" placeholder="Value..." @keyup.enter="handleSQLSearch" />
        </div>
      </div>

      <div class="button-group">
        <button @click="resetFilters" class="page-btn reset-btn">Reset Filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading entertainment license data...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="handleSearch" class="page-btn">Retry</button>
    </div>

    <div v-show="!loading && !error && records.length > 0" class="content-container">
      <!-- Collapsible Graphs Section -->
      <div class="section-header" @click="showCharts = !showCharts">
        <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
        <h2>Charts & Analytics</h2>
      </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>License Types</h3>
              <canvas ref="typeChartRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Source Dataset</h3>
              <canvas ref="sourceChartRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Top Neighborhoods</h3>
              <canvas ref="neighborhoodChartRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>License Status</h3>
              <canvas ref="statusChartRef"></canvas>
            </div>
          </div>

          <!-- Collapsible Map Section -->
      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
          <div v-show="showMap" class="map-section">
            <div class="map-header">
              <p v-if="selectedRecord" class="selected-info">
                Selected: {{ selectedRecord.dba_name || selectedRecord['App Name'] || selectedRecord.app_name || 'Event' }} - {{ selectedRecord.address }}
              </p>
              <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
            </div>
            <div id="entertainment-map" class="map-container"></div>
          </div>

          <!-- Collapsible Table Section -->
      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>License Records</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('dba_name')" style="cursor: pointer;">Business/Event {{ getSortIndicator('dba_name') }}</th>
                  <th @click="sortBy('license_type')" style="cursor: pointer;">Type {{ getSortIndicator('license_type') }}</th>
                  <th @click="sortBy('status')" style="cursor: pointer;">Status {{ getSortIndicator('status') }}</th>
                  <th @click="sortBy('address')" style="cursor: pointer;">Address {{ getSortIndicator('address') }}</th>
                  <th @click="sortBy('issued')" style="cursor: pointer;">Issued {{ getSortIndicator('issued') }}</th>
                  <th @click="sortBy('expires')" style="cursor: pointer;">Expires {{ getSortIndicator('expires') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="record in sortedRecords" 
                  :key="record._id"
                  @click="selectRecord(record)"
                  :class="{ 'selected-row': selectedRecord?._id === record._id }"
                  class="clickable-row"
                >
                  <td data-label="Business/Event">
                    <span class="drilldown" @click.stop="drillDown('dba_name', record.dba_name || record.app_name || record.business_name)">
                      {{ record.dba_name || record.app_name || record.business_name || 'N/A' }}
                    </span>
                  </td>
                  <td data-label="Type">
                    <span class="drilldown" @click.stop="drillDown('license_type', record.license_type)">
                      {{ record.license_type || 'Special/One-Time' }}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span class="drilldown status-badge" :class="'status-' + (record.status || 'unknown').toLowerCase()" @click.stop="drillDown('status', record.status)">
                      {{ record.status || 'N/A' }}
                    </span>
                  </td>
                  <td data-label="Address">{{ record.address || (record.street_number + ' ' + record.street_name + ' ' + record.street_suffix).trim() || 'N/A' }}</td>
                  <td data-label="Issued">{{ formatDate(record.issued || record['Issued Date'] || record.issued_date) }}</td>
                  <td data-label="Expires">{{ formatDate(record.expires || record['End Date and Time'] || record.end_date_time) }}</td>
                </tr>
              </tbody>
            </table>

            <div class="pagination" v-if="totalRecords > 0">
              <button :disabled="currentPage === 1" @click="firstPage" class="page-btn" title="First Page">« First</button>
              <button :disabled="currentPage === 1" @click="previousPage" class="page-btn" title="Previous Page">‹ Previous</button>
              
              <span class="pagination-info">
                Showing {{ formatNumber(startRecord) }} - {{ formatNumber(endRecord) }} of {{ formatNumber(totalRecords) }} records
              </span>
              
              <select :value="currentPage" @change="onPageSelect" class="page-select" title="Select Page">
                <option v-for="page in pageOptions" :key="page" :value="page">
                  Page {{ page }} of {{ totalPages }}
                </option>
              </select>
              
              <button :disabled="currentPage === totalPages" @click="nextPage" class="page-btn" title="Next Page">Next ›</button>
              <button :disabled="currentPage === totalPages" @click="lastPage" class="page-btn" title="Last Page">Last »</button>
            </div>
          </div>
      </div>
    </div>

    <div v-if="!loading && !error && records.length === 0" class="empty-state">
      <p>No entertainment licenses found matching your filters.</p>
    </div>

    <div v-if="helpModal.showModal.value" class="modal-overlay" @click="helpModal.closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>{{ helpModal.modalContent.value.title }}</h2>
          <button @click="helpModal.closeModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ helpModal.modalContent.value.description }}</p>
          <a :href="helpModal.modalContent.value.url" target="_blank" class="dataset-link">View Dataset on boston.gov →</a>
        </div>
      </div>
    </div>
  </div>
</template>
