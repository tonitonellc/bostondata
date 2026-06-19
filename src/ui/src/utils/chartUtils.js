import Chart from 'chart.js/auto'

const LIGHT_TEXT = '#4a5568'
const DARK_TEXT  = '#94a3b8'
const LIGHT_GRID = 'rgba(0, 0, 0, 0.08)'
const DARK_GRID  = 'rgba(255, 255, 255, 0.08)'

export const applyChartTheme = (isDark) => {
  const text = isDark ? DARK_TEXT : LIGHT_TEXT
  const grid = isDark ? DARK_GRID : LIGHT_GRID

  // Apply to all future chart instances
  Chart.defaults.color = text

  // Patch and redraw every live instance
  Object.values(Chart.instances).forEach(chart => {
    const legendLabels = chart.options.plugins?.legend?.labels
    if (legendLabels) legendLabels.color = text

    const scales = chart.options.scales
    if (scales) {
      Object.values(scales).forEach(scale => {
        if (scale.ticks) scale.ticks.color = text
        if (scale.grid)  scale.grid.color  = grid
        else             scale.grid = { color: grid }
      })
    }

    chart.update('none') // skip animation on theme switch
  })
}

export const chartColors = {
  primary: '#667eea',
  blue: '#36A2EB',
  red: '#FF6384',
  yellow: '#FFCE56',
  teal: '#4BC0C0',
  purple: '#9966FF',
  orange: '#FF9F40',
  green: '#27ae60',
  gray: '#6c757d',
};

export const pieBackgrounds = [
  chartColors.blue, chartColors.red, chartColors.yellow,
  chartColors.teal, chartColors.purple, chartColors.orange,
  chartColors.green, '#cbd5e0', '#a0aec0', '#718096'
];

export const getColor = (index) => pieBackgrounds[index % pieBackgrounds.length];
