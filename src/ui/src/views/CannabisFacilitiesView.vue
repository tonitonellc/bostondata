<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { chartColors, getColor } from '../utils/chartUtils'
import { useCollapsibleSections, useDrillDown, usePersistedFilters , useUrlSync} from '../composables/composables'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'
import { fetchData } from '../utils/fetchData'
import { formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildSearchClause, buildTextClause } from '../utils/queryBuilder'

const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('cannabis-map')
const { showCharts, showMap, showTable } = useCollapsibleSections(invalidateSize)

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const approvedCount = ref(0)
const equityCount = ref(0)
const offset = ref(0)
const limit = ref(25)
const selectedRecord = ref(null)
const sortField = ref('')
const sortDirection = ref('asc')
const showHelpModal = ref(false)
const helpModalContent = ref({ title: '', description: '', link: '' })

// Filters (Date is less relevant for registry, focusing on Status/Category)
const fieldOptions = [
  { label: 'Business Name', value: 'app_business_name' },
  { label: 'License Status', value: 'app_license_status' },
  { label: 'License Category', value: 'app_license_category' },
  { label: 'Zip Code', value: 'facility_zip_code' },
  { label: 'Equity Program', value: 'equity_program_designation' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')
const filters = ref({
  fromDate: '',
  toDate: '',
})

// Resource ID from boston_ckan.go
const resourceId = '5de268d6-e3a5-4f5c-b43a-0d293b377b50'

const { restore, clear } = usePersistedFilters('cannabis', {
  searchQuery, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

const sortedRecords = computed(() => {
  if (!sortField.value) return records.value
  return records.value.sort((a, b) => {
    let valA = a[sortField.value] || ''
    let valB = b[sortField.value] || ''
    
    // numeric sort for zip
    if (sortField.value === 'facility_zip_code') {
        valA = parseInt(valA) || 0
        valB = parseInt(valB) || 0
    }

    if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1
    if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1
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

const selectRecord = (record) => {
  selectedRecord.value = record
  if (record && record.latitude && record.longitude) {
    const lat = parseFloat(record.latitude)
    const lon = parseFloat(record.longitude)
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const label = `<b>${record.app_business_name}</b><br>${record.app_license_status}`
      displayLocation(lat, lon, label)
    }
  }
}

const openHelpModal = (title, link, description) => {
  helpModalContent.value = { title, link, description }
  showHelpModal.value = true
}

const closeHelpModal = () => {
  showHelpModal.value = false
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

const calculateStats = () => {
  // Count 'Approved' or 'License Issued' statuses - adjusting based on actual data values
  // Common values: "Approved", "License Issued", "Active"
  approvedCount.value = records.value.filter(r => 
    (r.app_license_status && r.app_license_status.toLowerCase().includes('approved')) ||
    (r.app_license_status && r.app_license_status.toLowerCase().includes('issued'))
  ).length

  // Count Equity Applicants
  equityCount.value = records.value.filter(r => 
    r.equity_program_designation && 
    r.equity_program_designation !== 'No' && 
    r.equity_program_designation !== 'N/A' &&
    r.equity_program_designation !== ''
  ).length
}

const fetchCannabisData = async () => {
  const clauses = []

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['app_business_name'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-cannabis',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    errorPrefix: 'cannabis registry data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchCannabisData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchCannabisData()
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
  fetchCannabisData()
}

const resetFilters = () => {
  clear()
  searchQuery.value = ''
  filterValue.value = ''
  selectedField.value = fieldOptions[0]
  selectedOperator.value = '='
  limit.value = 25
  offset.value = 0
  setHashParams({})
  fetchCannabisData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchCannabisData)

// Chart Logic

const statusChartRef = ref(null)
const zipChartRef = ref(null)
const equityChartRef = ref(null)
let statusChart, zipChart, equityChart

const aggregateByStatus = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['app_license_status'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByZip = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['facility_zip_code'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByEquity = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    let key = r['equity_program_designation'] || 'None'
    if (key === 'No' || key === 'N/A') key = 'None'
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
  if (zipChart) zipChart.destroy()
  if (equityChart) equityChart.destroy()

  // Status Bar Chart
  if (statusChartRef.value) {
    const data = aggregateByStatus.value
    statusChart = new Chart(statusChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Applications',
          data: data.map(d => d.count),
          backgroundColor: chartColors.green
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    })
  }

  // Zip Code Bar Chart
  if (zipChartRef.value) {
    const data = aggregateByZip.value.slice(0, 15) // Top 15 zips
    zipChart = new Chart(zipChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Facilities',
          data: data.map(d => d.count),
          backgroundColor: chartColors.blue
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    })
  }

  // Equity Pie Chart
  if (equityChartRef.value) {
    const data = aggregateByEquity.value
    equityChart = new Chart(equityChartRef.value, {
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
}

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `<b>${r.app_business_name || ''}</b><br>${r.app_license_status || ''}`
    const lat = parseFloat(r.latitude)
    const lon = parseFloat(r.longitude)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else if (r.facility_address) {
      const addr = `${r.facility_address}, Boston, MA ${r.facility_zip_code || ''}`.trim()
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
    displayAllPins()
  }
})

const readUrlParams = useUrlSync(
  () => ({
    q: searchQuery.value || undefined,
    field: selectedField.value?.value !== fieldOptions[0].value ? selectedField.value?.value : undefined,
    op: selectedOperator.value !== '=' ? encodeOp(selectedOperator.value) : undefined,
    val: filterValue.value || undefined,
    limit: limit.value !== 25 ? String(limit.value) : undefined,
  }),
  [searchQuery, selectedField, selectedOperator, filterValue, limit]
)

onMounted(() => {
  restore()
  initializeMap()
  readUrlParams(p => {
    if (p.q) searchQuery.value = p.q
    if (p.field) selectedField.value = fieldOptions.find(f => f.value === p.field) ?? fieldOptions[0]
    if (p.op) selectedOperator.value = decodeOp(p.op)
    if (p.val) filterValue.value = p.val
    if (p.limit) limit.value = Number(p.limit)
  })
  fetchCannabisData()
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
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
      const label = `<b>${newRecord.app_business_name}</b><br>${newRecord.app_license_status}`
      displayLocation(lat, lon, label)
    }
  }
})

</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Cannabis Registry</h1>
      <p class="subtitle">Registry of cannabis establishments and applications in Boston</p>
      <button @click="openHelpModal('Cannabis Registry', 'https://data.boston.gov/dataset/cannabis-registry', 'This dataset contains the registry of cannabis establishments in the City of Boston, including application status, license types, and equity program participation.')" class="help-btn" title="View dataset info">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Approved/Issued</div>
        <div class="stat-value">{{ formatNumber(approvedCount) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Equity Applicants</div>
        <div class="stat-value">{{ formatNumber(equityCount) }}</div>
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
        <input v-model="searchQuery" placeholder="Search business name..." @keyup.enter="handleSearch" />
      </div>

      <div class="filter-group">
        <label>Advanced Filter:</label>
        <select v-model="selectedField">
          <option v-for="field in fieldOptions" :key="field.value" :value="field">{{ field.label }}</option>
        </select>
        <select v-model="selectedOperator">
          <option value="=">=</option>
          <option value="!=">!=</option>
          <option value="LIKE">Contains</option>
        </select>
        <input v-model="filterValue" placeholder="Filter value..." @keyup.enter="handleSQLSearch" />
      </div>

      <div class="button-group"><button @click="resetFilters" class="reset-btn">Reset Filters</button></div>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading data...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="records.length > 0" class="content-container">

      <div class="section-header" @click="showCharts = !showCharts">
        <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
        <h2>Charts & Analysis</h2>
      </div>
      <div v-show="showCharts" class="charts-grid">
        <div class="chart-card">
          <h3>Application Status</h3>
          <canvas ref="statusChartRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Facilities by Zip Code</h3>
          <canvas ref="zipChartRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Equity Program Designation</h3>
          <canvas ref="equityChartRef"></canvas>
        </div>
      </div>

      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedRecord" class="selected-info">
            Selected: {{ selectedRecord.app_business_name }} ({{ selectedRecord.app_license_status }})
          </p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>
        <div id="cannabis-map" class="map-container"></div>
      </div>

      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>Records Table</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="sortBy('app_business_name')" style="cursor: pointer;">
                  Business Name {{ getSortIndicator('app_business_name') }}
                </th>
                <th @click="sortBy('app_license_category')" style="cursor: pointer;">
                  License Category {{ getSortIndicator('app_license_category') }}
                </th>
                <th @click="sortBy('app_license_status')" style="cursor: pointer;">
                  Status {{ getSortIndicator('app_license_status') }}
                </th>
                <th @click="sortBy('facility_zip_code')" style="cursor: pointer;">
                  Zip Code {{ getSortIndicator('facility_zip_code') }}
                </th>
                <th @click="sortBy('equity_program_designation')" style="cursor: pointer;">
                  Equity Program {{ getSortIndicator('equity_program_designation') }}
                </th>
                <th @click="sortBy('facility_address')" style="cursor: pointer;">
                  Address {{ getSortIndicator('facility_address') }}
                </th>
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
                <td data-label="Business Name"><span class="drilldown" @click.stop="drillDown('app_business_name', record.app_business_name)">{{ record.app_business_name }}</span></td>
                <td data-label="License Category"><span class="drilldown" @click.stop="drillDown('app_license_category', record.app_license_category)">{{ record.app_license_category }}</span></td>
                <td data-label="Status" :class="{'status-approved': record.app_license_status.includes('Approved')}"><span class="drilldown" @click.stop="drillDown('app_license_status', record.app_license_status)">{{ record.app_license_status }}</span></td>
                <td data-label="Zip Code">{{ record.facility_zip_code }}</td>
                <td data-label="Equity Program">{{ record.equity_program_designation }}</td>
                <td data-label="Address">{{ record.facility_address }}</td>
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
    
    <div v-else-if="!loading && !error && records.length === 0" class="empty-state">
      <p>No records found matching your filters.</p>
    </div>

    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ helpModalContent.title }}</h2>
          <button @click="closeHelpModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ helpModalContent.description }}</p>
          <a :href="helpModalContent.link" target="_blank" class="dataset-link">View Dataset on Boston Data Portal →</a>
        </div>
      </div>
    </div>
  </div>
</template>
