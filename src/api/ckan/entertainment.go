package api

// GetEntertainmentLicenseData handles unified entertainment license queries.
// CKAN's SQL endpoint only allows single-resource queries, so UNION queries
// across multiple resource IDs fail. Instead, this handler fans out to three
// parallel CKAN requests, then merges, sorts, and paginates in the server.

import (
	"boston-utils/models"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

const (
	annualLicenseID  = "eb683641-e358-4c2c-95de-c84f32c09147"
	specialPermitID  = "fb05bfda-a57e-4d97-948b-4f1949ba3c8a"
	oneTimeLicenseID = "ea7f0605-ffc0-4ad4-a786-02c50b276f54"
)

func GetEntertainmentLicenseData(c *gin.Context) {
	sqlQuery := c.Query("sql")
	countOnly := c.Query("count_only") == "true"

	if sqlQuery == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "sql parameter required"})
		return
	}

	whereClause := extractWhereFromSQL(sqlQuery)
	specialWhere := adaptWhereForSpecialPermits(whereClause)

	if countOnly {
		serveEntertainmentCount(c, whereClause, specialWhere)
		return
	}

	limitOffset := extractLimitOffsetFromSQL(sqlQuery)
	limit, offset := parseLimitOffset(limitOffset)
	serveEntertainmentData(c, whereClause, specialWhere, limit, offset)
}

// serveEntertainmentCount runs COUNT(*) against all three sources in parallel and sums them.
func serveEntertainmentCount(c *gin.Context, whereClause, specialWhere string) {
	type src struct{ id, where string }
	sources := []src{
		{annualLicenseID, whereClause},
		{specialPermitID, specialWhere},
		{oneTimeLicenseID, whereClause},
	}

	counts := make([]int, len(sources))
	var wg sync.WaitGroup
	for i, s := range sources {
		wg.Add(1)
		go func(idx int, id, where string) {
			defer wg.Done()
			sql := fmt.Sprintf(`SELECT COUNT(*) as total FROM "%s" %s`, id, where)
			recs, err := fetchEntertainmentRecords[map[string]interface{}](sql)
			if err != nil || len(recs) == 0 {
				return
			}
			switch v := recs[0]["total"].(type) {
			case float64:
				counts[idx] = int(v)
			case string:
				fmt.Sscanf(v, "%d", &counts[idx])
			}
		}(i, s.id, s.where)
	}
	wg.Wait()

	total := 0
	for _, n := range counts {
		total += n
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  gin.H{"records": []gin.H{{"total": total}}},
	})
}

// serveEntertainmentData fetches up to offset+limit records from each source in parallel,
// merges them, sorts by issued DESC, and returns the requested page.
func serveEntertainmentData(c *gin.Context, whereClause, specialWhere string, limit, offset int) {
	fetchN := offset + limit
	if fetchN < 100 {
		fetchN = 100
	}

	sqls := []string{
		buildAnnualEntertainmentSQL(annualLicenseID, whereClause, fetchN),
		buildSpecialPermitSQL(specialPermitID, specialWhere, fetchN),
		buildOneTimeEntertainmentSQL(oneTimeLicenseID, whereClause, fetchN),
	}

	type result struct {
		records []models.EntertainmentLicenseRecord
		err     error
	}
	results := make([]result, len(sqls))
	var wg sync.WaitGroup
	for i, q := range sqls {
		wg.Add(1)
		go func(idx int, sql string) {
			defer wg.Done()
			recs, err := fetchEntertainmentRecords[models.EntertainmentLicenseRecord](sql)
			results[idx] = result{recs, err}
		}(i, q)
	}
	wg.Wait()

	var all []models.EntertainmentLicenseRecord
	for _, r := range results {
		if r.err == nil {
			all = append(all, r.records...)
		}
	}

	// Sort by issued DESC; nil/empty issued sorts last
	sort.SliceStable(all, func(i, j int) bool {
		a, b := "", ""
		if all[i].Issued != nil {
			a = *all[i].Issued
		}
		if all[j].Issued != nil {
			b = *all[j].Issued
		}
		if a == b {
			return false
		}
		if a == "" {
			return false
		}
		if b == "" {
			return true
		}
		return a > b
	})

	start, end := offset, offset+limit
	if start > len(all) {
		start = len(all)
	}
	if end > len(all) {
		end = len(all)
	}
	page := all[start:end]
	if page == nil {
		page = []models.EntertainmentLicenseRecord{}
	}

	c.JSON(http.StatusOK, models.CKANSQLResponse[models.EntertainmentLicenseRecord]{
		Success: true,
		Result: models.CKANSQLResult[models.EntertainmentLicenseRecord]{
			Records: page,
		},
	})
}

// fetchEntertainmentRecords sends a single SQL query to CKAN and returns the decoded records.
func fetchEntertainmentRecords[T any](sql string) ([]T, error) {
	apiURL := fmt.Sprintf("https://data.boston.gov/api/3/action/datastore_search_sql?sql=%s", url.QueryEscape(sql))
	log.Printf("[DEBUG] SQL query to upstream: %s", apiURL)

	resp, err := http.Get(apiURL)
	if err != nil {
		log.Printf("[ERROR] Entertainment upstream fetch failed: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		bodyStr := string(body)
		if len(bodyStr) > 300 {
			bodyStr = bodyStr[:300]
		}
		log.Printf("[ERROR] Entertainment upstream status %d: %s", resp.StatusCode, bodyStr)
		return nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	var result models.CKANSQLResponse[T]
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	if !result.Success {
		log.Printf("[ERROR] Entertainment CKAN returned success=false for: %.120s", sql)
		return nil, fmt.Errorf("CKAN error")
	}
	return result.Result.Records, nil
}

// parseLimitOffset extracts LIMIT and OFFSET values from a SQL fragment like "LIMIT 25 OFFSET 50".
func parseLimitOffset(s string) (limit, offset int) {
	limit, offset = 25, 0
	parts := strings.Fields(strings.ToUpper(strings.TrimSpace(s)))
	for i, p := range parts {
		if p == "LIMIT" && i+1 < len(parts) {
			fmt.Sscanf(parts[i+1], "%d", &limit)
		}
		if p == "OFFSET" && i+1 < len(parts) {
			fmt.Sscanf(parts[i+1], "%d", &offset)
		}
	}
	return
}

func buildAnnualEntertainmentSQL(id, where string, limit int) string {
	return fmt.Sprintf(
		`SELECT _id, license_num, status, license_type, issued, expires,
			business_name, dba_name, license_description, applicant, manager,
			NULL as day_phone, NULL as evening_phone, tot_capacity, fee_amt, capacity,
			end_time, unit_type, numberofunits, address, city, state,
			zip, neighborhood, police_dist, gpsx, gpsy,
			'Annual' as source_dataset
		FROM "%s" %s ORDER BY issued DESC NULLS LAST LIMIT %d`,
		id, where, limit,
	)
}

func buildSpecialPermitSQL(id, where string, limit int) string {
	return fmt.Sprintf(
		`SELECT _id, NULL as license_num, "Status" as status,
			NULL as license_type, NULL as issued, NULL as expires,
			NULL as business_name, "App Name" as dba_name,
			"Location Description" as license_description,
			NULL as applicant, NULL as manager, NULL as day_phone,
			NULL as evening_phone, NULL as tot_capacity, NULL as fee_amt,
			NULL as capacity, NULL as end_time, NULL as unit_type,
			NULL as numberofunits,
			("Street Number" || ' ' || "Street Name" || ' ' || "Street Suffix") as address,
			"City" as city, NULL as state, "Zip Code" as zip,
			NULL as neighborhood, NULL as police_dist, NULL as gpsx, NULL as gpsy,
			'Special Permit' as source_dataset
		FROM "%s" %s LIMIT %d`,
		id, where, limit,
	)
}

func buildOneTimeEntertainmentSQL(id, where string, limit int) string {
	return fmt.Sprintf(
		`SELECT _id, license_num, status, license_type, issued, expires,
			NULL as business_name, dba_name, comments as license_description,
			applicant, manager, NULL as day_phone, NULL as evening_phone, NULL as tot_capacity,
			NULL as fee_amt, NULL as capacity, NULL as end_time, NULL as unit_type,
			NULL as numberofunits, address, city, state, zip, NULL as neighborhood,
			NULL as police_dist, gpsx, gpsy,
			'One-Time' as source_dataset
		FROM "%s" %s ORDER BY issued DESC NULLS LAST LIMIT %d`,
		id, where, limit,
	)
}

func extractWhereFromSQL(sql string) string {
	upperSQL := strings.ToUpper(sql)
	whereIdx := strings.Index(upperSQL, "WHERE")
	if whereIdx == -1 {
		return ""
	}
	whereClause := sql[whereIdx:]

	// Find earliest occurrence of LIMIT, ORDER BY, or GROUP BY
	earliestIdx := len(whereClause)
	for _, keyword := range []string{"LIMIT", "ORDER BY", "GROUP BY"} {
		if idx := strings.Index(strings.ToUpper(whereClause), keyword); idx != -1 && idx < earliestIdx {
			earliestIdx = idx
		}
	}

	if earliestIdx < len(whereClause) {
		whereClause = whereClause[:earliestIdx]
	}
	return strings.TrimSpace(whereClause)
}

func extractLimitOffsetFromSQL(sql string) string {
	upperSQL := strings.ToUpper(sql)
	limitIdx := strings.Index(upperSQL, "LIMIT")
	if limitIdx == -1 {
		return ""
	}
	return strings.TrimSpace(sql[limitIdx:])
}

func adaptWhereForSpecialPermits(whereClause string) string {
	if whereClause == "" {
		return ""
	}
	adapted := whereClause
	adapted = strings.ReplaceAll(adapted, `"status"`, `"Status"`)
	adapted = strings.ReplaceAll(adapted, `"dba_name"`, `"App Name"`)
	adapted = strings.ReplaceAll(adapted, `"city"`, `"City"`)
	return adapted
}
