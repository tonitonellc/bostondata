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
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('permits-map')
const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const totalValuation = ref(0)
const averageFees = ref(0)
const openPermits = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const filters = ref({
  fromDate: '',
  toDate: '',
})

// Mapping for Work Type acronyms to full descriptions
const workTypeMap = {
  'INTREN': 'Interior Renovation',
  'EXTREN': 'Exterior Renovation',
  'INTEXT': 'Interior/Exterior Work',
  'OTHER': 'Other',
  'COB': 'City of Boston'
}

const fieldOptions = [
  { label: 'Declared Valuation', value: 'declared_valuation', type: 'money', needsCurrencyCleaning: true },
  { label: 'Total Fees', value: 'total_fees', type: 'money', needsCurrencyCleaning: true },
  { label: 'Work Type', value: 'worktype' },
  { label: 'Status', value: 'status' },
  { label: 'Applicant', value: 'applicant' },
  { label: 'Address', value: 'address' },
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('>')
const filterValue = ref('')

const resourceId = '6ddcd912-32a0-43df-9908-63574f8c7e77'

const { restore, clear } = usePersistedFilters('permits', {
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

const selectRecord = (record) => {
  selectedRecord.value = record
}

const calculateStats = () => {
  const totals = records.value.reduce((acc, r) => {
    acc.valuation += parseNumericString(r.declared_valuation)
    acc.fees += parseNumericString(r.total_fees)
    if (r.status === 'Open') acc.open += 1
    return acc
  }, { valuation: 0, fees: 0, open: 0 })

  totalValuation.value = totals.valuation
  averageFees.value = records.value.length > 0 ? totals.fees / records.value.length : 0
  openPermits.value = totals.open
}

const fetchPermits = async () => {
  const clauses = []
  const dateClause = buildDateClause('issued_date', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const operator = selectedOperator.value
    const fieldValue = selectedField.value.value

    if (selectedField.value.type === 'money' && ['>', '<', '!=', '>=', '<='].includes(operator)) {
      const clause = buildNumericClause(fieldValue, operator, filterValue.value, {
        needsCurrencyCleaning: selectedField.value.needsCurrencyCleaning ?? false,
        needsCommaCleaning:    selectedField.value.needsCommaCleaning ?? false,
        isNativeNumeric:       selectedField.value.isNativeNumeric ?? false,
      })
      if (clause) clauses.push(clause)
    } else {
      const clause = buildTextClause(fieldValue, operator, filterValue.value)
      if (clause) clauses.push(clause)
    }
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['address', 'applicant'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-permits',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'issued_date',
    errorPrefix: 'building permits',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchPermits() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchPermits()
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
  fetchPermits()
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
  fetchPermits()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchPermits)

// Chart Logic
const workTypeRef = ref(null)
const statusRef = ref(null)
const cityRef = ref(null)
let workTypeChart, statusChart, cityChart

const aggregateByWorkType = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.description || r.worktype || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
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

const aggregateByCity = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r.city || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (workTypeChart) workTypeChart.destroy()
  if (statusChart) statusChart.destroy()
  if (cityChart) cityChart.destroy()

  if (workTypeRef.value) {
    const data = aggregateByWorkType.value.slice(0, 10)
    workTypeChart = new Chart(workTypeRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Permits',
          data: data.map(d => d.count),
          backgroundColor: chartColors.primary
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    })
  }

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

  if (cityRef.value) {
    const data = aggregateByCity.value.slice(0, 10)
    cityChart = new Chart(cityRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Permits',
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
}

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `${r.address || ''}, ${r.city || ''}`
    const lat = parseFloat(r.y_latitude)
    const lon = parseFloat(r.x_longitude)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else if (r.address) {
      const addr = `${r.address}, ${r.city || 'Boston'}, ${r.state || 'MA'}`
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
  fetchPermits()
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

  const lat = parseFloat(newRecord.y_latitude)
  const lon = parseFloat(newRecord.x_longitude)
  const label = `${newRecord.address}, ${newRecord.city}`

  if (!isNaN(lat) && !isNaN(lon)) {
    displayLocation(lat, lon, label)
  } else if (newRecord.address) {
    const fullAddress = `${newRecord.address}, ${newRecord.city}, MA`
    debouncedDisplay(null, null, label, fullAddress)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Approved Building Permits</h1>
      <p class="subtitle">Building permits issued by the City of Boston</p>
      <button @click="helpModal.openHelpModal('Approved Building Permits', 'https://data.boston.gov/dataset/approved-building-permits', 'Records of building permits approved by the City of Boston, including work type, valuation, and location.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open Permits (Current Page)</div>
        <div class="stat-value">{{ openPermits }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Declared Valuation (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(totalValuation) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Fees (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(averageFees) }}</div>
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
        <input v-model="searchQuery" placeholder="Search by address, applicant..." @keyup.enter="handleSearch" />
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
        <div class="chart-card">
          <h3>Permits by Work Type</h3>
          <canvas ref="workTypeRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Permits by Status</h3>
          <canvas ref="statusRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Permits by City</h3>
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
            Selected: {{ selectedRecord.address }}, {{ selectedRecord.city }}
          </p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>
        <div id="permits-map" class="map-container"></div>
      </div>

      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>Permit Records</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('permitnumber')" style="cursor: pointer;">
                    Permit # {{ getSortIndicator('permitnumber') }}
                  </th>
                  <th @click="sortBy('description')" style="cursor: pointer;">
                    Work Type {{ getSortIndicator('description') }}
                  </th>
                  <th @click="sortBy('address')" style="cursor: pointer;">
                    Address {{ getSortIndicator('address') }}
                  </th>
                  <th @click="sortBy('applicant')" style="cursor: pointer;">
                    Applicant {{ getSortIndicator('applicant') }}
                  </th>
                  <th @click="sortBy('declared_valuation')" style="cursor: pointer;">
                    Valuation {{ getSortIndicator('declared_valuation') }}
                  </th>
                  <th @click="sortBy('status')" style="cursor: pointer;">
                    Status {{ getSortIndicator('status') }}
                  </th>
                  <th @click="sortBy('issued_date')" style="cursor: pointer;">
                    Issued {{ getSortIndicator('issued_date') }}
                  </th>
                  <th>Details</th>
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
                  <td data-label="Permit #">{{ record.permitnumber }}</td>
                  <td data-label="Work Type"><span class="drilldown" @click.stop="drillDown('worktype', record.description || record.worktype)">{{ record.description || record.worktype }}</span></td>
                  <td data-label="Address">{{ record.address }}</td>
                  <td data-label="Applicant">{{ record.applicant }}</td>
                  <td data-label="Valuation">${{ formatCurrency(parseNumericString(record.declared_valuation)) }}</td>
                  <td data-label="Status"><span class="drilldown" @click.stop="drillDown('status', record.status)">{{ record.status }}</span></td>
                  <td data-label="Issued">{{ formatDate(record.issued_date) }}</td>
                  <td data-label="Details">{{ record.comments || '' }}</td>
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
