<!--
Copyright (c) 2026 Toni Tone, LLC
-->
<script setup>
import Chart from 'chart.js/auto'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollapsibleSections, useHelpModal, useMostRecentDate, usePersistedFilters, useSortable } from '../composables/composables'
import { chartColors, getColor } from '../utils/chartUtils'
import { fetchData } from '../utils/fetchData'
import { formatCurrency, formatDate, formatNumber } from '../utils/format'
import { useMapDisplay } from '../utils/mapUtils'

const { sortField, sortDirection, sortBy, getSortIndicator, sortRecords } = useSortable()
const helpModal = useHelpModal()
const { getMostRecentDate } = useMostRecentDate()

const bills = ref([])
const loading = ref(false)
const error = ref(null)
const selectedBill = ref(null)
const totalRecords = ref(0)
const totalDatasetRecords = ref(0)
const resourceId = '35fad26c-1400-46b0-846c-3bb6ca8f74d0'

const filters = ref({
  energyTypes: [],
  departments: [],
  limit: 100,
  offset: 0,
  fromDate: '',
  toDate: '',
})

const departmentInput = ref('')

const { clear: clearUtilityFilters } = usePersistedFilters('utility')
// Auto-save utility filters (exclude offset — always start at page 1 on restore)
watch(filters, () => {
  try {
    const { offset: _, ...toSave } = filters.value
    localStorage.setItem('boston-filter-utility', JSON.stringify(toSave))
  } catch (e) {}
}, { deep: true })

// Most recent record date
const mostRecentDate = computed(() => {
  const date = getMostRecentDate(bills.value, 'InvoiceDate')
  return date ? formatDate(date) : 'N/A'
})

// Statistics - computed from current page data
const stats = computed(() => {
  if (bills.value.length === 0) {
    return {
      total_records: totalRecords.value,
      total_dataset: totalDatasetRecords.value,
      total_cost: 0,
      avg_cost: 0,
      total_consumption: 0
    }
  }

  const totalCost = bills.value.reduce((sum, bill) => {
    const cost = parseFloat(bill.TotalCost) || 0
    return sum + cost
  }, 0)

  const totalConsumption = bills.value.reduce((sum, bill) => {
    const consumption = parseFloat(bill.TotalConsumption) || 0
    return sum + consumption
  }, 0)

  return {
    total_records: totalRecords.value,
    total_dataset: totalDatasetRecords.value,
    total_cost: totalCost,
    avg_cost: totalCost / bills.value.length,
    total_consumption: totalConsumption
  }
})

const sortedBills = computed(() => {
  if (!sortField.value) return bills.value
  return sortRecords(bills.value, sortField.value)
})

const { initializeMap, displayLocation, destroyMap, invalidateSize } = useMapDisplay('map')
const { showCharts, showMap, showTable, notifyMapVisible } = useCollapsibleSections(invalidateSize)

const fetchUtilityBills = async () => {
  const clauses = []

  // Build SQL WHERE clauses for filters
  if (filters.value.energyTypes.length > 0) {
    const energyTypesClause = filters.value.energyTypes
      .map(t => `"EnergyTypeName" = '${t}'`)
      .join(' OR ')
    clauses.push(`(${energyTypesClause})`)
  }

  if (filters.value.departments.length > 0) {
    const deptClause = filters.value.departments
      .map(d => `UPPER("DepartmentName") LIKE UPPER('%${d}%')`)
      .join(' OR ')
    clauses.push(`(${deptClause})`)
  }

  if (filters.value.fromDate) {
    clauses.push(`"InvoiceDate" >= '${filters.value.fromDate}'`)
  }

  if (filters.value.toDate) {
    clauses.push(`"InvoiceDate" <= '${filters.value.toDate}'`)
  }

  await fetchData({
    endpoint: '/api/utility-bills',
    records: bills,
    loading,
    error,
    totalRecords,
    totalDatasetRecords,
    offset: filters.value.offset,
    limit: filters.value.limit,
    sqlConfig: { resourceId, clauses },
    orderBy: 'InvoiceDate',
    errorPrefix: 'utility bill data',
    onSuccess: () => {
      if (bills.value.length > 0) {
        nextTick(() => {
          setTimeout(() => {
            initializeMap()
            selectedBill.value = null
          }, 100)
        })
      }
    }
  })
}

const addEnergyType = (e) => {
  const val = e.target.value
  if (val && !filters.value.energyTypes.includes(val)) {
    filters.value.energyTypes.push(val)
    filters.value.offset = 0
    fetchUtilityBills()
  }
  e.target.value = ''
}

const removeEnergyType = (t) => {
  filters.value.energyTypes = filters.value.energyTypes.filter(x => x !== t)
  filters.value.offset = 0
  fetchUtilityBills()
}

const addDepartment = () => {
  const val = departmentInput.value.trim()
  if (val && !filters.value.departments.includes(val)) {
    filters.value.departments.push(val)
    filters.value.offset = 0
    departmentInput.value = ''
    fetchUtilityBills()
  }
}

const removeDepartment = (d) => {
  filters.value.departments = filters.value.departments.filter(x => x !== d)
  filters.value.offset = 0
  fetchUtilityBills()
}

const resetFilters = () => {
  clearUtilityFilters()
  filters.value = {
    energyTypes: [],
    departments: [],
    limit: 100,
    offset: 0,
    fromDate: '',
    toDate: '',
  }
  departmentInput.value = ''
  fetchUtilityBills()
}

const onLimitChange = () => {
  filters.value.offset = 0
  fetchUtilityBills()
}

const nextPage = () => {
  filters.value.offset += filters.value.limit
  fetchUtilityBills()
}

const previousPage = () => {
  filters.value.offset = Math.max(0, filters.value.offset - filters.value.limit)
  fetchUtilityBills()
}

const currentPage = computed(() => Math.floor(filters.value.offset / filters.value.limit) + 1)
const totalPages = computed(() => Math.ceil(totalRecords.value / filters.value.limit))
const startRecord = computed(() => totalRecords.value === 0 ? 0 : filters.value.offset + 1)
const endRecord = computed(() => Math.min(filters.value.offset + filters.value.limit, totalRecords.value))

const selectBill = async (bill) => {
  selectedBill.value = bill
  const address = `${bill.StreetAddress}, ${bill.City}, ${bill.StateName} ${bill.Zip}`
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
    const data = await res.json()
    if (data && data.length > 0) {
      const { lat, lon } = data[0]
      displayLocation(parseFloat(lat), parseFloat(lon), `<strong>${bill.SiteName || bill.StreetAddress}</strong><br>${bill.StreetAddress}`)
    }
  } catch (err) {
    console.error(err)
  }
}

// Chart Logic
const costByEnergyRef = ref(null)
const costByDeptRef = ref(null)
const consumptionByEnergyRef = ref(null)

let costByEnergyChart, costByDeptChart, consumptionByEnergyChart

const aggregateByEnergy = computed(() => {
  const map = new Map()
  bills.value.forEach(r => {
    const energy = r['EnergyTypeName'] || 'Unknown'
    const cost = parseFloat(r.TotalCost) || 0
    map.set(energy, (map.get(energy) || 0) + cost)
  })
  return Array.from(map.entries())
    .map(([energy, cost]) => ({ energy, cost }))
    .filter(d => d.cost > 0)
    .sort((a, b) => b.cost - a.cost)
})

const aggregateByDept = computed(() => {
  const map = new Map()
  bills.value.forEach(r => {
    const dept = r['DepartmentName'] || 'Unknown'
    const cost = parseFloat(r.TotalCost) || 0
    map.set(dept, (map.get(dept) || 0) + cost)
  })
  return Array.from(map.entries())
    .map(([dept, cost]) => ({ dept, cost }))
    .filter(d => d.cost > 0)
    .sort((a, b) => b.cost - a.cost)
})

const aggregateConsumption = computed(() => {
  const map = new Map()
  bills.value.forEach(r => {
    const energy = r['EnergyTypeName'] || 'Unknown'
    const consumption = parseFloat(r.TotalConsumption) || 0
    map.set(energy, (map.get(energy) || 0) + consumption)
  })
  return Array.from(map.entries())
    .map(([energy, consumption]) => ({ energy, consumption }))
    .filter(d => d.consumption > 0)
    .sort((a, b) => b.consumption - a.consumption)
})

const renderCharts = async () => {
  if (loading.value || bills.value.length === 0) return
  await nextTick()

  if (costByEnergyChart) costByEnergyChart.destroy()
  if (costByDeptChart) costByDeptChart.destroy()
  if (consumptionByEnergyChart) consumptionByEnergyChart.destroy()

  // Cost by Energy Type Pie
  if (costByEnergyRef.value && aggregateByEnergy.value.length > 0) {
    const data = aggregateByEnergy.value.slice(0, 8)
    costByEnergyChart = new Chart(costByEnergyRef.value, {
      type: 'pie',
      data: {
        labels: data.map(d => d.energy),
        datasets: [{
          data: data.map(d => d.cost),
          backgroundColor: data.map((_, i) => getColor(i))
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

  // Cost by Department Bar
  if (costByDeptRef.value && aggregateByDept.value.length > 0) {
    const data = aggregateByDept.value.slice(0, 10)
    costByDeptChart = new Chart(costByDeptRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.dept),
        datasets: [{
          label: 'Total Cost',
          data: data.map(d => d.cost),
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

  // Consumption by Energy Type Bar
  if (consumptionByEnergyRef.value && aggregateConsumption.value.length > 0) {
    const data = aggregateConsumption.value
    consumptionByEnergyChart = new Chart(consumptionByEnergyRef.value, {
      type: 'bar',
      data: {
        labels: data.map(d => d.energy),
        datasets: [{
          label: 'Total Consumption',
          data: data.map(d => d.consumption),
          backgroundColor: chartColors.teal
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => formatNumber(v / 1000) + 'k' }
          }
        }
      }
    })
  }
}

watch([bills, loading], () => {
  renderCharts()
  if (!loading.value && bills.value.length > 0) {
    notifyMapVisible()
  }
})

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('boston-filter-utility') || 'null')
    if (saved) {
      if (saved.energyTypes) filters.value.energyTypes = saved.energyTypes
      if (saved.departments) filters.value.departments = saved.departments
      if (saved.fromDate != null) filters.value.fromDate = saved.fromDate
      if (saved.toDate != null) filters.value.toDate = saved.toDate
      if (saved.limit) filters.value.limit = saved.limit
    }
  } catch (e) {}
  fetchUtilityBills()
  setTimeout(initializeMap, 500)
})

onUnmounted(() => {
  if (destroyMap) destroyMap()
})
</script>

<template>
  <div class="data-explorer">
    <div class="explorer-header">
      <h1>Boston Utili-see</h1>
      <p class="subtitle">Explore utility billing data from the City of Boston</p>
      <button @click="helpModal.openHelpModal('Utility Bills', 'https://data.boston.gov/dataset/city-of-boston-utility-data', 'City of Boston utility billing data including electricity, gas, water, and other energy types across departments and facilities.')" class="help-btn">?</button>
    </div>

    <div v-if="stats" class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Records in Dataset</div>
        <div class="stat-value">{{ formatNumber(stats.total_dataset) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Records in Current Search</div>
        <div class="stat-value">{{ formatNumber(stats.total_records) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Cost (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(stats.total_cost) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Cost (Current Page)</div>
        <div class="stat-value">${{ formatCurrency(stats.avg_cost) }}</div>
      </div>
    </div>

    <div class="filters">
      <div class="filter-group">
        <label>Records per page:</label>
        <select v-model.number="filters.limit" @change="onLimitChange">
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
        <label for="energy-type">Energy Type:</label>
        <div class="multi-select-container">
          <div class="selected-items">
            <span v-if="filters.energyTypes.length === 0" class="placeholder">Select energy types...</span>
            <span v-for="type in filters.energyTypes" :key="type" class="selected-chip">
              {{ type }}
              <button @click="removeEnergyType(type)" class="remove-chip">&times;</button>
            </span>
          </div>
          <select id="energy-type" @change="addEnergyType($event)" class="multi-select">
            <option value="">Add energy type...</option>
            <option value="Water" :disabled="filters.energyTypes.includes('Water')">Water</option>
            <option value="Stormwater" :disabled="filters.energyTypes.includes('Stormwater')">Stormwater</option>
            <option value="Electric" :disabled="filters.energyTypes.includes('Electric')">Electric</option>
            <option value="Natural Gas" :disabled="filters.energyTypes.includes('Natural Gas')">Natural Gas</option>
            <option value="Steam" :disabled="filters.energyTypes.includes('Steam')">Steam</option>
            <option value="#2 Oil" :disabled="filters.energyTypes.includes('#2 Oil')">Oil</option>
          </select>
        </div>
      </div>

      <div class="filter-group">
        <label for="department">Department:</label>
        <div class="multi-select-container">
          <div class="selected-items">
            <span v-if="filters.departments.length === 0" class="placeholder">Select departments...</span>
            <span v-for="dept in filters.departments" :key="dept" class="selected-chip">
              {{ dept }}
              <button @click="removeDepartment(dept)" class="remove-chip">&times;</button>
            </span>
          </div>
          <input 
            id="department"
            type="text" 
            v-model="departmentInput" 
            @keydown.enter="addDepartment"
            placeholder="Type department and press Enter"
            class="department-input"
          />
        </div>
      </div>

      <div class="filter-group">
        <label for="from-date">From Date:</label>
        <input 
          id="from-date" 
          type="date" 
          v-model="filters.fromDate" 
          @change="fetchUtilityBills"
        />
      </div>

      <div class="filter-group">
        <label for="to-date">To Date:</label>
        <input 
          id="to-date" 
          type="date" 
          v-model="filters.toDate" 
          @change="fetchUtilityBills"
        />
      </div>

      <button @click="resetFilters" class="reset-btn">Reset Filters</button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading data...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchUtilityBills" class="retry-btn">Retry</button>
    </div>

    <div v-show="!loading && !error && bills.length > 0" class="content-container">
      <div class="section-header" @click="showCharts = !showCharts">
        <span class="chevron">{{ showCharts ? '▼' : '▶' }}</span>
        <h2>Charts & Analysis</h2>
      </div>
      <div v-show="showCharts" class="charts-grid">
        <div class="chart-card">
          <h3>Cost by Energy Type</h3>
          <canvas ref="costByEnergyRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Top Departments by Cost</h3>
          <canvas ref="costByDeptRef"></canvas>
        </div>
        <div class="chart-card">
          <h3>Consumption by Energy Type</h3>
          <canvas ref="consumptionByEnergyRef"></canvas>
        </div>
      </div>

      <!-- Map Section -->
      <div class="section-header" @click="showMap = !showMap">
        <span class="chevron">{{ showMap ? '▼' : '▶' }}</span>
        <h2>Location Map</h2>
      </div>
      <div v-show="showMap" class="map-section">
        <div class="map-header">
          <p v-if="selectedBill" class="selected-info">
            Selected: {{ selectedBill.StreetAddress }}, {{ selectedBill.City }}
          </p>
          <p v-else class="instruction-text">Click on a row to view location</p>
        </div>
        <div id="map" class="map-container"></div>
      </div>

      <!-- Table Section -->
      <div class="section-header" @click="showTable = !showTable">
        <span class="chevron">{{ showTable ? '▼' : '▶' }}</span>
        <h2>Utility Bill Records</h2>
      </div>
      <div v-show="showTable" class="table-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="sortBy('InvoiceID')" style="cursor: pointer;">
                  Invoice ID {{ getSortIndicator('InvoiceID') }}
                </th>
                <th @click="sortBy('EnergyTypeName')" style="cursor: pointer;">
                  Energy Type {{ getSortIndicator('EnergyTypeName') }}
                </th>
                <th @click="sortBy('InvoiceDate')" style="cursor: pointer;">
                  Invoice Date {{ getSortIndicator('InvoiceDate') }}
                </th>
                <th @click="sortBy('DepartmentName')" style="cursor: pointer;">
                  Department {{ getSortIndicator('DepartmentName') }}
                </th>
                <th @click="sortBy('StreetAddress')" style="cursor: pointer;">
                  Address {{ getSortIndicator('StreetAddress') }}
                </th>
                <th @click="sortBy('TotalConsumption')" style="cursor: pointer;">
                  Consumption {{ getSortIndicator('TotalConsumption') }}
                </th>
                <th @click="sortBy('TotalCost')" style="cursor: pointer;">
                  Total Cost {{ getSortIndicator('TotalCost') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="bill in sortedBills" 
                :key="bill.InvoiceID"
                @click="selectBill(bill)"
                :class="{ 'selected-row': selectedBill?.InvoiceID === bill.InvoiceID }"
                class="clickable-row"
              >
                <td data-label="Invoice ID">{{ bill.InvoiceID }}</td>
                <td data-label="Energy Type">
                  <span class="energy-badge" :class="'energy-' + (bill.EnergyTypeName ? bill.EnergyTypeName.toLowerCase().replace(' ', '-').replace('#', '') : 'unknown')">
                    {{ bill.EnergyTypeName }}
                  </span>
                </td>
                <td data-label="Invoice Date">{{ formatDate(bill.InvoiceDate) }}</td>
                <td data-label="Department">{{ bill.DepartmentName }}</td>
                <td data-label="Address">{{ bill.StreetAddress }}, {{ bill.City }}</td>
                <td data-label="Consumption">{{ formatNumber(bill.TotalConsumption) }} {{ bill.UomName }}</td>
                <td data-label="Total Cost" class="total-cost">${{ formatCurrency(bill.TotalCost) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="pagination" v-if="totalRecords > 0">
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
            
            <span class="page-info">
              Page {{ currentPage }} of {{ totalPages }}
            </span>
            
            <button 
              :disabled="currentPage === totalPages || bills.length < filters.limit" 
              @click="nextPage" 
              class="page-btn"
              title="Next Page"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && !error && bills.length === 0" class="empty-state">
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
