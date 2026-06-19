export const SERVER_ADDR = process.env.VUE_APP_SERVER_ADDR || "" 

export const getApiUrl = (endpoint) => {
  return `${SERVER_ADDR}${endpoint}`
}
