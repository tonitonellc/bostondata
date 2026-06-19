package api

import (
	"net/http"

	api "boston-utils/api/ckan"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(router *gin.Engine) {
	// Dedicated health check endpoint — configure GCP LB to use this path.
	// It does zero work: no upstream calls, no disk I/O, just 200 OK.
	// This ensures health checks pass even when data.boston.gov is slow.
	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	apiGroup := router.Group("/api")
	{
		apiGroup.GET("/utility-bills", api.GetUtilityBillData)
		apiGroup.GET("/boston-data", api.GetLobbyingData)
		apiGroup.GET("/boston-cannabis", api.GetCannabisFacilityData)
		apiGroup.GET("/boston-earnings", api.GetEarningsData)
		apiGroup.GET("/boston-crime", api.GetCrimeData)
		apiGroup.GET("/boston-fire", api.GetFireData)
		apiGroup.GET("/boston-spending", api.GetSpendingData)
		apiGroup.GET("/boston-entertainment", api.GetEntertainmentLicenseData)
		apiGroup.GET("/boston-311", api.GetThreeOneOneData)
		apiGroup.GET("/boston-snow", api.GetSnowPlowingData)
		apiGroup.GET("/boston-frisk", api.GetPoliceStopFriskData)
		apiGroup.GET("/boston-permits", api.GetBuildingPermitData)
		apiGroup.GET("/boston-food", api.GetFoodInspectionData)
		apiGroup.GET("/boston-violations", api.GetCodeViolationData)
	}
}
