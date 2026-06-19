package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"boston-utils/models"

	"github.com/gin-gonic/gin"
)

// in datasets where the resource ID is modified on a yearly basis we use the
// most recent year
const (
	BostonBaseURL = "https://data.boston.gov/api/3/action/datastore_search"
	BostonSQLURL  = "https://data.boston.gov/api/3/action/datastore_search_sql"

	EarningsResource         = "29b3544f-752a-4cb1-a6af-a1de153d20a0"
	CrimeResource            = "b973d8cb-eeb2-4e7e-99da-c92938efc9c0"
	FireResource             = "91a38b1f-8439-46df-ba47-a30c48845e06"
	LobbyingResource         = "8d7f0cf4-4d20-4ed6-b6d0-bd6158d84ae9"
	SpendingResource         = "d22fdd5c-7e4c-41b7-a3eb-dfc57a87b245"
	SnowPlowingResource      = "2be28d90-3a90-4af1-a3f6-f28c1e25880a"
	PoliceStopFriskResource  = "060526ca-ab4e-4da5-997c-1a4460bde5fd"
	ThreeOneOneResource      = "254adca6-64ab-4c5c-9fc0-a6da622be185"
	BuildingPermitResource   = "6ddcd912-32a0-43df-9908-63574f8c7e77"
	FoodInspectionResource   = "4582bec6-2b4f-4f9e-bc55-cbaa73117f4c"
	CodeViolationResource    = "90ed3816-5e70-443c-803d-9a71f44470be"
	CannabisFacilityResource = "5de268d6-e3a5-4f5c-b43a-0d293b377b50"
	UtilityBillResource      = "35fad26c-1400-46b0-846c-3bb6ca8f74d0"
)

// httpClient is shared across all handlers. The custom Transport raises
// MaxIdleConnsPerHost from Go's default of 2 to something appropriate for
// a backend that fans out to a single upstream host (data.boston.gov).
// Without this, concurrent requests queue waiting for an idle connection,
// which causes artificial latency and contributes to 503s under load.
var httpClient = &http.Client{
	Timeout: 45 * time.Second, // must be less than server WriteTimeout (60s)
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
	},
}

func handleDataRequest[T any](c *gin.Context, defaultResourceID string) {
	sqlQuery := c.Query("sql")
	if sqlQuery != "" {
		if c.Query("count_only") == "true" || c.Query("aggregate") == "true" {
			fetchSQLAndRespond[map[string]interface{}](c, sqlQuery)
		} else {
			fetchSQLAndRespond[T](c, sqlQuery)
		}
		return
	}

	resourceID := c.Query("resource_id")
	if resourceID == "" {
		resourceID = defaultResourceID
	}
	if resourceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "resource_id is required"})
		return
	}

	fetchAndRespond[T](c, resourceID)
}

func GetLobbyingData(c *gin.Context) { handleDataRequest[models.LobbyRecord](c, LobbyingResource) }
func GetEarningsData(c *gin.Context) { handleDataRequest[models.EarningsRecord](c, EarningsResource) }
func GetCrimeData(c *gin.Context)    { handleDataRequest[models.CrimeRecord](c, CrimeResource) }
func GetFireData(c *gin.Context)     { handleDataRequest[models.FireRecord](c, FireResource) }
func GetSpendingData(c *gin.Context) { handleDataRequest[models.SpendingRecord](c, SpendingResource) }
func GetPoliceStopFriskData(c *gin.Context) {
	handleDataRequest[models.PoliceStopFriskRecord](c, PoliceStopFriskResource)
}
func GetSnowPlowingData(c *gin.Context) {
	handleDataRequest[models.SnowRequestRecord](c, SnowPlowingResource)
}
func GetThreeOneOneData(c *gin.Context) {
	handleDataRequest[models.ThreeOneOneRecord](c, ThreeOneOneResource)
}
func GetBuildingPermitData(c *gin.Context) {
	handleDataRequest[models.BuildingPermitRecord](c, BuildingPermitResource)
}
func GetFoodInspectionData(c *gin.Context) {
	handleDataRequest[models.FoodInspectionRecord](c, FoodInspectionResource)
}
func GetCodeViolationData(c *gin.Context) {
	handleDataRequest[models.CodeViolationRecord](c, CodeViolationResource)
}
func GetCannabisFacilityData(c *gin.Context) {
	handleDataRequest[models.CannabisFacilityRecord](c, CannabisFacilityResource)
}
func GetUtilityBillData(c *gin.Context) {
	handleDataRequest[models.UtilityBillRecord](c, UtilityBillResource)
}

func fetchSQLAndRespond[T any](c *gin.Context, query string) {
	executeSQLRequest(c, query, func(respBody []byte) (interface{}, error) {
		var result struct {
			Help    string `json:"help"`
			Success bool   `json:"success"`
			Result  struct {
				Sql     string `json:"sql"`
				Records []T    `json:"records"`
			} `json:"result"`
		}
		if err := json.Unmarshal(respBody, &result); err != nil {
			return nil, err
		}
		return result, nil
	})
}

func executeSQLRequest(c *gin.Context, query string, decoder func([]byte) (interface{}, error)) {
	encodedQuery := url.QueryEscape(query)
	// TODO: replace fmt.Sprintf instances with something more performant, like regular ol' strings ops
	apiURL := fmt.Sprintf("%s?sql=%s", BostonSQLURL, encodedQuery)
	log.Printf("[DEBUG] SQL query to upstream: %s", apiURL)

	resp, err := httpClient.Get(apiURL)
	if err != nil {
		log.Printf("[ERROR] Upstream fetch failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to fetch from Boston SQL API"})
		return
	}
	defer resp.Body.Close()

	// FIX: The previous implementation used Read() which is not guaranteed to
	// fill the buffer in a single call, causing silent partial reads and JSON
	// decode failures. io.ReadAll() loops internally until EOF.
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[ERROR] Failed to read upstream response body: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to read response from Boston SQL API"})
		return
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[ERROR] Upstream returned status %d: %s", resp.StatusCode, string(body))
		c.JSON(http.StatusBadGateway, gin.H{
			"error":           "Boston API returned an error",
			"upstream_status": resp.StatusCode,
		})
		return
	}

	result, err := decoder(body)
	if err != nil {
		log.Printf("[ERROR] Decode failed: %v\nBody (first 500 bytes): %s", err, truncate(body, 500))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode SQL response"})
		return
	}

	c.JSON(http.StatusOK, result)
}

func fetchAndRespond[T any](c *gin.Context, resourceID string) {
	limit := c.DefaultQuery("limit", "100")
	offset := c.DefaultQuery("offset", "0")
	query := c.Query("q")

	apiURL := fmt.Sprintf("%s?resource_id=%s&limit=%s&offset=%s", BostonBaseURL, resourceID, limit, offset)
	if query != "" {
		apiURL = fmt.Sprintf("%s&q=%s", apiURL, query)
	}

	log.Printf("[DEBUG] Standard query: %s", apiURL)

	resp, err := httpClient.Get(apiURL)
	if err != nil {
		log.Printf("[ERROR] Upstream fetch failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to fetch from Boston API"})
		return
	}
	defer resp.Body.Close()

	var ckanData models.CKANResponse[T]
	if err := json.NewDecoder(resp.Body).Decode(&ckanData); err != nil {
		log.Printf("[ERROR] Failed to decode standard API response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse API response"})
		return
	}

	c.JSON(http.StatusOK, ckanData)
}

// truncate returns at most n bytes from b as a string, for safe log output.
func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n])
}
