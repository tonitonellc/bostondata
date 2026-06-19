<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCollapsibleSections, useDrillDown, useHelpModal, useMostRecentDate, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { earningsYears } from '../utils/earningsYears'
import { fetchData } from '../utils/fetchData'
import { formatCurrency, formatDate, formatNumber, parseNumericString } from '../utils/format'
import { buildNumericClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder'
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters'

const { getMostRecentDate } = useMostRecentDate()

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const totalDatasetRecords = ref(0)
const totalEarnings = ref(0)
const averageEarnings = ref(0)
const limit = ref(25)
const offset = ref(0)
const selectedYear = ref(earningsYears[0])
const filters = ref({
  fromDate: '',
  toDate: '',
})

// Derived from selectedYear — gives the correct column name and type hints for the active dataset
const totalGrossKey = computed(() => selectedYear.value.totalGrossKey)
const totalGrossIsNumeric = computed(() => selectedYear.value.totalGrossIsNumeric)

const fieldOptions = computed(() => [
  // Use the year-appropriate column name so SQL filters target the right field
  { label: 'Total Earnings', value: totalGrossKey.value, type: 'money', isNativeNumeric: totalGrossIsNumeric.value, needsCommaCleaning: !totalGrossIsNumeric.value },
  { label: 'Regular Pay', value: 'REGULAR', type: 'money' },
  { label: 'Overtime', value: 'OVERTIME', type: 'money' },
  { label: 'Name', value: 'NAME' },
  { label: 'Department', value: 'DEPARTMENT_NAME' },
  { label: 'Title', value: 'TITLE' },
])

const selectedField = ref(null)
const selectedOperator = ref('>')
const filterValue = ref('')

// Persist: year drives fieldOptions, so selectedField is restored in onMounted after nextTick
const { restore, clear } = usePersistedFilters('earnings', {
  searchQuery, selectedField, filterValue, selectedOperator, limit, selectedYear
})
// selectedField is not passed above (year-dependent); persist it separately
// Only save to localStorage if selectedField has a valid value - don't clear it on null/undefined
watch(selectedField, (sf) => {
  if (!sf) return
  try {
    const key = 'boston-filter-earnings'
    const saved = JSON.parse(localStorage.getItem(key) || '{}')
    saved.selectedField = sf.value
    localStorage.setItem(key, JSON.stringify(saved))
  } catch (e) {}
})

const mostRecentDate = computed(() => {
  const date = getMostRecentDate(records.value, 'HIRE_DATE')
  return date ? formatDate(date) : 'N/A'
})

const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()

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
  // The Go server always normalizes earnings to "TOTAL GROSS" via EarningsRecord struct tag,
  // regardless of the upstream column name (TOTAL EARNINGS, TOTAL_GROSS, etc.).
  const totals = records.value.reduce((acc, r) => {
    acc.total += parseNumericString(r['TOTAL GROSS'])
    acc.count += 1
    return acc
  }, { total: 0, count: 0 })

  totalEarnings.value = totals.total
  averageEarnings.value = totals.count > 0 ? totals.total / totals.count : 0
}

// Translates logical field names to the year-appropriate actual SQL column name.
// Returns null when the column doesn't exist for this year (deptCol: null in earningsYears).
// Callers must check for null and skip the clause rather than sending a broken query.
function resolveColName(logicalName) {
  if (logicalName === 'DEPARTMENT_NAME') {
    return selectedYear.value.deptCol  // null for years with unknown/absent dept column
  }
  return logicalName
}

const fetchEarnings = async () => {
  const clauses = []

  if (filterValue.value) {
    const operator = selectedOperator.value
    const fieldValue = resolveColName(selectedField.value.value)

    if (fieldValue !== null) {
      if (selectedField.value.type === 'money' && ['>', '<', '!=', '>=', '<='].includes(operator)) {
        const clause = buildNumericClause(fieldValue, operator, filterValue.value, {
          isNativeNumeric: selectedField.value.isNativeNumeric ?? false,
          needsCommaCleaning: selectedField.value.needsCommaCleaning ?? false,
        })
        clauses.push(clause)
      } else {
        const clause = buildTextClause(fieldValue, operator, filterValue.value)
        if (clause) clauses.push(clause)
      }
    }
  }

  if (searchQuery.value) {
    // Omit department from search for years where the column name is unknown (deptCol: null)
    const deptCol = selectedYear.value.deptCol
    const searchFields = ['NAME', ...(deptCol ? [deptCol] : []), 'TITLE']
    const sc = buildSearchClause(searchFields, searchQuery.value)
    if (sc) clauses.push(sc)
  }

  await fetchData({
    endpoint: '/api/boston-earnings',
    records,
    loading,
    error,
    totalRecords,
    totalDatasetRecords,
    offset,
    limit: limit.value,
    sqlConfig: { resourceId: selectedYear.value.id, clauses },
    errorPrefix: 'earnings data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchEarnings() }
const handleSQLSearch = handleSearch

const handleYearChange = () => { offset.value = 0; fetchEarnings() }

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchEarnings()
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
  fetchEarnings()
}

let isInitialMount = true
watch([selectedField, selectedOperator], () => {
  if (isInitialMount) return
  offset.value = 0
  fetchEarnings()
})

const resetFilters = () => {
  clear()
  searchQuery.value = ''
  filterValue.value = ''
  selectedOperator.value = '>'
  selectedYear.value = earningsYears[0]
  limit.value = 25
  offset.value = 0
  setHashParams({})
  fetchEarnings()
}

let drillDownInstance = useDrillDown(fieldOptions.value, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchEarnings)
let { drillDown: drillDownFn } = drillDownInstance

// Recreate drillDown whenever fieldOptions changes to ensure it has current field definitions
watch(fieldOptions, () => {
  drillDownInstance = useDrillDown(fieldOptions.value, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchEarnings)
  drillDownFn = drillDownInstance.drillDown
})

// Wrapper to ensure selectedField is always properly set when drill-down is triggered
const drillDown = (fieldName, value) => {
  // Ensure the field object is set in selectedField
  const field = fieldOptions.value.find(f => f.value === fieldName)
  if (field) {
    selectedField.value = field
  }
  // Call the actual drillDown function
  drillDownFn(fieldName, value)
}

// Chart Logic
const earningsBarRef = ref(null)
const titlePieRef = ref(null)
const titleBarRef = ref(null)
let barChart, titlePieChart, titleBarChart

const aggregateByDept = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const dept = r['DEPARTMENT_NAME'] || 'Unknown'
    const amt = parseNumericString(r['TOTAL GROSS'])
    map.set(dept, (map.get(dept) || 0) + amt)
  })
  return Array.from(map.entries())
    .map(([dept, amount]) => ({ dept, amount }))
    .filter(d => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
})

const aggregateByTitle = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    const title = r['TITLE'] || 'Unknown'
    const amt = parseNumericString(r['TOTAL GROSS'])
    map.set(title, (map.get(title) || 0) + amt)
  })
  return Array.from(map.entries())
    .map(([title, amount]) => ({ title, amount }))
    .filter(t => t.amount > 0)
    .sort((a, b) => b.amount - a.amount)
})

const renderCharts = async () => {
  if (loading.value || records.value.length === 0) return
  await nextTick()

  if (barChart) barChart.destroy()
  if (titlePieChart) titlePieChart.destroy()
  if (titleBarChart) titleBarChart.destroy()

  // Dept Bar
  if (earningsBarRef.value) {
    const data = aggregateByDept.value.slice(0, 10)
    barChart = new Chart(earningsBarRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.dept),
        datasets: [{
          label: 'Total Gross Pay',
          data: data.map(d => d.amount),
          backgroundColor: chartColors.primary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + formatNumber(v / 1000) + 'k' }
          }
        }
      }
    })
  }

  // Title Pie
  if (titlePieRef.value) {
    const data = aggregateByTitle.value.slice(0, 8)
    titlePieChart = new Chart(titlePieRef.value, {
      type: 'pie',
      data: {
        labels: data.map(d => d.title),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: data.map((_, i) => getColor(i + 2))
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.label}: $${formatCurrency(ctx.parsed)}` }
          }
        }
      }
    })
  }
}

watch([records, loading], () => {
  renderCharts()
})

const helpModal = useHelpModal()
const { showCharts, showMap, showTable } = useCollapsibleSections()

const readUrlParams = useUrlSync(
  () => {
    return {
      year: selectedYear.value.label !== earningsYears[0].label ? selectedYear.value.label : undefined,
      q: searchQuery.value || undefined,
      field: selectedField.value?.value || undefined,
      op: selectedOperator.value !== '>' ? encodeOp(selectedOperator.value) : undefined,
      val: filterValue.value || undefined,
      limit: limit.value !== 25 ? String(limit.value) : undefined,
    }
  },
  [selectedYear, searchQuery, selectedField, selectedOperator, filterValue, limit]
)

onMounted(async () => {
  // Read selectedField from localStorage BEFORE restore() overwrites it
  const savedField = (() => {
    try { return JSON.parse(localStorage.getItem('boston-filter-earnings') || 'null')?.selectedField } catch (e) {}
  })()

  restore()
  // selectedField depends on fieldOptions (a computed from selectedYear) —
  // wait one tick so fieldOptions recalculates before restoring the saved field
  await nextTick()

  await readUrlParams(async p => {
    // Restore year first and wait for fieldOptions to update
    if (p.year) {
      const yr = earningsYears.find(y => y.label === p.year)
      if (yr) { selectedYear.value = yr; await nextTick(); await nextTick() }
    }
    if (p.q) searchQuery.value = p.q
    // Restore field from URL first (takes precedence)
    if (p.field) {
      const match = fieldOptions.value.find(f => f.value === p.field)
      if (match) selectedField.value = match
    }
    if (p.op) selectedOperator.value = decodeOp(p.op)
    if (p.val) filterValue.value = p.val
    if (p.limit) limit.value = Number(p.limit)
  })

  // If field wasn't restored from URL, try localStorage
  if (!selectedField.value && savedField) {
    const match = fieldOptions.value.find(f => f.value === savedField)
    if (match) selectedField.value = match 
  }

  // Ensure selectedField is always set to a valid field
  if (!selectedField.value) {
    selectedField.value = fieldOptions.value[0]
  }

  isInitialMount = false
  fetchEarnings()
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Employee Earnings</h1>
      <p class="subtitle">Public employee compensation data for the City of Boston</p>
      <button @click="helpModal.openHelpModal('Employee Earnings', 'https://data.boston.gov/dataset/employee-earnings-report', 'Comprehensive earnings records for public employees of the City of Boston, including salary, overtime, and other compensation.')" class="help-btn">?</button>
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
        <div class="stat-label">Total Earnings (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(totalEarnings) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Earnings (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(averageEarnings) }}</div>
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
        <label>Select Year:</label>
        <select v-model="selectedYear" @change="handleYearChange">
          <option v-for="opt in earningsYears" :key="opt.id" :value="opt">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label>Text Search:</label>
        <input 
          type="text" 
          v-model="searchQuery" 
          @keyup.enter="handleSearch" 
          placeholder="Search name, dept..."
        >
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
            <option value=">">></option>
            <option value="<"><</option>
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
        <button @click="resetFilters" class="page-btn reset-btn">Reset Filters</button>
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
              <h3>Top Departments by Total Gross</h3>
              <canvas ref="earningsBarRef"></canvas>
            </div>
             <div class="chart-card">
              <h3>Earnings by Title</h3>
              <canvas ref="titlePieRef"></canvas>
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
                  <th @click="sortBy('NAME')" style="cursor: pointer;">Name {{ getSortIndicator('NAME') }}</th>
                  <th @click="sortBy('DEPARTMENT_NAME')" style="cursor: pointer;">Department {{ getSortIndicator('DEPARTMENT_NAME') }}</th>
                  <th @click="sortBy('TITLE')" style="cursor: pointer;">Title {{ getSortIndicator('TITLE') }}</th>
                  <th @click="sortBy('REGULAR')" style="cursor: pointer;">Regular {{ getSortIndicator('REGULAR') }}</th>
                  <th @click="sortBy('OVERTIME')" style="cursor: pointer;">Overtime {{ getSortIndicator('OVERTIME') }}</th>
                  <th @click="sortBy('TOTAL GROSS')" style="cursor: pointer;">Total {{ getSortIndicator('TOTAL GROSS') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in sortedRecords" :key="record._id">
                  <td data-label="Name"><span class="drilldown" @click="drillDown('NAME', record.NAME)">{{ record.NAME }}</span></td>
                  <td data-label="Department"><span class="drilldown" @click="drillDown('DEPARTMENT_NAME', record.DEPARTMENT_NAME)">{{ record.DEPARTMENT_NAME }}</span></td>
                  <td data-label="Title"><span class="drilldown" @click="drillDown('TITLE', record.TITLE)">{{ record.TITLE }}</span></td>
                  <td data-label="Regular">${{ formatCurrency(parseNumericString(record.REGULAR)) }}</td>
                  <td data-label="Overtime">${{ formatCurrency(parseNumericString(record.OVERTIME)) }}</td>
                  <td data-label="Total" class="total-cost">${{ formatCurrency(parseNumericString(record['TOTAL GROSS'])) }}</td>
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
          <a :href="helpModal.modalContent.value.url" target="_blank" class="dataset-link">
            View Dataset on boston.gov →
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
