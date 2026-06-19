<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useMostRecentDate, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { fetchData } from '../utils/fetchData'
import { formatCurrency, formatDate, formatNumber, parseNumericString } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const { initializeMap, displayLocation, destroyMap, invalidateSize } = useMapDisplay('fire-map')
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)
const { getMostRecentDate } = useMostRecentDate()
const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const totalDatasetRecords = ref(0)
const incidentsWithLoss = ref(0)
const totalLossAverage = ref(0)
const offset = ref(0)
const limit = ref(25)
const selectedRecord = ref(null)
const showHelpModal = ref(false)
const helpModalContent = ref({ title: '', description: '', link: '' })

const filters = ref({
  fromDate: '',
  toDate: ''
})

const fieldOptions = [
  { label: 'Neighborhood', value: 'neighborhood' },
  { label: 'Description', value: 'incident_description' },
  { label: 'Type', value: 'incident_type' },
  { label: 'Street', value: 'street_name' },
  { label: 'Property Loss', value: 'estimated_property_loss' },
  { label: 'Content Loss', value: 'estimated_content_loss' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = '91a38b1f-8439-46df-ba47-a30c48845e06'

const { restore, clear } = usePersistedFilters('fire', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions
})

// Most recent record date
const mostRecentDate = computed(() => {
  const date = getMostRecentDate(records.value, 'alarm_date')
  return date ? formatDate(date) : 'N/A'
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

const calculateFireStats = () => {
  let lossCount = 0
  let totalLoss = 0
  
  records.value.forEach(r => {
    const propertyLoss = parseNumericString(r.estimated_property_loss)
    const contentLoss = parseNumericString(r.estimated_content_loss)
    const totalLossRecord = propertyLoss + contentLoss
    
    if (totalLossRecord > 0) {
      lossCount++
      totalLoss += totalLossRecord
    }
  })
  
  incidentsWithLoss.value = lossCount
  totalLossAverage.value = lossCount > 0 ? totalLoss / lossCount : 0
}

const fetchFireData = async () => {
  const clauses = []
  const dateClause = buildDateClause('alarm_date', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['neighborhood', 'incident_description'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-fire',
    records,
    loading,
    error,
    totalRecords,
    totalDatasetRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'alarm_date',
    errorPrefix: 'fire data',
    onSuccess: calculateFireStats
  })
}

const handleSearch = () => { offset.value = 0; fetchFireData() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchFireData()
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
  fetchFireData()
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
  fetchFireData()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchFireData)

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
  fetchFireData()
})

onUnmounted(() => {
  destroyMap()
})

watch([records, loading], () => {
  if (!loading.value && records.value.length > 0) {
    notifyMapVisible()
  }
})

watch(selectedRecord, (newRecord) => {
    if (newRecord && newRecord.street_name && newRecord.zip) {
        const street = newRecord.street_name || 'Unknown'
        const number = newRecord.street_number || '' 
        const type = newRecord.street_type || '' 
        const zip = newRecord.zip || '' 
        const neighborhood = newRecord.incident_description || 'Unknown fire department activity' 
        const address = `${number} ${street} ${type} ${zip}`
        displayLocation(null, null, neighborhood, address)
      }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Fire Incident Reporting</h1>
      <p class="subtitle">BFD incident data from 2016 to present</p>
      <button @click="openHelpModal('Fire Incident Reporting', 'https://data.boston.gov/dataset/fire-incident-reporting', 'Complete fire incident reports from the Boston Fire Department, including incident types, property loss, and locations.')" class="help-btn" title="View dataset info">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Dataset</div>
        <div class="stat-value">{{ formatNumber(totalDatasetRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Incidents with Loss (Current Page)</div>
        <div class="stat-value">{{ incidentsWithLoss }}</div>
        <div class="stat-label">Average Loss (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(totalLossAverage) }}</div>
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
        <input v-model="searchQuery" placeholder="Search by neighborhood, type..." @keyup.enter="handleSearch" />
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
      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedRecord" class="selected-info">
            Selected:  {{ selectedRecord.street_number }} {{ selectedRecord.street_name }} {{ selectedRecord.street_type }} in {{ selectedRecord.neighborhood }}
          </p>
          <p v-else class="instruction-text">Click on a row to view location</p>
        </div>
        <div id="fire-map" class="map-container"></div>
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
                <th @click="sortBy('incident_number')" style="cursor: pointer;">
                  Incident # {{ getSortIndicator('incident_number') }}
                </th>
                <th @click="sortBy('incident_description')" style="cursor: pointer;">
                  Description {{ getSortIndicator('incident_description') }}
                </th>
                <th @click="sortBy('neighborhood')" style="cursor: pointer;">
                  Neighborhood {{ getSortIndicator('neighborhood') }}
                </th>
                <th @click="sortBy('street_name')" style="cursor: pointer;">
                  Street {{ getSortIndicator('street_name') }}
                </th>
                <th @click="sortBy('alarm_date')" style="cursor: pointer;">
                  Date {{ getSortIndicator('alarm_date') }}
                </th>
                <th @click="sortBy('estimated_property_loss')" style="cursor: pointer;">
                  Property Loss {{ getSortIndicator('estimated_property_loss') }}
                </th>
                <th @click="sortBy('estimated_content_loss')" style="cursor: pointer;">
                  Content Loss {{ getSortIndicator('estimated_content_loss') }}
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
                <td data-label="Incident #">{{ record.incident_number }}</td>
                <td data-label="Description"><span class="drilldown" @click.stop="drillDown('incident_description', record.incident_description)">{{ record.incident_description }}</span></td>
                <td data-label="Neighborhood"><span class="drilldown" @click.stop="drillDown('neighborhood', record.neighborhood)">{{ record.neighborhood }}</span></td>
                <td data-label="Street"><span class="drilldown" @click.stop="drillDown('street_name', record.street_name)">{{ record.street_name }}</span></td>
                <td data-label="Date">{{ formatDate(record.alarm_date) }}</td>
                <td data-label="Property Loss">${{ formatCurrency(parseNumericString(record.estimated_property_loss)) }}</td>
                <td data-label="Content Loss">${{ formatCurrency(parseNumericString(record.estimated_content_loss)) }}</td>
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
  </div>
</template>
