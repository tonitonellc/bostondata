<!--
Copyright (c) 2026 Toni Tone, LLC
-->
<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { debounce } from '../utils/debounce'
import { fetchData } from '../utils/fetchData'
import { formatCurrency, formatDate, formatNumber, parseNumericString } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildNumericClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const helpModal = useHelpModal()
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('violations-map')
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)
const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const openViolations = ref(0)
const totalFines = ref(0)
const averageFine = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'Value', value: 'value', type: 'money' },
  { label: 'Status', value: 'status' },
  { label: 'Description', value: 'description' },
  { label: 'Street', value: 'violation_street' },
  { label: 'City', value: 'violation_city' },
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('>')
const filterValue = ref('')

const resourceId = '90ed3816-5e70-443c-803d-9a71f44470be'

const { restore, clear } = usePersistedFilters('violations', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

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

const shouldHideChart = (chartFieldValue) => {
  return filterValue.value && selectedOperator.value === '=' && selectedField.value.value === chartFieldValue
}

const selectRecord = (record) => {
  selectedRecord.value = record
}

const calculateStats = () => {
  const totals = records.value.reduce((acc, r) => {
    if (r.status === 'Open') acc.open += 1
    acc.fines += parseNumericString(r.value)
    return acc
  }, { open: 0, fines: 0 })

  openViolations.value = totals.open
  totalFines.value = totals.fines
  averageFine.value = records.value.length > 0 ? totals.fines / records.value.length : 0
}

const fetchViolations = async () => {
  const clauses = []
  const dateClause = buildDateClause('status_dttm', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const operator = selectedOperator.value
    const fieldValue = selectedField.value.value

    if (selectedField.value.type === 'money' && ['>', '<', '!=', '>=', '<='].includes(operator)) {
      const clause = buildNumericClause(fieldValue, operator, filterValue.value)
      clauses.push(clause)
    } else {
      const clause = buildTextClause(fieldValue, operator, filterValue.value)
      if (clause) clauses.push(clause)
    }
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['violation_street', 'description'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-violations',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'status_dttm',
    errorPrefix: 'code violations',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchViolations() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchViolations()
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
  fetchViolations()
}

const resetFilters = () => {
  clear()
  searchQuery.value = ''
  filters.value.fromDate = ''
  filters.value.toDate = ''
  filterValue.value = ''
  selectedField.value = fieldOptions[0]
  selectedOperator.value = '>'
  limit.value = 25
  offset.value = 0
  setHashParams({})
  fetchViolations()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchViolations)

// Chart Logic
const statusRef = ref(null)
const descriptionRef = ref(null)
const cityRef = ref(null)
let statusChart, descriptionChart, cityChart

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

const aggregateByDescription = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.description || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByCity = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.violation_city || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (statusChart) statusChart.destroy()
  if (descriptionChart) descriptionChart.destroy()
  if (cityChart) cityChart.destroy()

  if (statusRef.value) {
    const data = aggregateByStatus.value
    statusChart = new Chart(statusRef.value, {
      type: 'doughnut',
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
        plugins: { legend: { position: 'right' } }
      }
    })
  }

  if (descriptionRef.value) {
    const data = aggregateByDescription.value.slice(0, 10)
    descriptionChart = new Chart(descriptionRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Violations',
          data: data.map(d => d.count),
          backgroundColor: chartColors.red
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

  if (cityRef.value) {
    const data = aggregateByCity.value.slice(0, 10)
    cityChart = new Chart(cityRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Violations',
          data: data.map(d => d.count),
          backgroundColor: chartColors.orange
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    })
  }
}

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `${r.violation_street || ''}, ${r.violation_city || ''}`
    const lat = parseFloat(r.latitude)
    const lon = parseFloat(r.longitude)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else {
      const addr = r.violation_street
        ? `${r.violation_street}, ${r.violation_city || 'Boston'}, ${r.violation_state || 'MA'}`
        : r.violation_city ? `${r.violation_city}, MA` : null
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
    notifyMapVisible()
    displayAllPins()
  }
})

const readUrlParams = useUrlSync(
  () => ({
    q: searchQuery.value || undefined,
    field: selectedField.value?.value !== fieldOptions[0].value ? selectedField.value?.value : undefined,
    op: selectedOperator.value !== '>' ? encodeOp(selectedOperator.value) : undefined,
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
  fetchViolations()
})

onUnmounted(() => {
  destroyMap()
})

const debouncedDisplay = debounce((lat, lon, label, address) => {
  displayLocation(lat, lon, label, address)
}, 300)

watch(selectedRecord, (newRecord) => {
  if (!newRecord) {
    displayAllPins()
    return
  }

  const lat = parseFloat(newRecord.latitude)
  const lon = parseFloat(newRecord.longitude)
  const label = `${newRecord.violation_street}, ${newRecord.violation_city}`

  if (!isNaN(lat) && !isNaN(lon)) {
    displayLocation(lat, lon, label)
  } else if (newRecord.violation_street) {
    const fullAddress = `${newRecord.violation_stno} ${newRecord.violation_street} ${newRecord.violation_suffix}, ${newRecord.violation_city}, MA`
    debouncedDisplay(null, null, label, fullAddress)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Code Enforcement Violations</h1>
      <p class="subtitle">Building and property code violations in Boston</p>
      <button @click="helpModal.openHelpModal('Code Enforcement Violations', 'https://data.boston.gov/dataset/public-works-violations', 'Records of code enforcement violations for buildings and properties in Boston, including violation type, status, and fines.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open Violations (Current Page)</div>
        <div class="stat-value">{{ openViolations }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fines (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(totalFines) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Fine (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(averageFine) }}</div>
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
        <input v-model="searchQuery" placeholder="Search by street, description..." @keyup.enter="handleSearch" />
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
          <option value=">">></option>
          <option value="<"><</option>
          <option value="LIKE">Contains</option>
        </select>
        <input v-model="filterValue" placeholder="Value..." @keyup.enter="handleSQLSearch" />
      </div>

      <div class="button-group">
        <button @click="resetFilters" class="reset-btn">Reset Filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>
    <div v-else-if="error" class="error"><p>{{ error }}</p><button @click="handleSearch" class="page-btn">Retry</button></div>

    <div v-show="!loading && !error && records.length > 0" class="content-container">
      <div class="section-header" @click="showCharts = !showCharts">
        <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
        <h2>Charts & Analytics</h2>
      </div>
      <div v-show="showCharts" class="charts-grid">
        <div v-if="!shouldHideChart('status')" class="chart-card">
          <h3>Violations by Status</h3>
          <canvas ref="statusRef"></canvas>
        </div>
        <div v-if="!shouldHideChart('description')" class="chart-card">
          <h3>Top Violation Types</h3>
          <canvas ref="descriptionRef"></canvas>
        </div>
        <div v-if="!shouldHideChart('violation_city')" class="chart-card">
          <h3>Violations by City</h3>
          <canvas ref="cityRef"></canvas>
        </div>
      </div>

      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedRecord" class="selected-info">
            Selected: {{ selectedRecord.violation_street }}, {{ selectedRecord.violation_city }}
          </p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>
        <div id="violations-map" class="map-container"></div>
      </div>

      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>Violation Records</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('case_no')" style="cursor: pointer;">Case # {{ getSortIndicator('case_no') }}</th>
                  <th @click="sortBy('description')" style="cursor: pointer;">Description {{ getSortIndicator('description') }}</th>
                  <th @click="sortBy('violation_street')" style="cursor: pointer;">Address {{ getSortIndicator('violation_street') }}</th>
                  <th @click="sortBy('violation_city')" style="cursor: pointer;">City {{ getSortIndicator('violation_city') }}</th>
                  <th @click="sortBy('value')" style="cursor: pointer;">Fine {{ getSortIndicator('value') }}</th>
                  <th @click="sortBy('status')" style="cursor: pointer;">Status {{ getSortIndicator('status') }}</th>
                  <th @click="sortBy('status_dttm')" style="cursor: pointer;">Status Date {{ getSortIndicator('status_dttm') }}</th>
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
                  <td data-label="Case #">{{ record.case_no }}</td>
                  <td data-label="Description"><span class="drilldown" @click.stop="drillDown('description', record.description)">{{ record.description }}</span></td>
                  <td data-label="Address">{{ record.violation_stno }} {{ record.violation_street }}</td>
                  <td data-label="City"><span class="drilldown" @click.stop="drillDown('violation_city', record.violation_city)">{{ record.violation_city }}</span></td>
                  <td data-label="Fine">${{ formatCurrency(parseNumericString(record.value)) }}</td>
                  <td data-label="Status" :class="{ 'open-cell': record.status === 'Open' }"><span class="drilldown" @click.stop="drillDown('status', record.status)">{{ record.status }}</span></td>
                  <td data-label="Status Date">{{ formatDate(record.status_dttm) }}</td>
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
                <option v-for="page in pageOptions" :key="page" :value="page">Page {{ page }} of {{ totalPages }}</option>
              </select>
              <button :disabled="currentPage === totalPages" @click="nextPage" class="page-btn" title="Next Page">Next ›</button>
              <button :disabled="currentPage === totalPages" @click="lastPage" class="page-btn" title="Last Page">Last »</button>
            </div>
          </div>
      </div>
    </div>

    <div v-if="!loading && !error && records.length === 0" class="empty-state"><p>No records found matching your filters.</p></div>

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
