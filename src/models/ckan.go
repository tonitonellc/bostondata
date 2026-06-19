package models

import (
	"boston-utils/types"
	"encoding/json"
)

// CKANResponse represents the top-level envelope for Boston Data Portal API responses
// Using Generics [T] to support different record types (Lobbying vs Earnings)
type CKANResponse[T any] struct {
	Help    string        `json:"help"`
	Success bool          `json:"success"`
	Result  CKANResult[T] `json:"result"`
}

// CKANResult contains the actual data payload and metadata
type CKANResult[T any] struct {
	ResourceID string      `json:"resource_id"`
	Fields     []CKANField `json:"fields"`
	Records    []T         `json:"records"`
	Links      CKANLinks   `json:"_links"`
	Total      int         `json:"total"`
	Limit      int         `json:"limit"`
	Offset     int         `json:"offset"`
	Q          string      `json:"q"`
}

// CKANSQLResponse represents the envelope for the datastore_search_sql endpoint
// This endpoint returns a slightly different structure than the standard search
type CKANSQLResponse[T any] struct {
	Help    string           `json:"help"`
	Success bool             `json:"success"`
	Result  CKANSQLResult[T] `json:"result"`
}

// CKANSQLResult contains the records returned by a SQL query
type CKANSQLResult[T any] struct {
	Sql     string `json:"sql"`
	Records []T    `json:"records"`
}

type CKANField struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type CKANLinks struct {
	Start string `json:"start"`
	Next  string `json:"next"`
}

// UtilityBillRecord represents a single entry in the Utility Bills dataset
type UtilityBillRecord struct {
	ID               int     `json:"_id"`
	FullText         *string `json:"_full_text"`
	InvoiceID        string  `json:"InvoiceID"`
	AccountNumber    string  `json:"AccountNumber"`
	EnergyTypeName   string  `json:"EnergyTypeName"`
	InvoiceDate      string  `json:"InvoiceDate"`
	FromDate         string  `json:"FromDate"`
	ToDate           string  `json:"ToDate"`
	UsagePeriodDays  string  `json:"UsagePeriodDays"`
	DeliveryCost     string  `json:"DeliveryCost"`
	SupplyCost       string  `json:"SupplyCost"`
	TotalCost        string  `json:"TotalCost"`
	TotalConsumption string  `json:"TotalConsumption"`
	DemandkW         string  `json:"DemandkW"`
	UomName          string  `json:"UomName"`
	StreetAddress    string  `json:"StreetAddress"`
	City             string  `json:"City"`
	Zip              string  `json:"Zip"`
	StateName        string  `json:"StateName"`
	Abbreviation     string  `json:"Abbreviation"`
	CountryName      string  `json:"CountryName"`
	SiteName         string  `json:"SiteName"`
	Currency         string  `json:"Currency"`
	CodeDescription  string  `json:"CodeDescription"`
	DepartmentName   string  `json:"DepartmentName"`
}

// EntertainmentLicenseRecord represents unified entertainment license data
// Combines Annual Entertainment Licenses, Special Permits, and One-Time Licenses
type EntertainmentLicenseRecord struct {
	ID                 int     `json:"_id"`
	LicenseNum         *string `json:"license_num"`
	Status             string  `json:"status"`
	LicenseType        *string `json:"license_type"`
	Issued             *string `json:"issued"`
	Expires            *string `json:"expires"`
	BusinessName       *string `json:"business_name"`
	DBAName            string  `json:"dba_name"`
	LicenseDescription *string `json:"license_description"`
	Applicant          *string `json:"applicant"`
	Manager            *string `json:"manager"`
	DayPhone           *string `json:"day_phone"`
	EveningPhone       *string `json:"evening_phone"`
	TotalCapacity      *string `json:"tot_capacity"`
	FeeAmount          *string `json:"fee_amt"`
	Capacity           *string `json:"capacity"`
	EndTime            *string `json:"end_time"`
	UnitType           *string `json:"unit_type"`
	NumberOfUnits      *string `json:"numberofunits"`
	Address            string  `json:"address"`
	City               *string `json:"city"`
	State              *string `json:"state"`
	Zip                *string `json:"zip"`
	Neighborhood       *string `json:"neighborhood"`
	PoliceDistrict     *string `json:"police_dist"`
	GPSX               *string `json:"gpsx"`
	GPSY               *string `json:"gpsy"`

	// Computed field for source tracking
	SourceDataset string `json:"source_dataset"`
}

// CrimeRecord represents a single entry in the Crime Incident Reports dataset
type CrimeRecord struct {
	ID                 int     `json:"_id"`
	IncidentNumber     string  `json:"INCIDENT_NUMBER"`
	OffenseCode        string  `json:"OFFENSE_CODE"`
	OffenseCodeGroup   *string `json:"OFFENSE_CODE_GROUP"`
	OffenseDescription string  `json:"OFFENSE_DESCRIPTION"`
	District           string  `json:"DISTRICT"`
	ReportingArea      string  `json:"REPORTING_AREA"`
	Shooting           *string `json:"SHOOTING"`
	OccurredOnDate     string  `json:"OCCURRED_ON_DATE"`
	Year               string  `json:"YEAR"`
	Month              string  `json:"MONTH"`
	DayOfWeek          string  `json:"DAY_OF_WEEK"`
	Hour               string  `json:"HOUR"`
	UCRPart            *string `json:"UCR_PART"`
	Street             string  `json:"STREET"`
	Lat                string  `json:"Lat"`
	Long               string  `json:"Long"`
	Location           string  `json:"Location"` // probably useless combination of lat + long
}

// FireRecord represents a single entry in the Fire Incident Reporting dataset
type FireRecord struct {
	ID                    int     `json:"_id"`
	FullText              string  `json:"_full_text"`
	IncidentNumber        string  `json:"incident_number"`
	ExposureNumber        string  `json:"exposure_number"`
	AlarmDate             string  `json:"alarm_date"`
	AlarmTime             string  `json:"alarm_time"`
	IncidentType          string  `json:"incident_type"`
	IncidentDescription   string  `json:"incident_description"`
	EstimatedPropertyLoss string  `json:"estimated_property_loss"`
	EstimatedContentLoss  string  `json:"estimated_content_loss"`
	District              string  `json:"district"`
	CitySection           string  `json:"city_section"`
	Neighborhood          string  `json:"neighborhood"`
	Zip                   string  `json:"zip"`
	PropertyUse           string  `json:"property_use"`
	PropertyDescription   string  `json:"property_description"`
	StreetNumber          string  `json:"street_number"`
	StreetPrefix          *string `json:"street_prefix"`
	StreetName            string  `json:"street_name"`
	StreetSuffix          *string `json:"street_suffix"`
	StreetType            string  `json:"street_type"`
	Address2              *string `json:"address_2"`
	XStreetPrefix         *string `json:"xstreet_prefix"`
	XStreetName           *string `json:"xstreet_name"`
	XStreetSuffix         *string `json:"xstreet_suffix"`
	XStreetType           *string `json:"xstreet_type"`
}

// LobbyRecord represents a single entry in the Lobbying dataset
type LobbyRecord struct {
	ID                     int     `json:"_id"`
	CCLNumber              string  `json:"CCL #"`
	Category               string  `json:"Category"`
	FullName               string  `json:"Full Name"`
	AddDate                string  `json:"Add Date"`
	Year                   string  `json:"Year"`
	Quarter                string  `json:"Quarter"`
	QuarterActivity        string  `json:"Quarter Activity"`
	Type                   string  `json:"Type"`
	ContributionDate       *string `json:"Contribution Date"`
	ContributionAmount     *string `json:"Contribution Amount"`
	RecipientName          *string `json:"Recipient Name"`
	IncumbentCandidate     *string `json:"Incumbent/Candidate"`
	LobbyistClientName     string  `json:"Lobbyist/Client Name"`
	LobbyistClientCCL      string  `json:"Lobbyist/Client CCL"`
	SubjectName            *string `json:"Subject Name"`
	SubjectType            *string `json:"Subject Type"`
	SupportOppose          *string `json:"Support Oppose"`
	SupportOpposeStatement *string `json:"Support Oppose Statement"`
	IssueDescription       *string `json:"Issue Description"`
	IncurredOrPaid         *string `json:"Incurred or Paid"`
	Amount                 *string `json:"Amount"`
}

// EarningsRecord represents a single entry in the Employee Earnings dataset
type EarningsRecord struct {
	ID            int               `json:"_id"`
	Name          string            `json:"NAME"`
	Department    string            `json:"DEPARTMENT_NAME"`
	Title         string            `json:"TITLE"`
	Regular       types.FlexFloat64 `json:"REGULAR"`
	Retro         types.FlexFloat64 `json:"RETRO"`
	Other         types.FlexFloat64 `json:"OTHER"`
	Overtime      types.FlexFloat64 `json:"OVERTIME"`
	Injured       types.FlexFloat64 `json:"INJURED"`
	Detail        types.FlexFloat64 `json:"DETAIL"`
	Quinn         types.FlexFloat64 `json:"QUINN_EDUCATION"`
	TotalEarnings types.FlexFloat64 `json:"TOTAL GROSS"`
	Postal        types.FlexZip     `json:"POSTAL"`
}

// UnmarshalJSON Custom Unmarshaler for EarningsRecord
// Handles schema migrations for total earnings and quinn education fields
func (r *EarningsRecord) UnmarshalJSON(data []byte) error {
	// Define a temporary struct that captures both schema versions
	type Alias struct {
		ID         int               `json:"_id"`
		Name       string            `json:"NAME"`
		Department string            `json:"DEPARTMENT_NAME"`
		Title      string            `json:"TITLE"`
		Regular    types.FlexFloat64 `json:"REGULAR"`
		Retro      types.FlexFloat64 `json:"RETRO"`
		Other      types.FlexFloat64 `json:"OTHER"`
		Overtime   types.FlexFloat64 `json:"OVERTIME"`
		Injured    types.FlexFloat64 `json:"INJURED"`
		Detail     types.FlexFloat64 `json:"DETAIL"`
		Quinn      types.FlexFloat64 `json:"QUINN_EDUCATION"` // TODO: add support for `QUINN/EDUCATION INCENTIVE`, `QUINN / EDUCATION INCENTIVE`
		Postal     types.FlexZip     `json:"POSTAL"`

		// 2013, some other years, not counting
		DepartmentNew string `json:"DEPARTMENT"`
		// 2017, etc
		DepartmentNewAlso string `json:"DEPARTMENT NAME"`

		// new (2023, 2024) key for total gross / total earnings
		TotalEarningsNew types.FlexFloat64 `json:"TOTAL GROSS"`
		// 2022 Employee Earnings uses `TOTAL_ GROSS` for some very good reason
		TotalEarningsNewWhy types.FlexFloat64 `json:"TOTAL_ GROSS"`
		// 2021 key
		TotalEarningsOld types.FlexFloat64 `json:"TOTAL_GROSS"`
		// 2011 - 2020
		TotalEarningsOlder types.FlexFloat64 `json:"TOTAL EARNINGS"`
	}

	var aux Alias
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	r.ID = aux.ID
	r.Name = aux.Name
	r.Department = aux.Department
	r.Title = aux.Title
	r.Regular = aux.Regular
	r.Retro = aux.Retro
	r.Other = aux.Other
	r.Overtime = aux.Overtime
	r.Injured = aux.Injured
	r.Detail = aux.Detail
	r.Quinn = aux.Quinn
	r.Postal = aux.Postal

	fields := []types.FlexFloat64{
		aux.TotalEarningsNew,
		aux.TotalEarningsOld,
		aux.TotalEarningsNewWhy,
		aux.TotalEarningsOlder,
	}
	for _, field := range fields {
		if field != 0 {
			r.TotalEarnings = field
			break
		}
	}

	depts := []string{
		aux.DepartmentNew,
		aux.DepartmentNewAlso,
	}
	for _, dept := range depts {
		if dept != "" {
			r.Department = dept
			break
		}
	}

	return nil
}

// SpendingRecord represents a single entry in the Checkbook/Spending dataset
type SpendingRecord struct {
	ID                  int               `json:"_id"`
	Voucher             types.FlexFloat64 `json:"Voucher,omitempty"`
	VoucherLine         types.FlexFloat64 `json:"Voucher Line,omitempty"`
	VoucherLineOld      types.FlexFloat64 `json:"Voucher_Line,omitempty"`
	DistributionLine    types.FlexFloat64 `json:"Distribution Line,omitempty"`
	DistributionLineOld types.FlexFloat64 `json:"Distribution_Line,omitempty"`
	Entered             types.FlexDate    `json:"Entered"`
	MonthNumber         types.FlexFloat64 `json:"Month(Number),omitempty"`
	MonthNumberOld      types.FlexFloat64 `json:"Month_Number,omitempty"`
	Month               string            `json:"Month"`
	FiscalMonth         types.FlexFloat64 `json:"Fiscal Month,omitempty"`
	FiscalMonthOld      types.FlexFloat64 `json:"Fiscal_Month,omitempty"`
	FiscalYear          types.FlexFloat64 `json:"Fiscal Year,omitempty"`
	FiscalYearOld       types.FlexFloat64 `json:"Fiscal_Year,omitempty"`
	Year                types.FlexFloat64 `json:"Year"`
	VendorName          string            `json:"Vendor Name,omitempty"`
	VendorNameOld       string            `json:"Vendor_Name,omitempty"`
	Account             types.FlexFloat64 `json:"Account"`
	AccountDescr        string            `json:"Account Descr,omitempty"`
	AccountDescrOld     string            `json:"Account_Descr,omitempty"`
	Dept                string            `json:"Dept"`
	DeptName            string            `json:"Dept Name,omitempty"`
	DeptNameOld         string            `json:"Dept_Name,omitempty"`
	SixDigitOrgName     string            `json:"6 Digit Org Name,omitempty"`
	SixDigitOrgNameOld  string            `json:"c6_Digit_Org_Name,omitempty"`
	MonetaryAmount      types.FlexFloat64 `json:"Monetary Amount,omitempty"`
	MonetaryAmountOld   types.FlexFloat64 `json:"Monetary_Amount,omitempty"`
}

// UnmarshalJSON Custom Unmarshaler for SpendingRecord
// Adapts disparate schema versions (Spaces vs Underscores) into a clean struct.
func (r *SpendingRecord) UnmarshalJSON(data []byte) error {
	// Define a temporary struct that captures ALL possible variations from the external API
	type Alias struct {
		ID int `json:"_id"`

		// Common / Consistent Fields
		Month   string         `json:"Month"`
		Entered types.FlexDate `json:"Entered"`

		// New Schema (Spaces)
		VendorNameNew       string            `json:"Vendor Name"`
		DeptNameNew         string            `json:"Dept Name"`
		MonetaryAmountNew   types.FlexFloat64 `json:"Monetary Amount"`
		AccountDescrNew     string            `json:"Account Descr"`
		YearNew             types.FlexFloat64 `json:"Year"`
		FiscalYearNew       types.FlexFloat64 `json:"Fiscal Year"`
		MonthNumberNew      types.FlexFloat64 `json:"Month(Number)"`
		VoucherNew          types.FlexFloat64 `json:"Voucher"`
		VoucherLineNew      types.FlexFloat64 `json:"Voucher Line"`
		DistributionLineNew types.FlexFloat64 `json:"Distribution Line"`

		// Old Schema (Underscores)
		VendorNameOld       string            `json:"Vendor_Name"`
		DeptNameOld         string            `json:"Dept_Name"`
		MonetaryAmountOld   types.FlexFloat64 `json:"Monetary_Amount"`
		AccountDescrOld     string            `json:"Account_Descr"`
		FiscalYearOld       types.FlexFloat64 `json:"Fiscal_Year"`
		MonthNumberOld      types.FlexFloat64 `json:"Month_Number"`
		VoucherLineOld      types.FlexFloat64 `json:"Voucher_Line"`
		DistributionLineOld types.FlexFloat64 `json:"Distribution_Line"`
	}

	var aux Alias
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	// Map data to the clean struct
	r.ID = aux.ID
	r.Month = aux.Month
	r.Entered = aux.Entered

	// Prioritize New (Spaces) -> Fallback to Old (Underscores)
	if aux.VendorNameNew != "" {
		r.VendorName = aux.VendorNameNew
	} else {
		r.VendorName = aux.VendorNameOld
	}

	if aux.DeptNameNew != "" {
		r.Dept = aux.DeptNameNew
	} else {
		r.Dept = aux.DeptNameOld
	}

	if aux.AccountDescrNew != "" {
		r.AccountDescr = aux.AccountDescrNew
	} else {
		r.AccountDescr = aux.AccountDescrOld
	}

	// For FlexTypes (Float/Date), we check if the primary is valid/non-zero
	r.MonetaryAmount = aux.MonetaryAmountNew
	if r.MonetaryAmount == 0 {
		r.MonetaryAmount = aux.MonetaryAmountOld
	}

	r.FiscalYear = aux.FiscalYearNew
	if r.FiscalYear == 0 {
		r.FiscalYear = aux.FiscalYearOld
	}

	r.MonthNumber = aux.MonthNumberNew
	if r.MonthNumber == 0 {
		r.MonthNumber = aux.MonthNumberOld
	}

	r.Voucher = aux.VoucherNew

	r.VoucherLine = aux.VoucherLineNew
	if r.VoucherLine == 0 {
		r.VoucherLine = aux.VoucherLineOld
	}

	r.DistributionLine = aux.DistributionLineNew
	if r.DistributionLine == 0 {
		r.DistributionLine = aux.DistributionLineOld
	}

	return nil
}

// ThreeOneOneRecord represents a single entry in the 311 Service Requests dataset
type ThreeOneOneRecord struct {
	ID                  int     `json:"_id"`
	CaseID              string  `json:"case_id"`
	OpenDate            string  `json:"open_date"`
	CaseTopic           string  `json:"case_topic"`
	ServiceName         string  `json:"service_name"`
	AssignedDepartment  string  `json:"assigned_department"`
	AssignedTeam        string  `json:"assigned_team"`
	CaseStatus          string  `json:"case_status"`
	ClosureReason       *string `json:"closure_reason"`
	ClosureComments     *string `json:"closure_comments"`
	CloseDate           *string `json:"close_date"`
	TargetCloseDate     *string `json:"target_close_date"`
	OnTime              string  `json:"on_time"`
	ReportSource        string  `json:"report_source"`
	FullAddress         string  `json:"full_address"`
	StreetNumber        *string `json:"street_number"`
	StreetName          string  `json:"street_name"`
	ZipCode             string  `json:"zip_code"`
	Neighborhood        string  `json:"neighborhood"`
	PublicWorksDistrict string  `json:"public_works_district"`
	CityCouncilDistrict string  `json:"city_council_district"`
	FireDistrict        string  `json:"fire_district"`
	PoliceDistrict      string  `json:"police_district"`
	Ward                string  `json:"ward"`
	Precinct            string  `json:"precinct"`
	SubmittedPhoto      *string `json:"submitted_photo"`
	ClosedPhoto         *string `json:"closed_photo"`
	Longitude           string  `json:"longitude"`
	Latitude            string  `json:"latitude"`
}

// SnowRequestRecord represents a single entry in the Snow Plowing Requests dataset
type SnowRequestRecord struct {
	ID                   int     `json:"_id"`
	CaseEnquiryID        string  `json:"case_enquiry_id"`
	OpenDt               string  `json:"open_dt"`
	SlaTargetDt          *string `json:"sla_target_dt"`
	ClosedDt             *string `json:"closed_dt"`
	OnTime               string  `json:"on_time"`
	CaseStatus           string  `json:"case_status"`
	ClosureReason        string  `json:"closure_reason"`
	CaseTitle            string  `json:"case_title"`
	Subject              string  `json:"subject"`
	Reason               string  `json:"reason"`
	Type                 string  `json:"type"`
	Queue                string  `json:"queue"`
	Department           string  `json:"department"`
	Location             string  `json:"location"`
	FireDistrict         string  `json:"fire_district"`
	PwdDistrict          string  `json:"pwd_district"`
	CityCounsilDistrict  string  `json:"city_council_district"`
	PoliceDistrict       string  `json:"police_district"`
	Neighborhood         string  `json:"neighborhood"`
	NeighborhoodServices string  `json:"neighborhood_services_district"`
	Ward                 string  `json:"ward"`
	Precinct             string  `json:"precinct"`
	LocationStreetName   string  `json:"location_street_name"`
	LocationZipcode      *string `json:"location_zipcode"`
	Latitude             string  `json:"latitude"`
	Longitude            string  `json:"longitude"`
	Source               string  `json:"source"`
}

// PoliceStopFriskRecord represents a single entry in the Police Field Contact dataset
type PoliceStopFriskRecord struct {
	ID                 int     `json:"_id"`
	FCNum              string  `json:"fc_num"`
	ContactDate        string  `json:"contact_date"`
	ContactOfficer     string  `json:"contact_officer"`
	ContactOfficerName string  `json:"contact_officer_name"`
	Supervisor         string  `json:"supervisor"`
	SupervisorName     string  `json:"supervisor_name"`
	Street             string  `json:"street"`
	City               string  `json:"city"`
	State              string  `json:"state"`
	Zip                string  `json:"zip"`
	Duration           *string `json:"duration"`
	Circumstance       string  `json:"circumstance"`
	Basis              string  `json:"basis"`
	VehicleYear        *string `json:"vehicle_year"`
	VehicleState       *string `json:"vehicle_state"`
	VehicleModel       *string `json:"vehicle_mode"` // Note: API uses "vehicle_mode" not "vehicle_model"
	VehicleColor       *string `json:"vehicle_color"`
	VehicleStyle       *string `json:"vehicle_style"`
	VehicleType        *string `json:"vehicle_type"`
	KeySituations      string  `json:"key_situations"`
	ContactReason      string  `json:"contact_reason"`
}

// CannabisFacilityRecord represents a single entry in the Cannabis Facility Registry
// This data includes currently licensed applicants as well as inactive and pending
// cannabis license applicants
type CannabisFacilityRecord struct {
	ID              int     `json:"_id"`
	FirstName       *string `json:"id_name_first"`
	LastName        *string `json:"id_name_last"`
	FullName        *string `json:"id_full_name"`
	LicenseCategory string  `json:"app_license_category"`
	LicenseNumber   string  `json:"app_license_number"`
	BusinessName    *string `json:"app_business_name"`
	DBAName         *string `json:"app_dba_name"`
	LicenseStatus   string  `json:"app_license_status"`
	LicenseType     string  `json:"lt_license_type"`
	EquityProgram   string  `json:"equity_program_designation"`
	Address         *string `json:"facility_address"`
	Zip             string  `json:"facility_zip_code"`
	Lat             string  `json:"latitude"`
	Lon             string  `json:"longitude"`
}

// BuildingPermitRecord represents a single entry in the Approved Building Permits dataset
//
// The datastore_search_sql endpoint returns numeric DB columns (sq_feet, ward,
// property_id, parcel_id) as JSON strings (e.g. "9", "439577"), while
// datastore_search returns them as native JSON numbers. FlexFloat64 handles
// both via its custom UnmarshalJSON, so it is used for all numeric-but-
// sometimes-string fields rather than int/int64.
type BuildingPermitRecord struct {
	ID                int               `json:"_id"`
	PermitNumber      string            `json:"permitnumber"`
	WorkType          string            `json:"worktype"`
	PermitTypeDescr   string            `json:"permittypedescr"`
	Description       string            `json:"description"`
	Comments          string            `json:"comments"`
	Applicant         *string           `json:"applicant"`
	DeclaredValuation types.FlexFloat64 `json:"declared_valuation"`
	TotalFees         types.FlexFloat64 `json:"total_fees"`
	IssuedDate        string            `json:"issued_date"`
	ExpirationDate    *string           `json:"expiration_date"`
	Status            string            `json:"status"`
	OccupancyType     string            `json:"occupancytype"`
	SqFeet            types.FlexFloat64 `json:"sq_feet"`
	Address           string            `json:"address"`
	City              string            `json:"city"`
	State             string            `json:"state"`
	Zip               string            `json:"zip"`
	Ward              types.FlexFloat64 `json:"ward"`
	PropertyID        types.FlexFloat64 `json:"property_id"`
	ParcelID          types.FlexFloat64 `json:"parcel_id"`
	GPSY              types.FlexFloat64 `json:"gpsy"`
	GPSX              types.FlexFloat64 `json:"gpsx"`
	YLatitude         types.FlexFloat64 `json:"y_latitude"`
	XLongitude        types.FlexFloat64 `json:"x_longitude"`
}

// FoodInspectionRecord represents a single entry in the Food Establishment Inspections dataset
type FoodInspectionRecord struct {
	ID              int     `json:"_id"`
	BusinessName    string  `json:"businessname"`
	DBAName         *string `json:"dbaname"`
	LegalOwner      *string `json:"legalowner"`
	NameLast        string  `json:"namelast"`
	NameFirst       string  `json:"namefirst"`
	LicenseNo       string  `json:"licenseno"`
	IssuedDate      string  `json:"issdttm"`
	ExpiredDate     string  `json:"expdttm"`
	LicenseStatus   string  `json:"licstatus"`
	LicenseCategory string  `json:"licensecat"`
	Description     string  `json:"descript"`
	Result          string  `json:"result"`
	ResultDate      string  `json:"resultdttm"`
	Violation       string  `json:"violation"`
	ViolationLevel  string  `json:"viol_level"`
	ViolationDesc   string  `json:"violdesc"`
	ViolationDate   string  `json:"violdttm"`
	ViolationStatus string  `json:"viol_status"`
	StatusDate      *string `json:"status_date"`
	Comments        string  `json:"comments"`
	Address         string  `json:"address"`
	City            string  `json:"city"`
	State           string  `json:"state"`
	Zip             string  `json:"zip"`
	PropertyID      string  `json:"property_id"`
	Location        string  `json:"location"`
}

// CodeViolationRecord represents a single entry in the Code Enforcement - Building and Property Violations dataset
type CodeViolationRecord struct {
	ID              int               `json:"_id"`
	CaseNo          string            `json:"case_no"`
	TicketNo        string            `json:"ticket_no"`
	StatusDate      string            `json:"status_dttm"`
	Status          string            `json:"status"`
	Code            string            `json:"code"`
	Value           types.FlexFloat64 `json:"value"`
	Description     string            `json:"description"`
	ViolationStNo   string            `json:"violation_stno"`
	ViolationStHigh *string           `json:"violation_sthigh"`
	ViolationStreet string            `json:"violation_street"`
	ViolationSuffix string            `json:"violation_suffix"`
	ViolationCity   string            `json:"violation_city"`
	ViolationState  string            `json:"violation_state"`
	ViolationZip    string            `json:"violation_zip"`
	Ward            string            `json:"ward"`
	ContactAddr1    string            `json:"contact_addr1"`
	ContactAddr2    *string           `json:"contact_addr2"`
	ContactCity     string            `json:"contact_city"`
	ContactState    string            `json:"contact_state"`
	ContactZip      string            `json:"contact_zip"`
	SamID           string            `json:"sam_id"`
	Latitude        string            `json:"latitude"`
	Longitude       string            `json:"longitude"`
}
