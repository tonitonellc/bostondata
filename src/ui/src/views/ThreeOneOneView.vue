<!--
Copyright (c) 2026 Toni Tone, LLC
-->
<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, usePersistedFilters, useUrlSync } from '../composables/composables'
import { chartColors } from '../utils/chartUtils'
import { fetchData } from '../utils/fetchData'
import { formatDate, formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const helpModal = useHelpModal()
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('three-one-one-map')
const { showCharts, showMap, showTable } = useCollapsibleSections(invalidateSize)

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const openCases = ref(0)
const avgResolutionTime = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const sortField = ref('')
const sortDirection = ref('asc')


const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'Case Topic', value: 'case_topic' },
  { label: 'Department', value: 'assigned_department' },
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'Status', value: 'case_status' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = '254adca6-64ab-4c5c-9fc0-a6da622be185'

const { restore, clear } = usePersistedFilters('311', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

const sortedRecords = computed(() => {
  if (!sortField.value) return records.value
  return records.value.sort((a, b) => {
    if (a[sortField.value] < b[sortField.value]) return sortDirection.value === 'asc' ? -1 : 1
    if (a[sortField.value] > b[sortField.value]) return sortDirection.value === 'asc' ? 1 : -1
    return 0
  })
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

const shouldHideChart = (chartFieldValue) => {
  return filterValue.value && selectedOperator.value === '=' && selectedField.value.value === chartFieldValue
}

const sortBy = (field) => {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const getSortIndicator = (field) => {
  if (sortField.value === field) {
    return sortDirection.value === 'asc' ? '↑' : '↓'
  }
  return ''
}

const selectRecord = (record) => {
  selectedRecord.value = record
  const lat = parseFloat(record.latitude)
  const lon = parseFloat(record.longitude)
  
  if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
    const label = `${record.case_topic} - ${record.neighborhood}`
    displayLocation(lat, lon, label)
  }
}

const calculate311Stats = () => {
  openCases.value = records.value.filter(r => r.case_status != 'Closed').length
  avgResolutionTime.value = 0
}

const fetch311Data = async () => {
  const clauses = []
  const dateClause = buildDateClause('open_date', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['case_topic', 'assigned_department'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-311',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'open_date',
    errorPrefix: '311 data',
    onSuccess: calculate311Stats
  })
}

const handleSearch = () => { offset.value = 0; fetch311Data() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetch311Data()
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
  fetch311Data()
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
  fetch311Data()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetch311Data)

// Chart Logic
const topicRef = ref(null)
const neighborhoodRef = ref(null)
const statusRef = ref(null)
const dateRef = ref(null)
let topicChart, neighborhoodChart, statusChart, dateChart

const aggregateByTopic = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['case_topic'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

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

const aggregateByDate = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    if(!r.open_date) return
    const d = new Date(r.open_date)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (topicChart) topicChart.destroy()
  if (neighborhoodChart) neighborhoodChart.destroy()
  if (statusChart) statusChart.destroy()
  if (dateChart) dateChart.destroy()

  // Topic Bar
  if (topicRef.value) {
    const data = aggregateByTopic.value.slice(0, 10)
    topicChart = new Chart(topicRef.value, {
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

  // Neighborhood Bar
  if (neighborhoodRef.value) {
    const data = aggregateByNeighborhood.value
    neighborhoodChart = new Chart(neighborhoodRef.value, {
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

  // Status Pie
  if (statusRef.value) {
    const data = aggregateByStatus.value
    statusChart = new Chart(statusRef.value, {
      type: 'pie',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: [chartColors.blue, chartColors.green, chartColors.gray]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    })
  }

  // Date Line
  if (dateRef.value && aggregateByDate.value.length > 0) {
    const data = aggregateByDate.value
    dateChart = new Chart(dateRef.value, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: 'Requests by Day',
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
    const label = `${r.case_topic || ''}, ${r.neighborhood || ''}`
    const lat = parseFloat(r.latitude)
    const lon = parseFloat(r.longitude)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else {
      const addr = r.full_address
        ? `${r.full_address}, Boston, MA`
        : r.street_name
          ? `${r.street_name}, Boston, MA ${r.zip_code || ''}`.trim()
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
  fetch311Data()
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
      displayLocation(lat, lon, `${newRecord.case_topic}, ${newRecord.neighborhood}`)
    }
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>311 Service Requests</h1>
      <p class="subtitle">Citizen-reported service requests for the City of Boston</p>
      <button @click="helpModal.openHelpModal('311 Service Requests', 'https://data.boston.gov/dataset/311-service-requests', 'Complete records of 311 service requests submitted by Boston residents, including request type, status, and location.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open Cases (Current Page)</div>
        <div class="stat-value">{{ openCases }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Closure Rate (Current Page)</div>
        <div class="stat-value">{{ records.length > 0 ? Math.round(((records.length - openCases) / records.length) * 100) : 0 }}%</div>
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
        <input v-model="searchQuery" placeholder="Search by title, dept..." @keyup.enter="handleSearch" />
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

        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div v-if="!shouldHideChart('case_topic')" class="chart-card">
              <h3>Topics</h3>
              <canvas ref="topicRef"></canvas>
            </div>
            <div v-if="!shouldHideChart('neighborhood')" class="chart-card">
              <h3>Neighborhoods</h3>
              <canvas ref="neighborhoodRef"></canvas>
            </div>
            <div v-if="!shouldHideChart('case_status')" class="chart-card">
              <h3>Status</h3>
              <canvas ref="statusRef"></canvas>
            </div>
             <div class="chart-card">
              <h3>Requests by Day</h3>
              <canvas ref="dateRef"></canvas>
            </div>
          </div>
          
        <div class="section-header" @click="showMap = !showMap">
          <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
          <h2>Location Map</h2>
        </div>
        <div v-show="showMap" class="map-section">
          <p v-if="selectedRecord" class="selected-info">
            Selected: {{ selectedRecord.case_status }} {{ selectedRecord.case_topic }} case in {{ selectedRecord.neighborhood }}
          </p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        <div id="three-one-one-map" class="map-container"></div>
        </div>
      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>311 Records</h2>
      </div>
        <div v-show="showTable" class="table-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="sortBy('neighborhood')" style="cursor: pointer;">Neighborhood {{ getSortIndicator('neighborhood') }}</th>
                <th @click="sortBy('case_topic')" style="cursor: pointer;">Topic {{ getSortIndicator('case_title') }}</th>
                <th @click="sortBy('case_status')" style="cursor: pointer;">Status {{ getSortIndicator('case_status') }}</th>
                <th @click="sortBy('assigned_team')" style="cursor: pointer;">Assigned Team {{ getSortIndicator('case_title') }}</th>
                <th @click="sortBy('open_date')" style="cursor: pointer;">Opened {{ getSortIndicator('open_dt') }}</th>
                <th @click="sortBy('target_close_date')" style="cursor: pointer;">Target Close {{ getSortIndicator('closed_dt') }}</th>
                <th @click="sortBy('close_date')" style="cursor: pointer;">Closed {{ getSortIndicator('closed_dt') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in sortedRecords" :key="record._id" @click="selectRecord(record)" :class="{ 'selected-row': selectedRecord?._id === record._id }" class="clickable-row">
                <td data-label="Neighborhood"><span class="drilldown" @click.stop="drillDown('neighborhood', record.neighborhood)">{{ record.neighborhood }}</span></td>
                <td data-label="Topic"><span class="drilldown" @click.stop="drillDown('case_topic', record.case_topic)">{{ record.case_topic }}</span></td>
                <td data-label="Status"><span class="drilldown" @click.stop="drillDown('case_status', record.case_status)">{{ record.case_status }}</span></td>
                <td data-label="Assigned Team">{{ record.assigned_team }}</td>
                <td data-label="Opened">{{ formatDate(record.open_date) }}</td>
                <td data-label="Target Close">{{ record.target_close_date ? formatDate(record.target_close_date) : '' }}</td>
                <td data-label="Closed">{{ record.close_date ? formatDate(record.close_date) : 'Open' }}</td>
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
            </button></div>
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
