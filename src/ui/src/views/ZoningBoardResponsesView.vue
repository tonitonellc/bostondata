<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { debounce } from '../utils/debounce'
import { fetchData } from '../utils/fetchData'
import { formatDate, formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'
import { buildDateClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const helpModal = useHelpModal()
const { initializeMap, displayLocation, displayAllLocations, geocodeAddress, destroyMap, invalidateSize } = useMapDisplay('zoning-map')
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)
const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const permitsIssuedPct = ref(0)
const byRightPct = ref(0)
const totalViolations = ref(0)
const offset = ref(0)
const selectedRecord = ref(null)
const limit = ref(25)
const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'Address', value: 'Address' },
  { label: 'Neighborhood', value: 'Neighborhood' },
  { label: 'Zoning District', value: 'Zoning district' },
  { label: 'Application Type', value: 'Permit application type' },
  { label: 'Work Type', value: 'Permit application work type' },
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('=')
const filterValue = ref('')

const resourceId = 'f9b736f2-60da-4240-b793-f9b498eb475e'

const { restore, clear } = usePersistedFilters('zoning', {
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

// Human-readable labels for the ~17 boolean violation flags returned by the
// dataset, keyed by their JSON field name.
const violationFieldDefs = [
  ['Violation for existing building alignment', 'Existing building alignment'],
  ['Violation for roof restriction', 'Roof restriction'],
  ['Violation for accessory parking use', 'Accessory parking use'],
  ['Violation for parking design and maneuverability', 'Parking design and maneuverability'],
  ['Violation for insufficient parking or loading', 'Insufficient parking or loading'],
  ['Violation for insufficient lot width', 'Insufficient lot width'],
  ['Violation for insufficient additional lot area', 'Insufficient additional lot area'],
  ['Violation for insufficient lot area', 'Insufficient lot area'],
  ['Violation for insufficient lot frontage', 'Insufficient lot frontage'],
  ['Violation for insufficient usable open space', 'Insufficient usable open space'],
  ['Violation for insufficient front yard', 'Insufficient front yard'],
  ['Violation for insufficient side yard', 'Insufficient side yard'],
  ['Violation for insufficient rear yard', 'Insufficient rear yard'],
  ['Violation for excessive height in stories', 'Excessive height in stories'],
  ['Violation for excessive height in feet', 'Excessive height in feet'],
  ['Violation for excessive height alone', 'Excessive height alone'],
  ['Violation for excessive floor area ratio', 'Excessive floor area ratio'],
]

const getActiveViolations = (record) => {
  if (!record) return []
  return violationFieldDefs.filter(([key]) => record[key]).map(([, label]) => label)
}

const selectedViolations = computed(() => getActiveViolations(selectedRecord.value))

const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]))

// Builds the marker popup label, appending violation details (if any) below
// the address/neighborhood so they're visible right on the map.
const buildPopupLabel = (record) => {
  const base = `${escapeHtml(record['Address'])}, ${escapeHtml(record['Neighborhood'])}`
  const violations = getActiveViolations(record)
  if (violations.length === 0) return base
  const list = violations.map(v => `&bull; ${escapeHtml(v)}`).join('<br>')
  return `${base}<br><b>${violations.length} violation${violations.length !== 1 ? 's' : ''}:</b><br>${list}`
}

// Deep-links a permit # to the Building Permits explorer with an exact-match
// filter applied, so the referenced permit is surfaced when it loads. Only
// issued permits actually exist in that dataset, so unissued applications
// are left as plain text.
const permitLink = (record) => {
  const permitNumber = record['Permit application number']
  if (!permitNumber || !record['Permit issued']) return null
  const qs = new URLSearchParams({ field: 'permitnumber', op: encodeOp('='), val: permitNumber }).toString()
  return `#permits?${qs}`
}

const calculateStats = () => {
  const count = records.value.length
  if (count === 0) {
    permitsIssuedPct.value = 0
    byRightPct.value = 0
    totalViolations.value = 0
    return
  }

  const totals = records.value.reduce((acc, r) => {
    if (r['Permit issued']) acc.issued += 1
    if (r['By right']) acc.byRight += 1
    acc.violations += Number(r['Total common violations']) || 0
    return acc
  }, { issued: 0, byRight: 0, violations: 0 })

  permitsIssuedPct.value = Math.round((totals.issued / count) * 100)
  byRightPct.value = Math.round((totals.byRight / count) * 100)
  totalViolations.value = totals.violations
}

const fetchZoningResponses = async () => {
  const clauses = []
  const dateClause = buildDateClause('Permit application filing date', filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const clause = buildTextClause(selectedField.value.value, selectedOperator.value, filterValue.value)
    if (clause) clauses.push(clause)
  }

  if (searchQuery.value) {
    const sc = buildSearchClause(['Address', 'Permit application number'], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-zoning',
    records,
    loading,
    error,
    totalRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId, clauses },
    orderBy: 'Permit application filing date',
    errorPrefix: 'zoning board responses',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchZoningResponses() }
const handleSQLSearch = handleSearch

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchZoningResponses()
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
  fetchZoningResponses()
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
  fetchZoningResponses()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchZoningResponses)

// Chart Logic
const neighborhoodRef = ref(null)
const workTypeRef = ref(null)
const permitIssuedRef = ref(null)
let neighborhoodChart, workTypeChart, permitIssuedChart

const aggregateByNeighborhood = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Neighborhood'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByWorkType = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const key = r['Permit application work type'] || 'Unknown'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
})

const aggregateByPermitIssued = computed(() => {
  const map = new Map([['Issued', 0], ['Not Issued', 0]])
  records.value.forEach(r => {
    const key = r['Permit issued'] ? 'Issued' : 'Not Issued'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (neighborhoodChart) neighborhoodChart.destroy()
  if (workTypeChart) workTypeChart.destroy()
  if (permitIssuedChart) permitIssuedChart.destroy()

  if (neighborhoodRef.value) {
    const data = aggregateByNeighborhood.value.slice(0, 10)
    neighborhoodChart = new Chart(neighborhoodRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Applications',
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

  if (workTypeRef.value) {
    const data = aggregateByWorkType.value.slice(0, 10)
    workTypeChart = new Chart(workTypeRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Applications',
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

  if (permitIssuedRef.value) {
    const data = aggregateByPermitIssued.value
    permitIssuedChart = new Chart(permitIssuedRef.value, {
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
    const label = `${r['Address'] || ''}, ${r['Neighborhood'] || ''}`
    const lat = parseFloat(r['Y latitude'])
    const lon = parseFloat(r['X longitude'])
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      direct.push({ lat, lon, label })
    } else if (r['Address']) {
      const addr = `${r['Address']}, Boston, MA`
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
  fetchZoningResponses()
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

  const lat = parseFloat(newRecord['Y latitude'])
  const lon = parseFloat(newRecord['X longitude'])
  const label = buildPopupLabel(newRecord)

  if (!isNaN(lat) && !isNaN(lon)) {
    displayLocation(lat, lon, label)
  } else if (newRecord['Address']) {
    const fullAddress = `${newRecord['Address']}, Boston, MA`
    debouncedDisplay(null, null, label, fullAddress)
  }
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Zoning Board of Appeal Responses</h1>
      <p class="subtitle">Zoning permit applications and Board of Appeal decisions in Boston</p>
      <button @click="helpModal.openHelpModal('Zoning Board of Appeal Responses', 'https://data.boston.gov/dataset/zoning-reform-impact-tracker', 'Records of zoning permit applications, appeal outcomes, and code violations reviewed by the Boston Zoning Board of Appeal.')" class="help-btn">?</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(totalRecords) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Permits Issued (Current Page)</div>
        <div class="stat-value">{{ permitsIssuedPct }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">By Right (Current Page)</div>
        <div class="stat-value">{{ byRightPct }}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Common Violations (Current Page)</div>
        <div class="stat-value">{{ formatNumber(totalViolations) }}</div>
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
        <input v-model="searchQuery" placeholder="Search by address, permit #..." @keyup.enter="handleSearch" />
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
          <h3>Applications by Neighborhood</h3>
          <canvas ref="neighborhoodRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Applications by Work Type</h3>
          <canvas ref="workTypeRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Permit Issued</h3>
          <canvas ref="permitIssuedRef"></canvas>
        </div>
      </div>

      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedRecord" class="selected-info">
            Selected: {{ selectedRecord['Address'] }}, {{ selectedRecord['Neighborhood'] }}
          </p>
          <p v-else class="instruction-text">Showing location{{ displayedPins !== 1 ? 's' : '' }} from {{ displayedPins }} record{{ displayedPins !== 1 ? 's' : '' }} ({{ records.length }} total) — select a row to focus</p>
        </div>

        <div v-if="selectedRecord" class="record-detail">
          <div class="record-detail-grid">
            <div class="record-detail-item">
              <span class="record-detail-label">Permit #</span>
              <span class="record-detail-value">{{ selectedRecord['Permit application number'] || 'N/A' }}</span>
            </div>
            <div class="record-detail-item">
              <span class="record-detail-label">Zoning relief type</span>
              <span class="record-detail-value">{{ selectedRecord['Zoning relief type'] || 'N/A' }}</span>
            </div>
            <div class="record-detail-item">
              <span class="record-detail-label">Common violations</span>
              <span class="record-detail-value">{{ formatNumber(selectedRecord['Total common violations'] || 0) }}</span>
            </div>
          </div>

          <div v-if="selectedViolations.length" class="violation-badges">
            <span v-for="v in selectedViolations" :key="v" class="violation-badge">{{ v }}</span>
          </div>
          <p v-else class="instruction-text">No violations recorded for this application.</p>

          <div v-if="selectedRecord['Zoning Board of Appeal decision link'] || selectedRecord['Planning Department recommendation link']" class="record-links">
            <a
              v-if="selectedRecord['Zoning Board of Appeal decision link']"
              :href="selectedRecord['Zoning Board of Appeal decision link']"
              target="_blank"
              rel="noopener noreferrer"
            >Board of Appeal decision →</a>
            <a
              v-if="selectedRecord['Planning Department recommendation link']"
              :href="selectedRecord['Planning Department recommendation link']"
              target="_blank"
              rel="noopener noreferrer"
            >Planning Dept recommendation →</a>
          </div>
        </div>

        <div id="zoning-map" class="map-container"></div>
      </div>

      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>Zoning Application Records</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th @click="sortBy('Permit application number')" style="cursor: pointer;">Permit # {{ getSortIndicator('Permit application number') }}</th>
                  <th @click="sortBy('Address')" style="cursor: pointer;">Address {{ getSortIndicator('Address') }}</th>
                  <th @click="sortBy('Permit application work type')" style="cursor: pointer;">Work Type {{ getSortIndicator('Permit application work type') }}</th>
                  <th @click="sortBy('Neighborhood')" style="cursor: pointer;">Neighborhood {{ getSortIndicator('Neighborhood') }}</th>
                  <th @click="sortBy('Permit application filing date')" style="cursor: pointer;">Filed {{ getSortIndicator('Permit application filing date') }}</th>
                  <th @click="sortBy('Permit issued')" style="cursor: pointer;">Permit Issued {{ getSortIndicator('Permit issued') }}</th>
                  <th @click="sortBy('By right')" style="cursor: pointer;">By Right {{ getSortIndicator('By right') }}</th>
                  <th @click="sortBy('Total common violations')" style="cursor: pointer;">Violations {{ getSortIndicator('Total common violations') }}</th>
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
                  <td data-label="Permit #">
                    <a
                      v-if="permitLink(record)"
                      :href="permitLink(record)"
                      class="drilldown"
                      @click.stop
                      title="View this permit in the Building Permits explorer"
                    >{{ record['Permit application number'] }}</a>
                    <template v-else>{{ record['Permit application number'] }}</template>
                  </td>
                  <td data-label="Address">{{ record['Address'] }}</td>
                  <td data-label="Work Type"><span class="drilldown" @click.stop="drillDown('Permit application work type', record['Permit application work type'])">{{ record['Permit application work type'] }}</span></td>
                  <td data-label="Neighborhood"><span class="drilldown" @click.stop="drillDown('Neighborhood', record['Neighborhood'])">{{ record['Neighborhood'] }}</span></td>
                  <td data-label="Filed">{{ formatDate(record['Permit application filing date']) }}</td>
                  <td data-label="Permit Issued" :class="{ 'open-cell': !record['Permit issued'] }">{{ record['Permit issued'] ? 'Yes' : 'No' }}</td>
                  <td data-label="By Right">{{ record['By right'] ? 'Yes' : 'No' }}</td>
                  <td data-label="Violations">{{ formatNumber(record['Total common violations'] || 0) }}</td>
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
