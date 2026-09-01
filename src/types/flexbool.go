package types

import (
	"encoding/json"
	"strings"
)

// FlexBool unmarshals the various boolean encodings used across Boston Data
// Portal datasets: native JSON booleans, and the single-letter "t"/"f"
// strings (plus "true"/"false") returned by datastore_search_sql, which casts
// every Postgres column — booleans included — to text. Absent/null values
// unmarshal to false, matching FlexFloat64's zero-value-on-null behavior.
type FlexBool bool

func (fb *FlexBool) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*fb = false
		return nil
	}

	// postgres boolean cast to text ("t"/"f", or "true"/"false")
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "t", "true":
			*fb = true
		case "f", "false":
			*fb = false
		}
		return nil
	}

	// there's no bool fallback because this dataset isn't modified annually
	// and therefore will not have a schema change fromt `text` type

	return nil
}
