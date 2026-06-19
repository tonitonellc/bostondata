export const formatCurrency = (v) => {
  // Handle string values with commas (from API responses)
  let num = v
  if (typeof v === "string") {
    num = Number.parseFloat(v.replace(/,/g, ""))
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0)
}

export const parseNumericString = (v) => {
  if (typeof v === "string") {
    return Number.parseFloat(v.replace(/,/g, ""))
  }
  return Number.parseFloat(v) || 0
}

export const formatNumber = (v) => new Intl.NumberFormat("en-US").format(v || 0)
export const formatDate = (s) =>
  s ? new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"
