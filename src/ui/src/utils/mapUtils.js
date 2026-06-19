import { ref } from "vue"

export function useMapDisplay(mapId) {
  const mapInstance = ref(null)
  const isMapReady = ref(false)
  const mapInitError = ref(null)

  const ensureLeafletLoaded = () => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.L) {
        resolve()
        return
      }

      if (typeof window === "undefined") {
        console.warn("[mapUtils] Window undefined")
        return
      }

      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      document.head.appendChild(link)

      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
      script.onload = () => resolve()
      script.onerror = () => {
        mapInitError.value = "Failed to load Leaflet library"
        console.error("[mapUtils] Failed to load Leaflet")
      }
      document.head.appendChild(script)
    })
  }

  const createMap = async () => {
    try {
      await ensureLeafletLoaded()
      const container = document.getElementById(mapId)
      if (!container) {
        mapInitError.value = `Map container with id '${mapId}' not found`
        return
      }
      if (mapInstance.value) return
      if (!window.L) {
        mapInitError.value = "Leaflet not loaded"
        return
      }

      // Default view (Boston)
      mapInstance.value = window.L.map(mapId).setView([42.3601, -71.0589], 12)
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(mapInstance.value)

      isMapReady.value = true

      // Fix: tiles only render in the corner until Leaflet knows the real container
      // size. This happens when the map is inside a v-show section that was hidden
      // during initialization, or when CSS hasn't finished painting. A short
      // requestAnimationFrame + invalidateSize() forces a full tile reload once
      // the browser has actually laid out the container.
      requestAnimationFrame(() => {
        mapInstance.value?.invalidateSize()
      })
    } catch (error) {
      mapInitError.value = error.message
      console.error("[mapUtils] Map creation error:", error)
    }
  }

  const initializeMap = async () => {
    if (!mapInstance.value && !isMapReady.value) {
      await createMap()
    } else if (mapInstance.value && isMapReady.value) {
      // Already initialized — just make sure size is correct in case the
      // container was hidden (v-show) when the map was first created.
      requestAnimationFrame(() => {
        mapInstance.value?.invalidateSize()
      })
    }
  }

  // Helper to convert address to coordinates using Nominatim (OSM)
  const geocodeAddress = async (address) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
      )
      const data = await response.json()
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        }
      }
      return null
    } catch (error) {
      console.error("[mapUtils] Geocoding error:", error)
      return null
    }
  }

  // Accepts an optional address string for geocoding fallback.
  // Always calls invalidateSize() before panning so tiles fill the container
  // even if the map section was collapsed when the map was initialized.
  const displayLocation = async (lat, lon, label = "", address = "") => {
    if (!mapInstance.value || !isMapReady.value) {
      await initializeMap()
      setTimeout(() => displayLocation(lat, lon, label, address), 500)
      return
    }

    try {
      let finalLat = lat
      let finalLon = lon

      // If coordinates are missing, attempt to geocode the address
      if ((!finalLat || !finalLon) && address) {
        const coords = await geocodeAddress(address)
        if (coords) {
          finalLat = coords.lat
          finalLon = coords.lon
        }
      }

      clearMarkers()

      // Ensure we have valid numbers before calling Leaflet to avoid the 'null' error
      if (finalLat != null && finalLon != null && !isNaN(finalLat) && !isNaN(finalLon)) {
        // invalidateSize before setView so Leaflet has correct dimensions when
        // it calculates which tiles to request.
        mapInstance.value.invalidateSize()
        mapInstance.value.setView([finalLat, finalLon], 15)
        window.L.marker([finalLat, finalLon])
          .bindPopup(label)
          .addTo(mapInstance.value)
          .openPopup()
      } else {
        console.warn("[mapUtils] Could not resolve coordinates for:", address || label)
      }
    } catch (error) {
      console.error("[mapUtils] Error displaying location:", error)
    }
  }

  const displayAllLocations = async (markers) => {
    if (!mapInstance.value || !isMapReady.value) {
      await initializeMap()
      setTimeout(() => displayAllLocations(markers), 500)
      return
    }

    try {
      clearMarkers()

      // Filter out null, NaN, and (0, 0) sentinel coordinates
      const valid = markers.filter(
        (m) => m.lat != null && m.lon != null &&
               !isNaN(m.lat) && !isNaN(m.lon) &&
               !(m.lat === 0 && m.lon === 0)
      )
      if (valid.length === 0) return

      valid.forEach(({ lat, lon, label }) => {
        window.L.marker([lat, lon]).bindPopup(label).addTo(mapInstance.value)
      })

      const bounds = valid.map(({ lat, lon }) => [lat, lon])

      // Run invalidateSize and fitBounds in the same rAF so Leaflet reads the
      // final container dimensions immediately before calculating the zoom.
      // Splitting them across frames (sync invalidate → next-frame fitBounds)
      // lets a layout change sneak in between the two calls.
      requestAnimationFrame(() => {
        if (!mapInstance.value) return
        mapInstance.value.invalidateSize()
        if (bounds.length === 1) {
          mapInstance.value.setView(bounds[0], 15)
        } else {
          mapInstance.value.fitBounds(bounds, { padding: [50, 50] })
        }
      })
    } catch (error) {
      console.error("[mapUtils] Error displaying all locations:", error)
    }
  }

  // Call this whenever the map's containing v-show section is toggled open.
  // Components can watch their showMap ref and call this on true.
  const invalidateSize = () => {
    if (mapInstance.value && isMapReady.value) {
      requestAnimationFrame(() => {
        mapInstance.value?.invalidateSize()
      })
    }
  }

  const clearMarkers = () => {
    if (mapInstance.value && window.L) {
      mapInstance.value.eachLayer((layer) => {
        if (layer instanceof window.L.Marker || layer instanceof window.L.Popup) {
          mapInstance.value.removeLayer(layer)
        }
      })
    }
  }

  const destroyMap = () => {
    if (mapInstance.value) {
      mapInstance.value.remove()
      mapInstance.value = null
      isMapReady.value = false
    }
  }

  return {
    mapInstance,
    isMapReady,
    mapInitError,
    initializeMap,
    displayLocation,
    displayAllLocations,
    geocodeAddress,
    invalidateSize,
    clearMarkers,
    destroyMap,
    ensureLeafletLoaded,
  }
}
