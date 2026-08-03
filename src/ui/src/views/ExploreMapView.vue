<template>
  <div class="explore-view">
    <div class="explore-header">
      <h1>Explore Map</h1>
      <p class="subtitle">
        Records from across Boston&apos;s public datasets, aggregated for the area you&apos;re viewing.
        Datasets appear in the legend as their pins load. Pan or zoom the map and press
        <b>Search This Area</b> to refresh, or adjust how many records to show per dataset via the "Max per dataset" drop-down. Selecting a dataset from the key removes its pins from the map..
        Select a pin for details.
      </p>
    </div>

    <div class="explore-map-wrapper">
      <div id="explore-map" class="explore-map-container"></div>

      <!-- Search this area -->
      <button
        v-if="showSearchArea"
        class="search-btn explore-search-area"
        :disabled="loading"
        @click="searchArea"
      >
        {{ loading ? 'Searching…' : 'Search This Area' }}
      </button>

      <!-- Legend -->
      <div class="explore-legend" role="group" aria-label="Dataset filters">
        <div class="explore-legend-title">
          Datasets
          <span class="explore-legend-total">{{ totalPins }} pin{{ totalPins === 1 ? '' : 's' }}</span>
        </div>

        <div class="explore-legend-controls">
          <label for="explore-limit">Max per dataset</label>
          <select
            id="explore-limit"
            class="explore-limit-select"
            v-model.number="perDatasetLimit"
            :disabled="loading"
            @change="searchArea"
          >
            <option v-for="opt in LIMIT_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <button
          v-for="ds in datasetsForLegend"
          :key="ds.key"
          class="explore-legend-item"
          :class="{ 'is-off': !ds.active }"
          @click="toggleDataset(ds.key)"
          :aria-pressed="ds.active"
        >
          <span class="explore-legend-dot" :style="{ backgroundColor: ds.color }"></span>
          <span class="explore-legend-label">{{ ds.label }}</span>
          <span class="explore-legend-count">{{ ds.count }}</span>
        </button>

        <div v-if="loading" class="explore-legend-status">Loading datasets…</div>
        <div v-else-if="datasetsForLegend.length === 0" class="explore-legend-status">
          No records in this area yet.
        </div>
        <div v-else-if="overlayLoading" class="explore-legend-status">Searching more datasets…</div>
      </div>

      <!-- Loading / error banners -->
      <div v-if="loading" class="explore-banner">Loading records for this area…</div>
      <div v-else-if="error" class="explore-banner explore-banner-error">{{ error }}</div>
      <div v-else-if="!loading && totalPins === 0" class="explore-banner">
        No records found in this area. Try moving the map and searching again.
      </div>

      <!-- Detail panel -->
      <div v-if="selected" class="explore-detail">
        <button class="explore-detail-close" aria-label="Close details" @click="selected = null">×</button>
        <div class="explore-detail-tag" :style="{ backgroundColor: selected.dataset.color }">
          {{ selected.dataset.label }}
        </div>
        <h3 class="explore-detail-title">{{ selected.dataset.title(selected.record) }}</h3>
        <p v-if="selected.dataset.subtitle(selected.record)" class="explore-detail-subtitle">
          {{ selected.dataset.subtitle(selected.record) }}
        </p>
        <dl class="explore-detail-list">
          <template v-for="row in detailRows" :key="row[0]">
            <div class="explore-detail-row">
              <dt>{{ row[0] }}</dt>
              <dd>{{ row[1] }}</dd>
            </div>
          </template>
        </dl>
        <button class="apply-btn explore-detail-link" @click="openExplorer">
          View in {{ selected.dataset.label }} explorer →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ALL_DATASETS,
  COORDINATE_DATASETS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  GEOCODE_DATASETS,
  buildRecordLink,
} from '../utils/exploreMapDatasets'
import { fetchCoordinateDataset, fetchGeocodeSample, geocode } from '../utils/exploreMapData'
import { useMapDisplay } from '../utils/mapUtils'

const MAP_ID = 'explore-map'
const LIMIT_OPTIONS = [25, 50, 100, 200, 500]
// Geocoding is slow (throttled) and unreliable, so we only ever attempt a small
// recent sample per address-only dataset regardless of the display limit.
const GEOCODE_SAMPLE_CAP = 15
const GEOCODE_THROTTLE_MS = 1100

const { mapInstance, isMapReady, initializeMap, invalidateSize, destroyMap } = useMapDisplay(MAP_ID)

const loading = ref(false)
const overlayLoading = ref(false)
const error = ref('')
const showSearchArea = ref(false)
const selected = ref(null)
const counts = ref({})
const perDatasetLimit = ref(100)
const activeKeys = ref(new Set(ALL_DATASETS.map((d) => d.key)))

let L = null
let markerLayer = null
let allMarkers = []
let searchAbort = null
let overlayAbort = null
let lastSearchCenter = null
let lastSearchZoom = DEFAULT_ZOOM

// Only surface datasets that actually returned pins. Coordinate datasets show
// up as soon as the area search resolves; address-only datasets pop in later,
// once geocoding produces at least one in-bounds result — so nothing ever sits
// in the list at a count of 0.
const datasetsForLegend = computed(() =>
  ALL_DATASETS.filter((d) => (counts.value[d.key] || 0) > 0).map((d) => ({
    key: d.key,
    label: d.label,
    color: d.color,
    count: counts.value[d.key] || 0,
    active: activeKeys.value.has(d.key),
  }))
)

const totalPins = computed(() =>
  Object.values(counts.value).reduce((sum, n) => sum + n, 0)
)

const detailRows = computed(() => {
  if (!selected.value) return []
  return selected.value.dataset.details(selected.value.record).filter((row) => row[1])
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function getBounds() {
  const b = mapInstance.value.getBounds()
  return {
    south: b.getSouth(),
    north: b.getNorth(),
    west: b.getWest(),
    east: b.getEast(),
  }
}

function makeMarker(ds, lat, lon, record) {
  const marker = L.circleMarker([lat, lon], {
    radius: 7,
    color: '#ffffff',
    weight: 1.5,
    fillColor: ds.color,
    fillOpacity: 0.9,
  })
  const title = ds.title(record)
  marker.bindTooltip(`<b>${escapeHtml(ds.label)}</b><br>${escapeHtml(title)}`, {
    direction: 'top',
  })
  marker.on('click', () => {
    selected.value = { dataset: ds, record }
  })
  return marker
}

function renderMarkers() {
  if (!markerLayer) return
  markerLayer.clearLayers()
  for (const { key, marker } of allMarkers) {
    if (activeKeys.value.has(key)) marker.addTo(markerLayer)
  }
}

function toggleDataset(key) {
  const next = new Set(activeKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  activeKeys.value = next
  renderMarkers()
}

async function searchArea() {
  if (!isMapReady.value || !mapInstance.value) return

  if (searchAbort) searchAbort.abort()
  if (overlayAbort) overlayAbort.abort()
  searchAbort = new AbortController()

  loading.value = true
  error.value = ''
  showSearchArea.value = false
  selected.value = null

  const bounds = getBounds()
  lastSearchCenter = mapInstance.value.getCenter()
  lastSearchZoom = mapInstance.value.getZoom()

  allMarkers = []
  const newCounts = {}

  try {
    const results = await Promise.all(
      COORDINATE_DATASETS.map(async (ds) => {
        try {
          const pts = await fetchCoordinateDataset(ds, bounds, perDatasetLimit.value, searchAbort.signal)
          return { ds, pts }
        } catch (e) {
          if (e.name === 'AbortError') throw e
          console.warn('[exploreMap] fetch failed for', ds.key, e.message)
          return { ds, pts: [] }
        }
      })
    )

    for (const { ds, pts } of results) {
      newCounts[ds.key] = pts.length
      for (const p of pts) {
        allMarkers.push({ key: ds.key, marker: makeMarker(ds, p.lat, p.lon, p.record) })
      }
    }
    counts.value = newCounts
    renderMarkers()
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = 'Could not load records for this area. Please try again.'
    }
  } finally {
    loading.value = false
  }

  runGeocodeOverlay(bounds)
}

// Best-effort secondary overlay: address-only datasets can't be area-filtered
// server-side, so we fetch a small recent sample, geocode it (throttled to
// respect Nominatim), and drop any pins that fall within the searched bounds.
async function runGeocodeOverlay(bounds) {
  if (overlayAbort) overlayAbort.abort()
  overlayAbort = new AbortController()
  const signal = overlayAbort.signal
  overlayLoading.value = true

  try {
    const sampleSize = Math.min(perDatasetLimit.value, GEOCODE_SAMPLE_CAP)
    for (const ds of GEOCODE_DATASETS) {
      if (signal.aborted) return

      let records = []
      try {
        records = await fetchGeocodeSample(ds, sampleSize, signal)
      } catch (e) {
        if (e.name === 'AbortError') return
        continue
      }

      // Geocode the entire sample for this dataset BEFORE touching the UI.
      // The dataset is only revealed once its geocoding is fully done and it
      // has at least one in-bounds pin — so it never flickers in at a count of
      // 0 or with a partial, growing count while work is still in progress.
      const found = []
      for (const record of records) {
        if (signal.aborted) return
        const address = ds.address(record)
        if (!address) continue

        const coords = await geocode(address, signal)
        await sleep(GEOCODE_THROTTLE_MS)
        if (signal.aborted) return
        if (!coords || isNaN(coords.lat) || isNaN(coords.lon)) continue
        if (
          coords.lat < bounds.south ||
          coords.lat > bounds.north ||
          coords.lon < bounds.west ||
          coords.lon > bounds.east
        )
          continue

        found.push({ coords, record })
      }

      if (signal.aborted) return
      if (found.length === 0) continue

      // Commit the finished dataset in one shot: add all its markers, set its
      // count, and render. This is what adds it to the legend.
      for (const { coords, record } of found) {
        allMarkers.push({ key: ds.key, marker: makeMarker(ds, coords.lat, coords.lon, record) })
      }
      counts.value = { ...counts.value, [ds.key]: found.length }
      renderMarkers()
    }
  } finally {
    if (!signal.aborted) overlayLoading.value = false
  }
}

function onMoveEnd() {
  if (!mapInstance.value || loading.value || !lastSearchCenter) return
  const center = mapInstance.value.getCenter()
  const b = mapInstance.value.getBounds()
  const diagonal = mapInstance.value.distance(b.getNorthWest(), b.getSouthEast())
  const moved = mapInstance.value.distance(center, lastSearchCenter)
  const zoomChanged = mapInstance.value.getZoom() !== lastSearchZoom
  if (moved > diagonal * 0.25 || zoomChanged) {
    showSearchArea.value = true
  }
}

function openExplorer() {
  if (!selected.value) return
  // Navigate to the dataset's explorer with an exact-match filter applied for
  // the selected record, so it's surfaced when the explorer loads.
  window.location.hash = buildRecordLink(selected.value.dataset, selected.value.record)
}

onMounted(async () => {
  await initializeMap()
  L = window.L
  if (!L || !mapInstance.value) {
    error.value = 'The map failed to load. Please refresh the page.'
    return
  }
  mapInstance.value.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
  markerLayer = L.layerGroup().addTo(mapInstance.value)
  invalidateSize()
  mapInstance.value.on('moveend', onMoveEnd)
  await searchArea()
})

onBeforeUnmount(() => {
  if (searchAbort) searchAbort.abort()
  if (overlayAbort) overlayAbort.abort()
  if (mapInstance.value) mapInstance.value.off('moveend', onMoveEnd)
  destroyMap()
})
</script>
