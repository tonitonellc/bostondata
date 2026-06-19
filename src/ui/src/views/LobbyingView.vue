<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { fetchData } from '../utils/fetchData'
import { formatNumber } from '../utils/format'
import { buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()
const helpModal = useHelpModal()
const { showCharts, showMap, showTable } = useCollapsibleSections()

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const uniqueClients = ref(0)
const yearsRepresented = ref(0)
const limit = ref(25)
const offset = ref(0)
const resourceId = '8d7f0cf4-4d20-4ed6-b6d0-bd6158d84ae9'

const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'Year', value: 'Year' },
  { label: 'Client Name', value: 'Full Name' },
  { label: 'Lobbyist Name', value: 'Lobbyist/Client Name' },
  { label: 'Quarter', value: 'Quarter' },
  { label: 'Type', value: 'Type' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const { restore, clear } = usePersistedFilters('lobbying', {
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

const calculateStats = () => {
  uniqueClients.value = new Set(records.value.map(r => r['Full Name'])).size
  yearsRepresented.value = new Set(records.value.map(r => r.Year)).size
}

const fetchLobbyData = async () => {
  const clauses = []

  if (filters.value.fromDate) {
    const fromYear = filters.value.fromDate.substring(0, 4)
    clauses.push(`"Year" >= '${fromYear}'`)
  }
  if (filters.value.toDate) {
    const toYear = filters.value.toDate.substring(0, 4)
    clauses.push(`"Year" <= '${toYear}'`)
  }

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['Full Name', 'Lobbyist/Client Name'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-data',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    errorPrefix: 'lobbying data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchLobbyData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  readUrlParams(p => {
    if (p.q) searchQuery.value = p.q
    if (p.field) selectedField.value = fieldOptions.find(f => f.value === p.field) ?? fieldOptions[0]
    if (p.op) selectedOperator.value = decodeOp(p.op)
    if (p.val) filterValue.value = p.val
    if (p.from) filters.value.fromDate = p.from
    if (p.to) filters.value.toDate = p.to
    if (p.limit) limit.value = Number(p.limit)
  })
  fetchLobbyData()
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
  fetchLobbyData()
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
  fetchLobbyData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchLobbyData)

// Chart Logic
const yearRef = ref(null)
const quarterRef = ref(null)
const typeRef = ref(null)
const clientRef = ref(null)
let yearChart, quarterChart, typeChart, clientChart

const aggregateByYear = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Year'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const aggregateByQuarter = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Quarter'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByType = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Type'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByClient = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Full Name'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (yearChart) yearChart.destroy()
  if (quarterChart) quarterChart.destroy()
  if (typeChart) typeChart.destroy()
  if (clientChart) clientChart.destroy()

  // Year Line
  if (yearRef.value && aggregateByYear.value.length > 0) {
    const data = aggregateByYear.value
    yearChart = new Chart(yearRef.value, {
      type: 'line',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Registrations by Year',
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

  // Quarter Pie
  if (quarterRef.value) {
    const data = aggregateByQuarter.value
    quarterChart = new Chart(quarterRef.value, {
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
          label: 'Registrations',
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

  // Top Clients Bar
  if (clientRef.value) {
    const data = aggregateByClient.value.slice(0, 10)
    clientChart = new Chart(clientRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Activities',
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

watch([records, loading], () => {
  renderCharts()
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
  fetchLobbyData()
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Lobbying Records</h1>
      <p class="subtitle">Public lobbyist registrations from the City of Boston</p>
      <button @click="helpModal.openHelpModal('Lobbying Records', 'https://data.boston.gov/dataset/municipal-lobbying', 'Registered lobbyist and lobbying client information, including lobbying activities, contributions, and registrations in Boston.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unique Clients (Current Page)</div>
        <div class="stat-value">{{ uniqueClients }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Years Represented (Current Page)</div>
        <div class="stat-value">{{ yearsRepresented }}</div>
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
        <input 
          type="text" 
          v-model="searchQuery" 
          @keyup.enter="handleSearch" 
          placeholder="Search names, clients..."
        >
      </div>

      <div class="filter-group">
        <label for="from-date">From Date:</label>
        <input 
          id="from-date" 
          type="date" 
          v-model="filters.fromDate"
        @change="handleSQLSearch" />
      </div>

      <div class="filter-group">
        <label for="to-date">To Date:</label>
        <input 
          id="to-date" 
          type="date" 
          v-model="filters.toDate"
        @change="handleSQLSearch" />
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
            <option value="LIKE">Contains (LIKE)</option>
          </select>
          <input 
            type="text" 
            v-model="filterValue" 
            placeholder="Value..."
            @keyup.enter="handleSQLSearch"
          >
        </div>
      </div>

      <div class="button-group">
        <button @click="resetFilters" class="reset-btn">Reset Filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="handleSearch" class="page-btn">Retry</button>
    </div>

    <div v-else-if="records.length > 0" class="content-container">
        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>Registrations by Year</h3>
              <canvas ref="yearRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>By Quarter</h3>
              <canvas ref="quarterRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>By Type</h3>
              <canvas ref="typeRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Top Clients</h3>
              <canvas ref="clientRef"></canvas>
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
                  <th @click="sortBy('Full Name')" style="cursor: pointer;">Client {{ getSortIndicator('Full Name') }}</th>
                  <th @click="sortBy('Lobbyist/Client Name')" style="cursor: pointer;">Lobbyist {{ getSortIndicator('Lobbyist/Client Name') }}</th>
                  <th @click="sortBy('Year')" style="cursor: pointer;">Year {{ getSortIndicator('Year') }}</th>
                  <th @click="sortBy('Quarter')" style="cursor: pointer;">Quarter {{ getSortIndicator('Quarter') }}</th>
                  <th @click="sortBy('Type')" style="cursor: pointer;">Type {{ getSortIndicator('Type') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in sortedRecords" :key="record._id">
                  <td data-label="Client"><span class="drilldown" @click.stop="drillDown('Full Name', record['Full Name'])">{{ record['Full Name'] }}</span></td>
                  <td data-label="Lobbyist"><span class="drilldown" @click.stop="drillDown('Lobbyist/Client Name', record['Lobbyist/Client Name'])">{{ record['Lobbyist/Client Name'] }}</span></td>
                  <td data-label="Year"><span class="drilldown" @click.stop="drillDown('Year', record.Year)">{{ record.Year }}</span></td>
                  <td data-label="Quarter"><span class="drilldown" @click.stop="drillDown('Quarter', record.Quarter)">{{ record.Quarter }}</span></td>
                  <td data-label="Type"><span class="drilldown" @click.stop="drillDown('Type', record.Type)">{{ record.Type }}</span></td>
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

    <div v-else class="empty-state">
      <p>No records found matching your filters.</p>
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
