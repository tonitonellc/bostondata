<!--
Copyright (c) 2026 Toni Tone, LLC
-->
<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, usePersistedFilters, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { debounce } from '../utils/debounce'
import { fetchData } from '../utils/fetchData'
import { formatDate, formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('crime-map')
// These are already reactive refs provided by the composable
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const uniqueDistricts = ref(0)
const shootingIncidents = ref(0)
const offset = ref(0)
const limit = ref(25)
const selectedRecord = ref(null)
const sortField = ref('')
const sortDirection = ref('asc')
const showHelpModal = ref(false)
const helpModalContent = ref({ title: '', description: '', link: '' })

const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'District', value: 'DISTRICT' },
  { label: 'Offense', value: 'OFFENSE_DESCRIPTION' },
  { label: 'Street', value: 'STREET' },
  { label: 'Shooting (Y/N)', value: 'SHOOTING' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = 'b973d8cb-eeb2-4e7e-99da-c92938efc9c0'

const { restore, clear } = usePersistedFilters('crime', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

const sortedRecords = computed(() => {
  if (!sortField.value) return records.value
  return [...records.value].sort((a, b) => {
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

const selectRecord = (record) => {
  selectedRecord.value = record
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

const calculateCrimeStats = () => {
  uniqueDistricts.value = new Set(records.value.map(r => r.DISTRICT)).size
  shootingIncidents.value = records.value.filter(r => r.SHOOTING === '1' || r.SHOOTING === 'Y').length
}

const fetchCrimeData = async () => {
  const clauses = []
  const dateClause = buildDateClause('OCCURRED_ON_DATE', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['STREET', 'OFFENSE_DESCRIPTION'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-crime',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'OCCURRED_ON_DATE',
    errorPrefix: 'crime data',
    onSuccess: calculateCrimeStats
  })
}

const handleSearch = () => { offset.value = 0; fetchCrimeData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchCrimeData()
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
  fetchCrimeData()
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
  fetchCrimeData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchCrimeData)

// Chart Logic
const offenseChartRef = ref(null)
const districtChartRef = ref(null)
const streetChartRef = ref(null)
let offenseChart, districtChart, streetChart

const aggregateByOffense = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['OFFENSE_DESCRIPTION'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByDistrict = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['DISTRICT'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByStreet = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['STREET'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (offenseChart) offenseChart.destroy()
  if (districtChart) districtChart.destroy()
  if (streetChart) streetChart.destroy()

  if (offenseChartRef.value) {
    const data = aggregateByOffense.value.slice(0, 10)
    offenseChart = new Chart(offenseChartRef.value, {
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

  if (districtChartRef.value) {
    const data = aggregateByDistrict.value
    districtChart = new Chart(districtChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Incidents',
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

  if (streetChartRef.value) {
    const data = aggregateByStreet.value.slice(0, 10)
    streetChart = new Chart(streetChartRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Incidents',
          data: data.map(d => d.count),
          backgroundColor: chartColors.purple
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

const displayAllPins = async () => {
  const recordsToDisplay = records.value.length > 200 ? records.value.slice(0, 100) : records.value
  const direct = []
  const fallback = new Map()
  for (const r of recordsToDisplay) {
    const label = `${r.STREET || ''}, ${r.DISTRICT || ''}`
    const lat = parseFloat(r.Lat)
    const lon = parseFloat(r.Long)
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else if (r.STREET) {
      const addr = `${r.STREET}, Boston, MA`
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
  fetchCrimeData()
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
  const lat = parseFloat(newRecord.Lat)
  const lon = parseFloat(newRecord.Long)
  const label = `${newRecord.STREET}, ${newRecord.DISTRICT}`

  if (!isNaN(lat) && !isNaN(lon)) {
    displayLocation(lat, lon, label)
  } else if (newRecord.STREET) {
    const fullAddress = `${newRecord.STREET}, Boston, MA`
    debouncedDisplay(null, null, label, fullAddress)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Crime Incident Reports</h1>
      <p class="subtitle">BPD incident data from 2023 to present</p>
      <button @click="openHelpModal('Crime Incident Reports', 'https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system', 'Detailed records of crime incidents reported to the Boston Police Department, including location, offense type, and date.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Districts (Current Page)</div>
        <div class="stat-value">{{ uniqueDistricts }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Shooting Incidents (Current Page)</div>
        <div class="stat-value">{{ shootingIncidents }}</div>
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
        <input v-model="searchQuery" placeholder="Search by street, offense..." @keyup.enter="handleSearch" />
        
      </div>

      <div class="filter-group">
        <label>Advanced Filter:</label>
        <select v-model="selectedField">
          <option v-for="field in fieldOptions" :key="field.value" :value="field">{{ field.label }}</option>
        </select>
        <select v-model="selectedOperator">
          <option value="=">=</option>
          <option value="!=">!=</option>
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

    <div v-show="!loading && !error && records.length > 0" class="content-container">
        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>Top Offenses</h3>
              <canvas ref="offenseChartRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Incidents by District</h3>
              <canvas ref="districtChartRef"></canvas>
            </div>
             <div class="chart-card">
              <h3>Top Streets</h3>
              <canvas ref="streetChartRef"></canvas>
            </div>
          </div>
          
          <div class="map-header">
            <div class="section-header" @click="showMap = !showMap">
              <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
              <h2>Location Map</h2>
            </div>
            <p v-if="showMap && selectedRecord" class="selected-info">
              Selected: {{ selectedRecord.STREET }}, {{ selectedRecord.DISTRICT }}
            </p>
            <p v-if="showMap && !selectedRecord" class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
            <div v-show="showMap" id="crime-map" class="map-container"></div>
          </div>

          <div class="section-header" @click="showTable = !showTable">
            <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
            <h2>Crime Records</h2>
          </div>
          <div v-show="showTable" class="table-section-inner">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('INCIDENT_NUMBER')" style="cursor: pointer;">
                    Incident # {{ getSortIndicator('INCIDENT_NUMBER') }}
                  </th>
                  <th @click="sortBy('OFFENSE_DESCRIPTION')" style="cursor: pointer;">
                    Offense {{ getSortIndicator('OFFENSE_DESCRIPTION') }}
                  </th>
                  <th @click="sortBy('DISTRICT')" style="cursor: pointer;">
                    District {{ getSortIndicator('DISTRICT') }}
                  </th>
                  <th @click="sortBy('STREET')" style="cursor: pointer;">
                    Street {{ getSortIndicator('STREET') }}
                  </th>
                  <th @click="sortBy('OCCURRED_ON_DATE')" style="cursor: pointer;">
                    Date {{ getSortIndicator('OCCURRED_ON_DATE') }}
                  </th>
                  <th @click="sortBy('SHOOTING')" style="cursor: pointer;">
                    Shooting {{ getSortIndicator('SHOOTING') }}
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
                  <td data-label="Incident #">{{ record.INCIDENT_NUMBER }}</td>
                  <td data-label="Offense"><span class="drilldown" @click.stop="drillDown('OFFENSE_DESCRIPTION', record.OFFENSE_DESCRIPTION)">{{ record.OFFENSE_DESCRIPTION }}</span></td>
                  <td data-label="District"><span class="drilldown" @click.stop="drillDown('DISTRICT', record.DISTRICT)">{{ record.DISTRICT }}</span></td>
                  <td data-label="Street"><span class="drilldown" @click.stop="drillDown('STREET', record.STREET)">{{ record.STREET }}</span></td>
                  <td data-label="Date">{{ formatDate(record.OCCURRED_ON_DATE) }}</td>
                  <td data-label="Shooting">{{ record.SHOOTING === '1' || record.SHOOTING === 'Y' ? 'Yes' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
            
            <div class="pagination" v-if="totalRecords > 0">
              <button :disabled="currentPage === 1" @click="firstPage" class="page-btn">« First</button>
              <button :disabled="currentPage === 1" @click="previousPage" class="page-btn">‹ Previous</button>
              <span class="pagination-info">
                Showing {{ formatNumber(startRecord) }} - {{ formatNumber(endRecord) }} of {{ formatNumber(totalRecords) }}
              </span>
              <select :value="currentPage" @change="onPageSelect" class="page-select">
                <option v-for="page in pageOptions" :key="page" :value="page">Page {{ page }} of {{ totalPages }}</option>
              </select>
              <button :disabled="currentPage === totalPages" @click="nextPage" class="page-btn">Next ›</button>
              <button :disabled="currentPage === totalPages" @click="lastPage" class="page-btn">Last »</button>
            </div>
          </div>
      </div>
    </div>

    <div v-if="!loading && !error && records.length === 0" class="empty-state">
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
