<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { getColor } from '../utils/chartUtils'
import { earningsYears, getEarningsAmtExpr } from '../utils/earningsYears'
import { getApiUrl } from '../utils/env'
import { formatCurrency, formatNumber } from '../utils/format'
import { getSpendingSchema, spendingYears } from '../utils/spendingYears'

// ─── State ─────────────────────────────────────────────────────────────────
const selectedSpendingYears = ref([...spendingYears.slice(0, 3)])
const selectedEarningsYears = ref([...earningsYears.slice(0, 3)])
const loadingSpending = ref(false)
const loadingEarnings = ref(false)
const errorSpending = ref('')
const errorEarnings = ref('')
const spendingResults = ref([])
const earningsResults = ref([])
const showSpendingSection = ref(true)
const showEarningsSection = ref(true)

// ─── Chart refs ────────────────────────────────────────────────────────────
const spendingTotalRef = ref(null)
const spendingDeptRef = ref(null)
const earningsTotalRef = ref(null)
const earningsDeptRef = ref(null)
const charts = {}

// ─── SQL runner ────────────────────────────────────────────────────────────
async function runSQL(endpoint, sql) {
  const url = getApiUrl(`${endpoint}?sql=${encodeURIComponent(sql)}&aggregate=true`)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  if (!data.success) throw new Error(data.error?.query?.[0] || JSON.stringify(data.error))
  return data.result.records
}

// ─── Fetch ─────────────────────────────────────────────────────────────────
const fetchSpending = async () => {
  if (!selectedSpendingYears.value.length) return
  loadingSpending.value = true
  errorSpending.value = ''
  try {
    const results = await Promise.all(
      selectedSpendingYears.value.map(async (opt) => {
        const s = getSpendingSchema(opt.yearInt)
        const [totals, depts] = await Promise.all([
          runSQL('/api/boston-spending',
            `SELECT count(*) as count, sum(${s.amtExpr}) as total FROM "${opt.id}"`),
          runSQL('/api/boston-spending',
            `SELECT ${s.deptColSQL} as dept, sum(${s.amtExpr}) as total FROM "${opt.id}" GROUP BY ${s.deptColSQL} ORDER BY total DESC LIMIT 10`),
        ])
        return {
          label: opt.label,
          yearInt: opt.yearInt,
          total: Number(totals[0]?.total || 0),
          count: Number(totals[0]?.count || 0),
          byDept: depts.filter(d => d.dept).map(d => ({ dept: d.dept, total: Number(d.total || 0) })),
        }
      })
    )
    spendingResults.value = results.sort((a, b) => a.yearInt - b.yearInt)
  } catch (e) {
    errorSpending.value = `Error loading spending data: ${e.message}`
  } finally {
    loadingSpending.value = false
  }
}

const fetchEarnings = async () => {
  if (!selectedEarningsYears.value.length) return
  loadingEarnings.value = true
  errorEarnings.value = ''
  try {
    const results = await Promise.all(
      selectedEarningsYears.value.map(async (opt) => {
        const amtExpr = getEarningsAmtExpr(opt)

        // Total count/sum — critical; propagate failure for this year as zeroes
        let totals = [{ count: 0, total: 0 }]
        try {
          totals = await runSQL('/api/boston-earnings',
            `SELECT count(*) as count, sum(${amtExpr}) as total FROM "${opt.id}"`)
        } catch (e) {
          console.warn(`Earnings total failed for ${opt.label}:`, e.message)
        }

        // Dept breakdown — best-effort; skip silently if the year uses a different schema
        let depts = []
        if (opt.deptCol) {
          try {
            depts = await runSQL('/api/boston-earnings',
              `SELECT "${opt.deptCol}" as dept, sum(${amtExpr}) as total FROM "${opt.id}" GROUP BY "${opt.deptCol}" ORDER BY total DESC LIMIT 10`)
          } catch (e) {
            console.warn(`Earnings dept query failed for ${opt.label}:`, e.message)
          }
        }

        return {
          label: opt.label,
          total: Number(totals[0]?.total || 0),
          count: Number(totals[0]?.count || 0),
          byDept: depts.filter(d => d.dept).map(d => ({ dept: d.dept, total: Number(d.total || 0) })),
        }
      })
    )
    earningsResults.value = results.sort((a, b) => Number(a.label) - Number(b.label))
  } catch (e) {
    errorEarnings.value = `Error loading earnings data: ${e.message}`
  } finally {
    loadingEarnings.value = false
  }
}

const loadReport = () => {
  fetchSpending()
  fetchEarnings()
}

// ─── Aggregation helpers ───────────────────────────────────────────────────
function topDepts(results, n = 8) {
  const totals = new Map()
  results.forEach(yr => {
    yr.byDept.forEach(d => totals.set(d.dept, (totals.get(d.dept) || 0) + d.total))
  })
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([dept]) => dept)
}

function yoyChange(results) {
  const out = []
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1].total
    const curr = results[i].total
    out.push(prev > 0 ? ((curr - prev) / prev) * 100 : null)
  }
  return out
}

const spendingTopDepts = computed(() => topDepts(spendingResults.value))
const earningsTopDepts = computed(() => topDepts(earningsResults.value))
const spendingYoY = computed(() => yoyChange(spendingResults.value))
const earningsYoY = computed(() => yoyChange(earningsResults.value))

// ─── Table sort ────────────────────────────────────────────────────────────
// reactive() avoids the Vue template auto-unwrap issue: top-level refs are
// unwrapped when passed from the template, but reactive objects are not.
const spendingSort = reactive({ field: null, dir: 'asc' })
const earningsSort = reactive({ field: null, dir: 'asc' })

function tableSortBy(sortState, field) {
  if (sortState.field === field) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'
  } else {
    sortState.field = field
    sortState.dir = 'asc'
  }
}

function tableSortIndicator(sortState, field) {
  if (sortState.field !== field) return ''
  return sortState.dir === 'asc' ? '↑' : '↓'
}

function sortedDepts(depts, results, sortState) {
  const { field, dir } = sortState
  if (!field) return depts
  return [...depts].sort((a, b) => {
    let valA, valB
    if (field === 'dept') {
      valA = a.toLowerCase()
      valB = b.toLowerCase()
    } else {
      const yr = results.find(r => r.label === field)
      valA = yr?.byDept.find(d => d.dept === a)?.total ?? 0
      valB = yr?.byDept.find(d => d.dept === b)?.total ?? 0
    }
    if (valA < valB) return dir === 'asc' ? -1 : 1
    if (valA > valB) return dir === 'asc' ? 1 : -1
    return 0
  })
}

const sortedSpendingDepts = computed(() =>
  sortedDepts(spendingTopDepts.value, spendingResults.value, spendingSort)
)
const sortedEarningsDepts = computed(() =>
  sortedDepts(earningsTopDepts.value, earningsResults.value, earningsSort)
)

// ─── Chart builders ────────────────────────────────────────────────────────
function buildTotalChart(canvasEl, results, colorOffset) {
  if (!canvasEl?.getContext('2d') || !results.length) return null
  return new Chart(canvasEl, {
    type: 'bar',
    data: {
      labels: results.map(r => r.label),
      datasets: [{
        data: results.map(r => r.total),
        backgroundColor: results.map((_, i) => getColor(i + colorOffset)),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '$' + formatNumber(Math.round(v / 1_000_000)) + 'M' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `$${formatCurrency(ctx.parsed.y)}` } },
      },
    },
  })
}

function buildDeptChart(canvasEl, results, colorOffset) {
  const depts = topDepts(results)
  if (!canvasEl?.getContext('2d') || !depts.length) return null
  return new Chart(canvasEl, {
    type: 'bar',
    data: {
      labels: depts.map(d => d.length > 22 ? d.slice(0, 19) + '…' : d),
      datasets: results.map((r, i) => ({
        label: r.label,
        data: depts.map(dept => r.byDept.find(d => d.dept === dept)?.total ?? 0),
        backgroundColor: getColor(i + colorOffset),
        borderRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => '$' + formatNumber(Math.round(v / 1_000_000)) + 'M' },
        },
        x: { ticks: { maxRotation: 40, font: { size: 11 } } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: items => depts[items[0].dataIndex],
            label: ctx => `${ctx.dataset.label}: $${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
    },
  })
}

const renderSpendingCharts = async () => {
  await nextTick()
  charts.spendingTotal?.destroy()
  charts.spendingDept?.destroy()
  if (!spendingResults.value.length) return
  charts.spendingTotal = buildTotalChart(spendingTotalRef.value, spendingResults.value, 0)
  charts.spendingDept = buildDeptChart(spendingDeptRef.value, spendingResults.value, 0)
}

const renderEarningsCharts = async () => {
  await nextTick()
  charts.earningsTotal?.destroy()
  charts.earningsDept?.destroy()
  if (!earningsResults.value.length) return
  charts.earningsTotal = buildTotalChart(earningsTotalRef.value, earningsResults.value, 3)
  charts.earningsDept = buildDeptChart(earningsDeptRef.value, earningsResults.value, 3)
}

watch(spendingResults, renderSpendingCharts)
watch(earningsResults, renderEarningsCharts)

// ─── Multi-select helpers ──────────────────────────────────────────────────
function addSpendingYear(e) {
  const id = e.target.value
  e.target.value = ''
  if (!id) return
  const opt = spendingYears.find(y => y.id === id)
  if (opt && !selectedSpendingYears.value.some(y => y.id === id)) {
    selectedSpendingYears.value.push(opt)
  }
}

function removeSpendingYear(opt) {
  if (selectedSpendingYears.value.length > 1) {
    selectedSpendingYears.value = selectedSpendingYears.value.filter(y => y.id !== opt.id)
  }
}

function addEarningsYear(e) {
  const id = e.target.value
  e.target.value = ''
  if (!id) return
  const opt = earningsYears.find(y => y.id === id)
  if (opt && !selectedEarningsYears.value.some(y => y.id === id)) {
    selectedEarningsYears.value.push(opt)
  }
}

function removeEarningsYear(opt) {
  if (selectedEarningsYears.value.length > 1) {
    selectedEarningsYears.value = selectedEarningsYears.value.filter(y => y.id !== opt.id)
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => { loadReport() })

onBeforeUnmount(() => {
  Object.values(charts).forEach(c => c?.destroy())
})
</script>

<template>
  <div class="data-explorer">

    <div class="explorer-header">
      <h1>Annual Reports</h1>
      <p class="subtitle">Multi-year financial comparisons across City of Boston fiscal datasets</p>
    </div>

    <!-- Year selectors -->
    <div class="filters">
      <div class="filter-group">
        <label>Spending Fiscal Years:</label>
        <div class="multi-select-container">
          <div class="selected-items">
            <span v-if="selectedSpendingYears.length === 0" class="placeholder">Select fiscal years…</span>
            <span v-for="opt in selectedSpendingYears" :key="opt.id" class="selected-chip">
              {{ opt.label }}
              <button @click="removeSpendingYear(opt)" class="remove-chip">&times;</button>
            </span>
          </div>
          <select @change="addSpendingYear($event)" class="multi-select">
            <option value="">Add fiscal year…</option>
            <option
              v-for="opt in spendingYears"
              :key="opt.id"
              :value="opt.id"
              :disabled="selectedSpendingYears.some(y => y.id === opt.id)"
            >{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div class="filter-group">
        <label>Earnings Years:</label>
        <div class="multi-select-container">
          <div class="selected-items">
            <span v-if="selectedEarningsYears.length === 0" class="placeholder">Select years…</span>
            <span v-for="opt in selectedEarningsYears" :key="opt.id" class="selected-chip">
              {{ opt.label }}
              <button @click="removeEarningsYear(opt)" class="remove-chip">&times;</button>
            </span>
          </div>
          <select @change="addEarningsYear($event)" class="multi-select">
            <option value="">Add year…</option>
            <option
              v-for="opt in earningsYears"
              :key="opt.id"
              :value="opt.id"
              :disabled="selectedEarningsYears.some(y => y.id === opt.id)"
            >{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div class="button-group">
        <button
          class="search-btn"
          @click="loadReport"
          :disabled="loadingSpending || loadingEarnings"
        >
          {{ loadingSpending || loadingEarnings ? 'Loading…' : 'Load Report' }}
        </button>
      </div>
    </div>

    <!-- ── SPENDING SECTION ─────────────────────────────────────────────── -->
    <div class="section-header" @click="showSpendingSection = !showSpendingSection">
      <span class="chevron">{{ showSpendingSection ? '▼' : '▶' }}</span>
      <h2>Annual Spending Overview</h2>
    </div>
    <section class="report-section" v-show="showSpendingSection">

      <div v-if="loadingSpending" class="loading"><div class="spinner"></div></div>
      <div v-else-if="errorSpending" class="error"><p>{{ errorSpending }}</p></div>

      <template v-else-if="spendingResults.length">
        <!-- Per-year stat cards -->
        <div class="stats-grid">
          <div v-for="r in spendingResults" :key="r.label" class="stat-card">
            <div class="stat-label">{{ r.label }} Total Spending</div>
            <div class="stat-value">${{ formatCurrency(r.total) }}</div>
            <div class="stat-sub">{{ formatNumber(r.count) }} transactions</div>
          </div>
        </div>

        <!-- YoY change cards -->
        <div v-if="spendingResults.length > 1" class="stats-grid yoy-grid">
          <div
            v-for="(change, i) in spendingYoY"
            :key="i"
            class="stat-card"
          >
            <div class="stat-label">{{ spendingResults[i].label }} → {{ spendingResults[i + 1].label }}</div>
            <div
              class="stat-value"
              :class="change !== null && change >= 0 ? 'change-positive' : 'change-negative'"
            >
              {{ change !== null ? (change >= 0 ? '+' : '') + change.toFixed(1) + '%' : 'N/A' }}
            </div>
            <div class="stat-sub">year-over-year</div>
          </div>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <h3>Total Spending by Year</h3>
            <div class="chart-wrap"><canvas ref="spendingTotalRef"></canvas></div>
          </div>
          <div class="chart-card">
            <h3>Top Departments by Spending</h3>
            <div class="chart-wrap"><canvas ref="spendingDeptRef"></canvas></div>
          </div>
        </div>

        <!-- Dept breakdown table -->
        <div class="table-section">
          <div class="table-section-inner">
            <div class="report-table-scroll">
              <table class="data-table report-table">
                <thead>
                  <tr>
                    <th @click="tableSortBy(spendingSort, 'dept')" style="cursor:pointer">
                      Department {{ tableSortIndicator(spendingSort, 'dept') }}
                    </th>
                    <th
                      v-for="r in spendingResults"
                      :key="r.label"
                      @click="tableSortBy(spendingSort, r.label)"
                      style="text-align:right; cursor:pointer"
                    >
                      {{ r.label }} {{ tableSortIndicator(spendingSort, r.label) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="dept in sortedSpendingDepts" :key="dept">
                    <td data-label="Department">{{ dept }}</td>
                    <td
                      v-for="r in spendingResults"
                      :key="r.label"
                      :data-label="r.label"
                      style="text-align:right; font-variant-numeric: tabular-nums"
                    >
                      ${{ formatCurrency(r.byDept.find(d => d.dept === dept)?.total ?? 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- ── EARNINGS SECTION ─────────────────────────────────────────────── -->
    <div class="section-header" @click="showEarningsSection = !showEarningsSection">
      <span class="chevron">{{ showEarningsSection ? '▼' : '▶' }}</span>
      <h2>Annual Earnings Overview</h2>
    </div>
    <section class="report-section" v-show="showEarningsSection">

      <div v-if="loadingEarnings" class="loading"><div class="spinner"></div></div>
      <div v-else-if="errorEarnings" class="error"><p>{{ errorEarnings }}</p></div>

      <template v-else-if="earningsResults.length">
        <div class="stats-grid">
          <div v-for="r in earningsResults" :key="r.label" class="stat-card">
            <div class="stat-label">{{ r.label }} Total Payroll</div>
            <div class="stat-value">${{ formatCurrency(r.total) }}</div>
            <div class="stat-sub">{{ formatNumber(r.count) }} employees</div>
          </div>
        </div>

        <div v-if="earningsResults.length > 1" class="stats-grid yoy-grid">
          <div
            v-for="(change, i) in earningsYoY"
            :key="i"
            class="stat-card"
          >
            <div class="stat-label">{{ earningsResults[i].label }} → {{ earningsResults[i + 1].label }}</div>
            <div
              class="stat-value"
              :class="change !== null && change >= 0 ? 'change-positive' : 'change-negative'"
            >
              {{ change !== null ? (change >= 0 ? '+' : '') + change.toFixed(1) + '%' : 'N/A' }}
            </div>
            <div class="stat-sub">year-over-year</div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3>Total Payroll by Year</h3>
            <div class="chart-wrap"><canvas ref="earningsTotalRef"></canvas></div>
          </div>
          <div class="chart-card">
            <h3>Top Departments by Payroll</h3>
            <div class="chart-wrap"><canvas ref="earningsDeptRef"></canvas></div>
          </div>
        </div>

        <div class="table-section">
          <div class="table-section-inner">
            <div class="report-table-scroll">
              <table class="data-table report-table">
                <thead>
                  <tr>
                    <th @click="tableSortBy(earningsSort, 'dept')" style="cursor:pointer">
                      Department {{ tableSortIndicator(earningsSort, 'dept') }}
                    </th>
                    <th
                      v-for="r in earningsResults"
                      :key="r.label"
                      @click="tableSortBy(earningsSort, r.label)"
                      style="text-align:right; cursor:pointer"
                    >
                      {{ r.label }} {{ tableSortIndicator(earningsSort, r.label) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="dept in sortedEarningsDepts" :key="dept">
                    <td data-label="Department">{{ dept }}</td>
                    <td
                      v-for="r in earningsResults"
                      :key="r.label"
                      :data-label="r.label"
                      style="text-align:right; font-variant-numeric: tabular-nums"
                    >
                      ${{ formatCurrency(r.byDept.find(d => d.dept === dept)?.total ?? 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </section>

  </div>
</template>

<style scoped>
/* ── Report sections ──────────────────────────────────────────────────────*/
.report-section {
  margin-bottom: 3rem;
}

.section-title {
  color: #2c3e50;
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #667eea;
}

.section-subtitle {
  color: #6c757d;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
  margin-top: 0.25rem;
}

/* ── Stat card extras ─────────────────────────────────────────────────────*/
.stat-sub {
  font-size: 0.75rem;
  color: #6c757d;
  margin-top: 0.3rem;
}

.yoy-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-top: -0.75rem;
  margin-bottom: 1.5rem;
}

.change-positive {
  color: #27ae60 !important;
}

.change-negative {
  color: #e74c3c !important;
}

/* ── Chart height override ────────────────────────────────────────────────*/
.chart-wrap {
  position: relative;
  height: 300px;
}

.chart-wrap canvas {
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  aspect-ratio: unset !important;
}

/* ── Report table — horizontal scroll on desktop, card layout on mobile ───*/
.report-table-scroll {
  overflow-x: auto;
}

/* ── Dark mode ────────────────────────────────────────────────────────────*/
:global(body.dark-mode) .section-title {
  color: #f1f5f9;
}

:global(body.dark-mode) .section-subtitle {
  color: #94a3b8;
}

:global(body.dark-mode) .stat-sub {
  color: #64748b;
}

</style>
