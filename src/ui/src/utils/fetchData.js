import { getApiUrl } from './env'
import { buildWhereClause } from './queryBuilder'

/**
 * Shared utility to fetch data from the Boston API via the SQL endpoint.
 */
export const fetchData = async ({
  endpoint,
  records,
  loading,
  error,
  totalRecords = null,
  totalDatasetRecords = null,
  aggregateResults = null,
  offset = null,
  limit = 100,
  sqlConfig = null, // { resourceId, clauses, aggregates }
  orderBy = null,       // column name — gets double-quoted
  orderByExpr = null,   // raw SQL expression — used as-is (overrides orderBy)
  resourceId = null,
  errorPrefix = 'data',
  onSuccess = null
}) => {
  loading.value = true
  error.value = ''

  const effectiveResourceId = sqlConfig?.resourceId ?? resourceId

  try {
    const requests = []
    const clauses = sqlConfig?.clauses ?? []
    const whereClause = buildWhereClause(clauses)
    const orderByClause = orderByExpr
      ? `ORDER BY ${orderByExpr} DESC NULLS LAST`
      : orderBy
        ? `ORDER BY "${orderBy}" DESC NULLS LAST`
        : ''
    const offsetValue = offset?.value ?? offset ?? 0
    const sql = `SELECT * FROM "${effectiveResourceId}" ${whereClause} ${orderByClause} LIMIT ${limit} OFFSET ${offsetValue}`
    const dataUrl = getApiUrl(`${endpoint}?sql=${encodeURIComponent(sql)}`)

    if (totalRecords) {
      const countSql = `SELECT COUNT(*) as total FROM "${effectiveResourceId}" ${whereClause}`
      const countUrl = getApiUrl(`${endpoint}?sql=${encodeURIComponent(countSql)}&count_only=true`)
      requests.push(fetch(countUrl).then(r => r.json()))
    }

    if (totalDatasetRecords) {
      const datasetCountSql = `SELECT COUNT(*) as total FROM "${effectiveResourceId}"`
      const datasetCountUrl = getApiUrl(`${endpoint}?sql=${encodeURIComponent(datasetCountSql)}&count_only=true`)
      requests.push(fetch(datasetCountUrl).then(r => r.json()))
    }

    if (sqlConfig?.aggregates) {
      const aggSql = `SELECT ${sqlConfig.aggregates} FROM "${effectiveResourceId}" ${whereClause}`
      const aggUrl = getApiUrl(`${endpoint}?sql=${encodeURIComponent(aggSql)}&aggregate=true`)
      requests.push(fetch(aggUrl).then(r => r.json()))
    }

    requests.unshift(fetch(dataUrl).then(r => r.json()))

    const responses = await Promise.all(requests)
    const data = responses[0]

    if (data.success) {
      records.value = data.result.records

      if (totalRecords) {
        if (responses[1] && responses[1].success && responses[1].result.records.length > 0) {
          const total = responses[1].result.records[0].total || responses[1].result.records[0].Total || 0
          totalRecords.value = Number(total)
        } else {
          totalRecords.value = 0
        }
      }

      if (totalDatasetRecords) {
        const datasetCountIndex = totalRecords ? 2 : 1
        if (responses[datasetCountIndex] && responses[datasetCountIndex].success && responses[datasetCountIndex].result.records.length > 0) {
          const total = responses[datasetCountIndex].result.records[0].total || responses[datasetCountIndex].result.records[0].Total || 0
          totalDatasetRecords.value = Number(total)
        }
      }

      if (sqlConfig?.aggregates) {
        const aggIndex = (totalRecords ? 1 : 0) + (totalDatasetRecords ? 1 : 0) + 1
        const aggData = responses[aggIndex]
        if (aggData && aggData.success && aggData.result.records.length > 0) {
          if (aggregateResults) {
            aggregateResults.value = aggData.result.records[0]
          }
        }
      }

      if (onSuccess) {
        onSuccess()
      }
    } else {
      error.value = data.message || 'Error fetching data'
    }
  } catch (err) {
    console.error(err)
    error.value = `Error fetching ${errorPrefix}: ${err.message}`
  } finally {
    loading.value = false
  }
}
