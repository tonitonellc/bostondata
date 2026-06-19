// Shared earnings dataset configuration.
// Used by EarningsView (per-year explorer) and AnnualReportsView (multi-year aggregates).

// deptCol: SQL column name for department GROUP BY in aggregate queries.
//   null = year uses a non-standard schema; skip dept breakdown in aggregate views.
// totalGrossIsNumeric: always false — upstream stores earnings as text across all years.
//   Kept for backward compatibility with EarningsView's filter-clause builder.
export const earningsYears = [
  { label: '2025', id: '29b3544f-752a-4cb1-a6af-a1de153d20a0', totalGrossKey: 'TOTAL GROSS',    totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2024', id: '579a4be3-9ca7-4183-bc95-7d67ee715b6d', totalGrossKey: 'TOTAL GROSS',    totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2023', id: '6b3c5333-1dcb-4b3d-9cd7-6a03fb526da7', totalGrossKey: 'TOTAL GROSS',    totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2022', id: '63ac638b-36c4-487d-9453-1d83eb5090d2', totalGrossKey: 'TOTAL_ GROSS',   totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2021', id: 'ec5aaf93-1509-4641-9310-28e62e028457', totalGrossKey: 'TOTAL_GROSS',    totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2020', id: 'e2e2c23a-6fc7-4456-8751-5321d8aa869b', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2019', id: '3bdfe6dc-3a81-49ce-accc-22161e2f7e74', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2018', id: '31358fd1-849a-48e0-8285-e813f6efbdf1', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2017', id: '70129b87-bd4e-49bb-aa09-77644da73503', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT NAME' },
  { label: '2016', id: '8368bd3d-3633-4927-8355-2a2f9811ab4f', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' },
  { label: '2015', id: '2ff6343f-850d-46e7-98d1-aca79b619fd6', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT_NAME' }, // confirmed via upstream hint
  { label: '2014', id: '941c9de4-fb91-41bb-ad5a-43a35f5dc80f', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: 'DEPARTMENT NAME' }, // confirmed 200 in logs
  { label: '2013', id: 'fac6a421-72fb-4f85-b4ac-4aca1e32d94e', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: null }, // unknown schema; Go model suggests "DEPARTMENT"
  { label: '2012', id: 'd96dd8ad-9396-484a-87af-4d15e9e2ccb2', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: null }, // unknown schema
  { label: '2011', id: 'a861eff8-facc-4372-9b2d-262c2887b19e', totalGrossKey: 'TOTAL EARNINGS', totalGrossIsNumeric: false, deptCol: null }, // unknown schema
]

/**
 * Returns a SQL expression that safely casts an earnings column to numeric.
 *
 * Earnings values vary by year: plain numbers, comma-formatted, or full currency strings
 * with $ signs. We strip all non-digit/decimal chars via REGEXP_REPLACE, then guard
 * against empty strings (non-numeric rows like "N/A") with CASE WHEN rather than NULLIF —
 * the Boston CKAN API blocks NULLIF but allows CASE WHEN as standard SQL syntax.
 */
export function getEarningsAmtExpr(opt) {
  const k = opt.totalGrossKey
  const stripped = `REGEXP_REPLACE("${k}"::text, '[^0-9.]', '', 'g')`
  return `CASE WHEN ${stripped} = '' THEN 0 ELSE ${stripped}::numeric END`
}
