import { getApiUrl } from './env'

// Build a bounding-box WHERE clause for a native-coordinate dataset.
// Text columns need a regex guard so empty / non-numeric values don't blow up
// the ::numeric cast for the whole query. Numeric columns compare directly.
function buildBoundsSql(ds, bounds, limit) {
  const south = bounds.south
  const north = bounds.north
  const west = bounds.west
  const east = bounds.east
  const lat = `"${ds.latField}"`
  const lon = `"${ds.lonField}"`

  let where
  if (ds.coordType === 'text') {
    where =
      `${lat} ~ '^-?[0-9]' AND ${lat}::numeric BETWEEN ${south} AND ${north} ` +
      `AND ${lon} ~ '^-?[0-9]' AND ${lon}::numeric BETWEEN ${west} AND ${east}`
  } else {
    where =
      `${lat} BETWEEN ${south} AND ${north} AND ${lon} BETWEEN ${west} AND ${east}`
  }

  return `SELECT * FROM "${ds.resourceId}" WHERE ${where} LIMIT ${limit}`
}

// Fetch records for a coordinate dataset within the given bounds.
// Returns [{ lat, lon, record }] for valid coordinates only.
export async function fetchCoordinateDataset(ds, bounds, limit, signal) {
  const sql = buildBoundsSql(ds, bounds, limit)
  const url = getApiUrl(`${ds.endpoint}?sql=${encodeURIComponent(sql)}`)
  const res = await fetch(url, { signal })
  const data = await res.json()
  if (!data.success || !data.result || !Array.isArray(data.result.records)) return []

  const points = []
  for (const record of data.result.records) {
    const lat = parseFloat(record[ds.latField])
    const lon = parseFloat(record[ds.lonField])
    if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
      points.push({ lat, lon, record })
    }
  }
  return points
}

// Fetch a small recent sample of an address-only dataset (no server-side area
// filter is possible). Returns raw records; the caller geocodes them.
export async function fetchGeocodeSample(ds, limit, signal) {
  const orderBy = ds.orderBy ? `ORDER BY "${ds.orderBy}" DESC NULLS LAST` : ''
  const sql = `SELECT * FROM "${ds.resourceId}" ${orderBy} LIMIT ${limit}`
  const url = getApiUrl(`${ds.endpoint}?sql=${encodeURIComponent(sql)}`)
  const res = await fetch(url, { signal })
  const data = await res.json()
  if (!data.success || !data.result || !Array.isArray(data.result.records)) return []
  return data.result.records
}

// Throttled Nominatim geocoder shared across the overlay pass.
export async function geocode(address, signal) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { signal }
    )
    const data = await res.json()
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[exploreMap] geocode failed:', err.message)
  }
  return null
}
