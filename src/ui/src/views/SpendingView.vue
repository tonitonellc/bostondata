<script setup>
import Chart from 'chart.js/auto';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useCollapsibleSections, useDrillDown, useHelpModal, useMostRecentDate, usePersistedFilters, useSortable, useUrlSync } from '../composables/composables';
import { chartColors } from '../utils/chartUtils'; // optional
import { fetchData } from '../utils/fetchData';
import { formatCurrency, formatDate, formatNumber } from '../utils/format';
import { buildDateClause, buildNumericClause, buildSearchClause, buildTextClause } from '../utils/queryBuilder';
import { getSpendingSchema, spendingYears } from '../utils/spendingYears';
import { decodeOp, encodeOp, setHashParams } from '../utils/urlFilters';

const { getMostRecentDate } = useMostRecentDate()

const isDev = () => process.env.VUE_APP_BOSTONDATA_DEVMODE === 'true'
const devLog = (message, ...args) => {
  if (isDev()) console.log(message, ...args)
}

const records = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const totalRecords = ref(0)
const totalDatasetRecords = ref(0)
const totalSpending = ref(0)
const averageAmount = ref(0)
const limit = ref(25)
const offset = ref(0)
const aggregateData = ref(null)


const selectedFiscalYear = ref(spendingYears[0].id)

const filters = ref({
  fromDate: '',
  toDate: '',
})

const fieldOptions = [
  { label: 'Amount', value: 'Monetary Amount', type: 'money' },
  { label: 'Vendor', value: 'Vendor Name' },
  { label: 'Department', value: 'Dept' },
  { label: 'Entered', value: 'Entered' }
]

const selectedField = ref(fieldOptions[0])
const selectedOperator = ref('>')
const filterValue = ref('')

const { restore, clear } = usePersistedFilters('spending', {
  searchQuery, filters, filterValue, selectedField, selectedOperator, limit, fieldOptions,
  selectedFiscalYear
})

const mostRecentDate = computed(() => {
  const date = getMostRecentDate(records.value, 'Entered')
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

const getSchema = () => {
  const selectedOpt = spendingYears.find(opt => opt.id === selectedFiscalYear.value)
  const yearInt = selectedOpt?.yearInt ?? 2026
  const s = getSpendingSchema(yearInt)
  return {
    isNewSchema: s.isNewSchema,
    columns: {
      'Monetary Amount': s.columns.monetaryAmount,
      'Vendor Name': s.columns.vendorName,
      'Dept': s.columns.dept,
      'Entered': s.columns.entered,
      'Fiscal Year': s.columns.fiscalYear,
    },
    castConfig: { needsCommaCleaning: s.needsCommaCleaning },
  }
}

const calculateStats = () => {
  if (aggregateData.value) {
    const count = Number(aggregateData.value.count || 0)
    const sum = Number(aggregateData.value.total_amount || 0)
    totalSpending.value = sum
    averageAmount.value = count > 0 ? sum / count : 0
  } else {
    const totals = records.value.reduce((acc, r) => {
      const amount = parseNumericString(r['Monetary Amount'])
      acc.total += amount
      acc.count += 1
      return acc
    }, { total: 0, count: 0 })
    totalSpending.value = totals.total
    averageAmount.value = totals.count > 0 ? totals.total / totals.count : 0
  }
}

const fetchSpending = async () => {
  aggregateData.value = null
  const clauses = []
  const schema = getSchema()

  const dateCol = schema.columns['Entered']
  const dateClause = buildDateClause(dateCol, filters.value.fromDate, filters.value.toDate)
  clauses.push(...dateClause)

  if (filterValue.value) {
    const operator = selectedOperator.value
    const fieldValue = schema.columns[selectedField.value.value] || selectedField.value.value

    if (selectedField.value.type === 'money' && ['>', '<', '!=', '>=', '<='].includes(operator)) {
      const clause = buildNumericClause(
        fieldValue,
        operator,
        filterValue.value,
        { needsCommaCleaning: schema.castConfig.needsCommaCleaning }
      )
      clauses.push(clause)
    } else {
      const clause = buildTextClause(fieldValue, operator, filterValue.value)
      if (clause) clauses.push(clause)
    }
  }

  if (searchQuery.value) {
    const vendorCol = schema.columns['Vendor Name']
    const deptCol = schema.columns['Dept']
    const sc = buildSearchClause([vendorCol, deptCol], searchQuery.value)
    if (sc) clauses.push(sc)
  }

  const amtCol = schema.columns['Monetary Amount']
  const sumSql = schema.castConfig.needsCommaCleaning
    ? `sum(REPLACE("${amtCol}", ',', '')::numeric)`
    : `sum("${amtCol}"::numeric)`
  const aggregates = `count(*) as count, ${sumSql} as total_amount`

  await fetchData({
    endpoint: '/api/boston-spending',
    records,
    loading,
    error,
    totalRecords,
    totalDatasetRecords,
    offset,
    limit: limit.value,
    aggregateResults: aggregateData,
    sqlConfig: {
      resourceId: selectedFiscalYear.value,
      clauses,
      aggregates
    },
    orderByExpr: `"${dateCol}"::date`,
    errorPrefix: 'spending data',
    onSuccess: calculateStats
  })
}

const handleSearch = () => { offset.value = 0; fetchSpending() }
const handleSQLSearch = handleSearch

const handleYearChange = () => { offset.value = 0; fetchSpending() }

const goToPage = (page) => {
  offset.value = (page - 1) * limit.value
  fetchSpending()
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
  fetchSpending()
}

const resetFilters = () => {
  clear()
  searchQuery.value = ''
  filters.value.fromDate = ''
  filters.value.toDate = ''
  filterValue.value = ''
  selectedField.value = fieldOptions[0]
  selectedOperator.value = '>'
  selectedFiscalYear.value = spendingYears[0].id
  limit.value = 25
  offset.value = 0
  setHashParams({})
  fetchSpending()
}

const { drillDown } = useDrillDown(fieldOptions, searchQuery, filters, selectedField, selectedOperator, filterValue, offset, fetchSpending)

const helpModal = useHelpModal()
const { showCharts, showMap, showTable } = useCollapsibleSections()
const spendingBarRef = ref(null);
const spendingVendorBarRef = ref(null);
const spendingLineRef = ref(null);

let barChart, barVendorChart, lineChart;

// Robust number parser – handles $, commas, spaces, etc.
const parseNumericString = (val) => {
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/[^0-9.-]/g, '')   // strip everything except digits, ., -
    .replace(/^-+/, '-')        // only one leading -
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Debug version of aggregateByDept
const aggregateByDept = computed(() => {
  const map = new Map();
  let validCount = 0;
  let totalAmt = 0;

  records.value.forEach((r, idx) => {
    const dept = r['Dept'] || 'Unknown';
    const rawAmt = r['Monetary Amount'];
    const amt = parseNumericString(rawAmt);

    if (amt > 0) validCount++;
    totalAmt += amt;

    map.set(dept, (map.get(dept) || 0) + amt);
  });

  devLog(`Aggregate debug: ${validCount} valid positive amounts, grand total $${totalAmt.toLocaleString()}`);

  return Array.from(map.entries())
    .map(([dept, amount]) => ({ dept, amount }))
    .filter(item => item.amount > 0);  // skip zero/NaN
});

const topDeptsForBar = computed(() => {
  return [...aggregateByDept.value]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
});

// Debug version of aggregateByDept
const aggregateByVendor = computed(() => {
  const map = new Map();
  let validCount = 0;
  let totalAmt = 0;

  records.value.forEach((r, idx) => {
    const vendor = r['Vendor Name'] || 'Unknown';
    const rawAmt = r['Monetary Amount'];
    const amt = parseNumericString(rawAmt);

    if (amt > 0) validCount++;
    totalAmt += amt;

    map.set(vendor, (map.get(vendor) || 0) + amt);
  });

  console.log(`Vendor aggregate debug: ${validCount} valid positive amounts, grand total $${totalAmt.toLocaleString()}`);

  return Array.from(map.entries())
    .map(([vendor, amount]) => ({ vendor, amount }))
    .filter(item => item.amount > 0);  // skip zero/NaN
});

const topVendorsForBar = computed(() => {
  return [...aggregateByVendor.value]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
});

// Daily spending trend
const dailySpending = computed(() => {
  const map = new Map();
  records.value.forEach(r => {
    const dateStr = r.Entered;
    if (!dateStr) return;

    let date;
    try {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
    } catch {
      return;
    }

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const amt = parseNumericString(r['Monetary Amount']);
    map.set(key, (map.get(key) || 0) + amt);
  });

  const arr = Array.from(map.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  devLog('Daily groups:', arr.length, 'days →', arr);

  return arr;
});

const renderCharts = async () => {
  // Safety guard
  if (loading.value || records.value.length === 0) return;
  await nextTick();
  devLog('--- Rendering charts ---');
  devLog('Bar data length:', topDeptsForBar.value.length);
  devLog('Line data length:', dailySpending.value.length);


  [spendingBarRef, spendingVendorBarRef, spendingLineRef].forEach(ref => {
    if (ref.value) {
      ref.value.style.width = '100%';
      ref.value.style.height = '320px';
      ref.value.width = ref.value.offsetWidth;
      ref.value.height = ref.value.offsetHeight;
    }
  });

  if (barChart) barChart.destroy();
  if (barVendorChart) barVendorChart.destroy();
  if (lineChart) lineChart.destroy();

  devLog('Rendering charts with', records.value.length, 'records');

  // Debug helpers – open console to see what's actually there
  if (records.value.length > 0) {
    devLog('Sample record keys:', Object.keys(records.value[0]));
    devLog('Sample dept:', records.value[0]['Dept'] || records.value[0]['Dept Name']);
    devLog('Sample amount:', records.value[0]['Monetary Amount'] || records.value[0]['Monetary_Amount']);
    devLog('Sample date:', records.value[0].Entered);
  }

  // Bar (same as before, but with guard)
  if (spendingBarRef.value?.getContext('2d') && topDeptsForBar.value.length > 0) {
    barChart = new Chart(spendingBarRef.value, {
      type: 'bar',
      data: {
        labels: topDeptsForBar.value.map(d => d.dept),
        datasets: [{
          label: 'Total $',
          data: topDeptsForBar.value.map(d => d.amount),
          backgroundColor: chartColors.primary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + formatNumber(v / 1000) + 'k' }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Vendor bar 
  if (spendingVendorBarRef.value?.getContext('2d') && topVendorsForBar.value.length > 0) {
    barVendorChart = new Chart(spendingVendorBarRef.value, {
      type: 'bar',
      data: {
        labels: topVendorsForBar.value.map(d => d.vendor),
        datasets: [{
          label: 'Total $',
          data: topVendorsForBar.value.map(d => d.amount),
          backgroundColor: chartColors.primary
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + formatNumber(v / 1000) + 'k' }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Line
  if (spendingLineRef.value?.getContext('2d') && dailySpending.value && dailySpending.value.length > 0) {
    lineChart = new Chart(spendingLineRef.value, {
      type: 'line',
      data: {
        labels: dailySpending.value.map(d => d.date),
        datasets: [{
          label: 'Daily Spending',
          data: dailySpending.value.map(d => d.total),
          borderColor: chartColors.blue,
          backgroundColor: chartColors.blue + '33',
          tension: 0.2,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: chartColors.blue
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + formatNumber(v / 1000000) + 'M' }
          }
        },
        plugins: {
          legend: { display: true }
        }
      }
    });
  }
};

// Better watching strategy
watch([records, loading], ([newRecords, isLoading]) => {
  if (!isLoading && newRecords?.length > 0) {
    renderCharts();
  }
}, { immediate: false });

// Also call once after first successful fetch
const readUrlParams = useUrlSync(
  () => ({
    year: selectedFiscalYear.value !== spendingYears[0].id ? selectedFiscalYear.value : undefined,
    q: searchQuery.value || undefined,
    field: selectedField.value?.value !== fieldOptions[0].value ? selectedField.value?.value : undefined,
    op: selectedOperator.value !== '>' ? encodeOp(selectedOperator.value) : undefined,
    val: filterValue.value || undefined,
    from: filters.value.fromDate || undefined,
    to: filters.value.toDate || undefined,
    limit: limit.value !== 25 ? String(limit.value) : undefined,
  }),
  [selectedFiscalYear, searchQuery, selectedField, selectedOperator, filterValue, filters, limit]
)

onMounted(() => {
  restore()
  readUrlParams(p => {
    if (p.year) selectedFiscalYear.value = p.year
    if (p.q) searchQuery.value = p.q
    if (p.field) selectedField.value = fieldOptions.find(f => f.value === p.field) ?? fieldOptions[0]
    if (p.op) selectedOperator.value = decodeOp(p.op)
    if (p.val) filterValue.value = p.val
    if (p.from) filters.value.fromDate = p.from
    if (p.to) filters.value.toDate = p.to
    if (p.limit) limit.value = Number(p.limit)
  })
  fetchSpending()
})

// Optional: call renderCharts after pagination / filter changes
watch([offset, limit, selectedFiscalYear, searchQuery, filters, filterValue], () => {
  if (!loading.value) renderCharts();
}, { deep: true });
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>City Spending</h1>
      <p class="subtitle">Public checkbook data for the City of Boston</p>
      <button @click="helpModal.openHelpModal('City Spending', 'https://data.boston.gov/dataset/checkbook-explorer', 'Complete records of financial transactions and vendor payments made by the City of Boston.')" class="help-btn">?</button>
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
        <div class="stat-label">Total Spending (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(totalSpending) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Amount (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(averageAmount) }}</div>
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
        <label>Select Fiscal Year:</label>
        <select v-model="selectedFiscalYear" @change="handleYearChange">
          <option v-for="opt in spendingYears" :key="opt.id" :value="opt.id">
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
          placeholder="Search vendor, dept..."
        >
      </div>

      <div class="filter-group">
        <label for="from-date">From Date:</label>
        <input 
          id="from-date" 
          type="date" 
          v-model="filters.fromDate" 
          @change="handleSQLSearch"
        />
      </div>

      <div class="filter-group">
        <label for="to-date">To Date:</label>
        <input 
          id="to-date" 
          type="date" 
          v-model="filters.toDate" 
          @change="handleSQLSearch"
        />
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
        <button @click="resetFilters" class="reset-btn">Reset Filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="records.length > 0" class="content-container">
        <div class="table-container">
          <div class="section-header" @click="showCharts = !showCharts">
            <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
            <h2>Charts & Analysis</h2>
          </div>
          <div v-show="showCharts" class="charts-grid">
            <div class="chart-card">
              <h3>Daily Spending Trend</h3>
              <canvas ref="spendingLineRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Top 10 Departments by Total Amount Spent</h3>
              <canvas ref="spendingBarRef"></canvas>
            </div>
            <div class="chart-card">
              <h3>Top 10 Vendors by Total Amount Received</h3>
              <canvas ref="spendingVendorBarRef"></canvas>
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
                  <th @click="sortBy('Vendor Name')" style="cursor: pointer;">Vendor {{ getSortIndicator('Vendor Name') }}</th>
                  <th @click="sortBy('Dept')" style="cursor: pointer;">Department {{ getSortIndicator('Dept') }}</th>
                  <th @click="sortBy('Entered')" style="cursor: pointer;">Date {{ getSortIndicator('Entered') }}</th>
                  <th @click="sortBy('Monetary Amount')" style="cursor: pointer;">Amount {{ getSortIndicator('Monetary Amount') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in sortedRecords" :key="record._id">
                  <td data-label="Vendor"><span class="drilldown" @click="drillDown('Vendor Name', record['Vendor Name'])">{{ record['Vendor Name'] }}</span></td>
                  <td data-label="Department"><span class="drilldown" @click="drillDown('Dept', record['Dept'])">{{ record['Dept'] }}</span></td>
                  <td data-label="Date">{{ formatDate(record.Entered) }}</td>
                  <td data-label="Amount" class="total-cost">${{ formatCurrency(record['Monetary Amount']) }}</td>
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
          <a :href="helpModal.modalContent.value.url" target="_blank" class="dataset-link">View Dataset →</a>
        </div>
      </div>
    </div>
  </div>
</template>
