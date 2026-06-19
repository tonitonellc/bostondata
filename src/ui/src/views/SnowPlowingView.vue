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

const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()
const helpModal = useHelpModal()
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('snow-map')
const { showCharts, showMap, showTable } = useCollapsibleSections(invalidateSize)

// State
const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const closedRequests = ref(0)
const openRequests = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const fieldOptions = [
  { label: 'Case Title', value: 'case_title' },
  { label: 'Department', value: 'department' },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'Status', value: 'case_status' },
  { label: 'Type', value: 'type' }
]

const selectedField = ref(fieldOptions[0])
const filters = ref({ fromDate: '', toDate: '' })
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = '2be28d90-3a90-4af1-a3f6-f28c1e25880a'

const { restore, clear } = usePersistedFilters('snow', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

// Computed
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

// Functions
const selectRecord = (record) => {
  selectedRecord.value = record
  const lat = parseFloat(record.latitude)
  const lon = parseFloat(record.longitude)
  
  if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
    const label = `${record.case_title} - ${record.neighborhood}`
    displayLocation(lat, lon, label)
  }
}

const calculateStats = () => {
  closedRequests.value = records.value.filter(r => r.case_status === 'Closed').length
  openRequests.value = records.value.filter(r => r.case_status === 'Open').length
}

const fetchSnowData = async () => {
  const clauses = []
  const dateClause = buildDateClause('open_dt', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['case_title', 'neighborhood'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-snow',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'open_dt',
    errorPrefix: 'snow plowing data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchSnowData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchSnowData()
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
  fetchSnowData()
}

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
  fetchSnowData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchSnowData)

// Chart Logic
const neighborhoodRef = ref(null)
const statusRef = ref(null)
const typeRef = ref(null)
const timelineRef = ref(null)
let neighborhoodChart, statusChart, typeChart, timelineChart

const aggregateByNeighborhood = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['neighborhood'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByStatus = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['case_status'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByType = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['type'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByDate = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    if(!r.open_dt) return
    const d = new Date(r.open_dt)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (neighborhoodChart) neighborhoodChart.destroy()
  if (statusChart) statusChart.destroy()
  if (typeChart) typeChart.destroy()
  if (timelineChart) timelineChart.destroy()

  // Neighborhood Bar
  if (neighborhoodRef.value) {
    const data = aggregateByNeighborhood.value.slice(0, 10)
    neighborhoodChart = new Chart(neighborhoodRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Requests',
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

  // Status Pie
  if (statusRef.value) {
    const data = aggregateByStatus.value
    statusChart = new Chart(statusRef.value, {
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

  // Type Bar
  if (typeRef.value) {
    const data = aggregateByType.value.slice(0, 10)
    typeChart = new Chart(typeRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Requests',
          data: data.map(d => d.count),
          backgroundColor: chartColors.teal
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    })
  }

  // Timeline Line
  if (timelineRef.value && aggregateByDate.value.length > 0) {
    const data = aggregateByDate.value
    timelineChart = new Chart(timelineRef.value, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: 'Requests by Month',
          data: data.map(d => d.count),
          borderColor: chartColors.purple,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    })
  }
}

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `${r.case_title || ''}, ${r.neighborhood || ''}`
    const lat = parseFloat(r.latitude)
    const lon = parseFloat(r.longitude)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else {
      const addr = r.location_street_name
        ? `${r.location_street_name}, Boston, MA`
        : r.neighborhood ? `${r.neighborhood}, Boston, MA` : null
      if (addr && !fallback.has(addr)) fallback.set(addr, label)
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
    displayAllPins()
  }
})

// Lifecycle hooks
const readUrlParams = useUrlSync(
  () => ({
    q: searchQuery.value || undefined,
    field: selectedField.value?.value !== fieldOptions[0].value ? selectedField.value?.value : undefined,
    op: selectedOperator.value !== '=' ? encodeOp(selectedOperator.value) : undefined,
    val: filterValue.value || undefined,
    from: filters.value.fromDate || undefined,
    to: filters.value.toDate || undefined,
    limit: limit.value !== 25 ? String(limit.value) : undefined,
  }),
  [searchQuery, selectedField, selectedOperator, filterValue, filters, limit]
)

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
  fetchSnowData()
})

onUnmounted(() => {
  destroyMap()
})

watch(selectedRecord, (newRecord) => {
  if (!newRecord) {
    displayAllPins()
    return
  }
  if (newRecord.latitude && newRecord.longitude) {
    const lat = parseFloat(newRecord.latitude)
    const lon = parseFloat(newRecord.longitude)
    if (!isNaN(lat) && !isNaN(lon)) {
      displayLocation(lat, lon, `${newRecord.case_title}, ${newRecord.neighborhood}`)
    }
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Snow Plowing Requests Archive</h1>
      <p class="subtitle">Archive of Winter snow plowing and clearing service requests for Boston streets. Last updated in 2018.</p>
      <button @click="helpModal.openHelpModal('Snow Plowing Requests', 'https://data.boston.gov/dataset/snow-plowing', 'Records of snow plowing requests submitted during winter months, including status and location.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Closed Requests (Current Page)</div>
        <div class="stat-value">{{ closedRequests }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completion Rate (Current Page)</div>
        <div class="stat-value">{{ records.length > 0 ? Math.round((closedRequests / records.length) * 100) : 0 }}%</div>
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
        <input v-model="searchQuery" placeholder="Search..." @keyup.enter="handleSearch" />
      </div>

      <div class="filter-group">
        <label for="from-date">From Date:</label>
        <input id="from-date" type="date" v-model="filters.fromDate" @change="handleSQLSearch" />
      </div>

      <div class="filter-group">
        <label for="to-date">To Date:</label>
        <input id="to-date" type="date" v-model="filters.toDate" @change="handleSQLSearch" />
      </div>

      <div class="filter-group">
        <label>Advanced Filter:</label>
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

      <div class="button-group">
        <button @click="resetFilters" class="page-btn reset-btn">Reset Filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>
    <div v-else-if="error" class="error"><p>{{ error }}</p><button @click="handleSearch" class="page-btn">Retry</button></div>

    <div v-else-if="records.length > 0" class="content-container">
      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedRecord" class="selected-info">Selected: {{ selectedRecord.case_title }}</p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>
        <div id="snow-map" class="map-container"></div>
      </div>

      <div class="table-section">
        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>Top Neighborhoods</h3>
              <canvas ref="neighborhoodRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Status</h3>
              <canvas ref="statusRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Request Types</h3>
              <canvas ref="typeRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Requests Over Time</h3>
              <canvas ref="timelineRef"></canvas>
            </div>
          </div>

          <div class="section-header" @click="showTable = !showTable">
            <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
            <h2>Records Table</h2>
          </div>
          <div v-show="showTable">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('case_enquiry_id')" style="cursor: pointer;">ID {{ getSortIndicator('case_enquiry_id') }}</th>
                  <th @click="sortBy('case_title')" style="cursor: pointer;">Title {{ getSortIndicator('case_title') }}</th>
                  <th @click="sortBy('neighborhood')" style="cursor: pointer;">Neighborhood {{ getSortIndicator('neighborhood') }}</th>
                  <th @click="sortBy('case_status')" style="cursor: pointer;">Status {{ getSortIndicator('case_status') }}</th>
                  <th @click="sortBy('open_dt')" style="cursor: pointer;">Opened {{ getSortIndicator('open_dt') }}</th>
                  <th @click="sortBy('closed_dt')" style="cursor: pointer;">Closed {{ getSortIndicator('closed_dt') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in sortedRecords" :key="record._id" @click="selectRecord(record)" :class="{ 'selected-row': selectedRecord?._id === record._id }" class="clickable-row">
                  <td data-label="ID">{{ record.case_enquiry_id }}</td>
                  <td data-label="Title"><span class="drilldown" @click.stop="drillDown('case_title', record.case_title)">{{ record.case_title }}</span></td>
                  <td data-label="Neighborhood"><span class="drilldown" @click.stop="drillDown('neighborhood', record.neighborhood)">{{ record.neighborhood }}</span></td>
                  <td data-label="Status"><span class="drilldown" @click.stop="drillDown('case_status', record.case_status)">{{ record.case_status }}</span></td>
                  <td data-label="Opened">{{ formatDate(record.open_dt) }}</td>
                  <td data-label="Closed">{{ record.closed_dt ? formatDate(record.closed_dt) : 'Open' }}</td>
                </tr>
              </tbody>
            </table>

            <div class="pagination" v-if="totalRecords > 0">
              <button 
                :disabled="currentPage === 1" 
                @click="firstPage" 
                class="page-btn"
                title="First Page"
              >
                « First
              </button>
              <button 
                :disabled="currentPage === 1" 
                @click="previousPage" 
                class="page-btn"
                title="Previous Page"
              >
                ‹ Previous
              </button>
              
              <span class="pagination-info">
                Showing {{ formatNumber(startRecord) }} - {{ formatNumber(endRecord) }} of {{ formatNumber(totalRecords) }} records
              </span>
              
              <select 
                :value="currentPage" 
                @change="onPageSelect" 
                class="page-select"
                title="Select Page"
              >
                <option v-for="page in pageOptions" :key="page" :value="page">
                  Page {{ page }} of {{ totalPages }}
                </option>
              </select>
              
              <button 
                :disabled="currentPage === totalPages" 
                @click="nextPage" 
                class="page-btn"
                title="Next Page"
              >
                Next ›
              </button>
              <button 
                :disabled="currentPage === totalPages" 
                @click="lastPage" 
                class="page-btn"
                title="Last Page"
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state"><p>No records found matching your filters.</p></div>

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
