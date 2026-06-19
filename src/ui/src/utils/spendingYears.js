// Shared spending dataset configuration.
// Used by SpendingView (per-year explorer) and AnnualReportsView (multi-year aggregates).

export const spendingYears = [
  { label: 'FY2026', id: 'd22fdd5c-7e4c-41b7-a3eb-dfc57a87b245', yearInt: 2026 },
  { label: 'FY2025', id: '84dfc1af-28bd-4f17-804a-9cc0c09a237e', yearInt: 2025 },
  { label: 'FY2024', id: '0b7c9c5f-d1c2-46e7-b738-6ab37a110eef', yearInt: 2024 },
  { label: 'FY2023', id: '5ce2ff98-3313-40d2-88bd-47eae9e5a654', yearInt: 2023 },
  { label: 'FY2022', id: '0a261d4e-3eec-4bac-bf72-b9a7aa77b033', yearInt: 2022 },
  { label: 'FY2021', id: '32897eeb-d9ca-494f-93b1-991c50bcd6a6', yearInt: 2021 },
  { label: 'FY2020', id: 'c093700f-d78a-49de-a8fe-508ba834ff6f', yearInt: 2020 },
  { label: 'FY2019', id: '38227f56-46ed-47fe-9e1c-5d2fce52908d', yearInt: 2019 },
  { label: 'FY2018', id: '5d8e373f-29a0-472c-b39b-9aa249e86fd5', yearInt: 2018 },
  { label: 'FY2017', id: '01a5c35c-19e3-419e-a8b5-cb623525b96d', yearInt: 2017 },
  { label: 'FY2016', id: 'ae5a15cc-8bd3-455d-8cbb-9221e07c1426', yearInt: 2016 },
  { label: 'FY2015', id: '5714ab9f-52d3-4c41-b2a6-2700b41438fc', yearInt: 2015 },
  { label: 'FY2014', id: '69eab395-07d3-41b8-a021-a0d314bd8046', yearInt: 2014 },
  { label: 'FY2013', id: 'c2bc5615-9478-4a9b-b71c-f63f6364e409', yearInt: 2013 },
  { label: 'FY2012', id: 'fd5c56a7-224f-41c4-a011-969b8aee457d', yearInt: 2012 },
]

/**
 * Returns the column-name schema and SQL helpers for a given spending fiscal year.
 *
 * Three schema generations exist in the upstream data:
 *   FY2024+  — space-separated column names, values stored as plain numerics
 *   FY2021–23 — underscore column names, values stored as comma-formatted text
 *   FY2020–  — all-lowercase column names, values stored as comma-formatted text
 *
 * `columns.*`  — raw column names for WHERE clauses, display, and filter UI
 * `amtExpr`    — ready-to-embed SQL expression for summing monetary amounts
 * `deptColSQL` — double-quoted department column name for GROUP BY / ORDER BY
 */
export function getSpendingSchema(yearInt) {
  if (yearInt >= 2024) {
    return {
      isNewSchema: true,
      columns: {
        monetaryAmount: 'Monetary Amount',
        vendorName: 'Vendor Name',
        dept: 'Dept Name',
        entered: 'Entered',
        fiscalYear: 'Fiscal Year',
      },
      amtExpr: '"Monetary Amount"::numeric',
      deptColSQL: '"Dept Name"',
      needsCommaCleaning: false,
    }
  }
  if (yearInt >= 2021) {
    return {
      isNewSchema: false,
      columns: {
        monetaryAmount: 'Monetary_Amount',
        vendorName: 'Vendor_Name',
        dept: 'Dept_Name',
        entered: 'Entered',
        fiscalYear: 'Fiscal_Year',
      },
      amtExpr: `REPLACE("Monetary_Amount", ',', '')::numeric`,
      deptColSQL: '"Dept_Name"',
      needsCommaCleaning: true,
    }
  }
  // FY2020 and below: upstream uses all-lowercase column names
  return {
    isNewSchema: false,
    columns: {
      monetaryAmount: 'monetary_amount',
      vendorName: 'vendor_name',
      dept: 'dept_name',
      entered: 'entered',
      fiscalYear: 'fiscal_year',
    },
    amtExpr: `REPLACE("monetary_amount", ',', '')::numeric`,
    deptColSQL: '"dept_name"',
    needsCommaCleaning: true,
  }
}
