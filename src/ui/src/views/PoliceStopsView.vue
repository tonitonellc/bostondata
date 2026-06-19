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
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('frisk-map')
const { showCharts, showMap, showTable } = useCollapsibleSections(invalidateSize)

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const totalStops = ref(0)
const vehicleStops = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const geocoding = ref(false)
const fieldOptions = [
  { label: 'Street', value: 'street' },
  { label: 'City', value: 'city' },
  { label: 'Circumstance', value: 'circumstance' },
  { label: 'Basis', value: 'basis' },
  { label: 'Contact Officer', value: 'contact_officer_name' },
  { label: 'Key Situations', value: 'key_situations' }
]

const filters = ref({ fromDate: '', toDate: '' })

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = '060526ca-ab4e-4da5-997c-1a4460bde5fd'

const { restore, clear } = usePersistedFilters('frisk', {
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
  // This dataset has street + city instead of coordinates
  // We'll use geocoding via the map utility
  if (record.street && record.street !== 'NULL') {
    const address = `${record.street}, ${record.city || 'Boston'}, ${record.state || 'MA'}`
    const label = `${record.circumstance} - ${record.street}`
    displayLocation(null, null, label, address)
  }
}

// Build the best available address string for a record.
// Priority: street (may already include cross-street, e.g. "MAIN ST & BROAD ST")
//           → city/neighborhood alone → null (skip)
const buildAddress = (r) => {
  const street = r.street && r.street !== 'NULL' ? r.street.trim() : null
  const city   = r.city   && r.city   !== 'NULL' ? r.city.trim()   : null
  const state  = r.state  || 'MA'
  if (street && city) return `${street}, ${city}, ${state}`
  if (street)         return `${street}, Boston, MA`
  if (city)           return `${city}, ${state}`
  return null
}

// Generation counter — incremented on each new data load so a stale geocoding
// run knows to abort when filters change before it finishes.
let geocodeGen = 0

const displayAllPins = async () => {
  const gen = ++geocodeGen

  // Deduplicate addresses to reduce Nominatim requests
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const seen = new Set()
  const toGeocode = []
  for (const r of recordsToDisplay) {
    const address = buildAddress(r)
    if (!address || seen.has(address)) continue
    seen.add(address)
    const street = r.street && r.street !== 'NULL' ? r.street : null
    toGeocode.push({ address, label: `${r.circumstance || 'Stop'} — ${street || r.city || 'Unknown'}` })
  }
  if (toGeocode.length === 0) return

  geocoding.value = true
  const markers = []

  for (let i = 0; i < toGeocode.length; i++) {
    if (gen !== geocodeGen) { geocoding.value = false; return } // cancelled by newer load
    const { address, label } = toGeocode[i]
    const coords = await geocodeAddress(address)
    if (coords) markers.push({ lat: coords.lat, lon: coords.lon, label })
    // Respect Nominatim's 1 req/s guideline with a small inter-request delay
    if (i < toGeocode.length - 1) await new Promise(r => setTimeout(r, 250))
  }

  if (gen !== geocodeGen) { geocoding.value = false; return }
  geocoding.value = false
  if (markers.length > 0) displayAllLocations(markers)
}

const calculateStats = () => {
  totalStops.value = records.value.length
  vehicleStops.value = records.value.filter(r => r.vehicle_year && r.vehicle_year !== 'NULL').length
}

const fetchFriskData = async () => {
  const clauses = []
  const dateClause = buildDateClause('contact_date', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['street', 'circumstance'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-frisk',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'contact_date',
    errorPrefix: 'field contact data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchFriskData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchFriskData()
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
  fetchFriskData()
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
  fetchFriskData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchFriskData)

// Chart Logic
const circumstanceRef = ref(null)
const basisRef = ref(null)
const cityRef = ref(null)
const situationsRef = ref(null)
let circumstanceChart, basisChart, cityChart, situationsChart

const aggregateByCircumstance = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['circumstance'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByBasis = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['basis'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByCity = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['city'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByKeySituations = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const situations = r['key_situations'] || ''
    // Split by comma since key_situations can be multiple values
    situations.split(',').forEach(situation => {
      const key = situation.trim() || 'None'
      if (key !== 'None' && key !== '') {
        map.set(key, (map.get(key) || 0) + 1)
      }
    })
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (circumstanceChart) circumstanceChart.destroy()
  if (basisChart) basisChart.destroy()
  if (cityChart) cityChart.destroy()
  if (situationsChart) situationsChart.destroy()

  // Circumstance Pie
  if (circumstanceRef.value) {
    const data = aggregateByCircumstance.value
    circumstanceChart = new Chart(circumstanceRef.value, {
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

  // Basis Bar
  if (basisRef.value) {
    const data = aggregateByBasis.value
    basisChart = new Chart(basisRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Contacts',
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

  // City Bar
  if (cityRef.value) {
    const data = aggregateByCity.value.slice(0, 10)
    cityChart = new Chart(cityRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Contacts',
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

  // Key Situations Bar
  if (situationsRef.value) {
    const data = aggregateByKeySituations.value.slice(0, 10)
    situationsChart = new Chart(situationsRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Occurrences',
          data: data.map(d => d.count),
          backgroundColor: chartColors.blue
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
  fetchFriskData()
})

onUnmounted(() => {
  destroyMap()
})

watch(selectedRecord, (newRecord) => {
  if (newRecord && newRecord.street && newRecord.street !== 'NULL') {
    const address = `${newRecord.street}, ${newRecord.city || 'Boston'}, ${newRecord.state || 'MA'}`
    const label = `${newRecord.circumstance} - ${newRecord.street}`
    displayLocation(null, null, label, address)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Police Field Contact Reports</h1>
      <p class="subtitle">Boston Police Department field contact and stop data from 2024.</p>
      <button @click="helpModal.openHelpModal('Police Field Contact Reports', 'https://data.boston.gov/dataset/boston-police-department-fio', 'Records of police field contacts and stops, including circumstances, basis, and vehicle information.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Stops (Current Page)</div>
        <div class="stat-value">{{ totalStops }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Vehicle Stops (Current Page)</div>
        <div class="stat-value">{{ vehicleStops }}</div>
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
          <p v-if="selectedRecord" class="selected-info">Selected: {{ selectedRecord.street || 'Unknown' }}</p>
          <p v-else-if="geocoding" class="instruction-text">Geocoding locations…</p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>
        <div id="frisk-map" class="map-container"></div>
      </div>

        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>By Circumstance</h3>
              <canvas ref="circumstanceRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>By Legal Basis</h3>
              <canvas ref="basisRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>By City</h3>
              <canvas ref="cityRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Key Situations</h3>
              <canvas ref="situationsRef"></canvas>
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
                  <th @click="sortBy('fc_num')" style="cursor: pointer;">FC # {{ getSortIndicator('fc_num') }}</th>
                  <th @click="sortBy('contact_date')" style="cursor: pointer;">Date {{ getSortIndicator('contact_date') }}</th>
                  <th @click="sortBy('street')" style="cursor: pointer;">Street {{ getSortIndicator('street') }}</th>
                  <th @click="sortBy('circumstance')" style="cursor: pointer;">Circumstance {{ getSortIndicator('circumstance') }}</th>
                  <th @click="sortBy('basis')" style="cursor: pointer;">Basis {{ getSortIndicator('basis') }}</th>
                  <th @click="sortBy('contact_officer_name')" style="cursor: pointer;">Officer {{ getSortIndicator('contact_officer_name') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in sortedRecords" :key="record._id" @click="selectRecord(record)" :class="{ 'selected-row': selectedRecord?._id === record._id }" class="clickable-row">
                  <td data-label="FC #">{{ record.fc_num }}</td>
                  <td data-label="Date">{{ formatDate(record.contact_date) }}</td>
                  <td data-label="Street"><span class="drilldown" @click.stop="drillDown('street', record.street !== 'NULL' ? record.street : 'N/A')">{{ record.street !== 'NULL' ? record.street : 'N/A' }}</span></td>
                  <td data-label="Circumstance"><span class="drilldown" @click.stop="drillDown('circumstance', record.circumstance)">{{ record.circumstance }}</span></td>
                  <td data-label="Basis"><span class="drilldown" @click.stop="drillDown('basis', record.basis)">{{ record.basis }}</span></td>
                  <td data-label="Officer"><span class="drilldown" @click.stop="drillDown('contact_officer_name', record.contact_officer_name)">{{ record.contact_officer_name }}</span></td>
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
