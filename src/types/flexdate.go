package types

import (
	"encoding/json"
	"strings"
	"time"
)

type FlexDate time.Time

func (fd *FlexDate) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), "\"")
	if s == "null" || s == "" {
		return nil
	}

	// most specific to least specific
	layouts := []string{
		time.RFC3339,          // 2023-07-05T00:00:00Z
		"2006-01-02T15:04:05", // 2023-07-05T00:00:00
		"2006-01-02",          // 2023-07-05
		"1/2/2006",            // 7/2/2025 or 07/02/2025
		"2006",                // 2025
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			*fd = FlexDate(t)
			return nil
		}
	}

	return nil
}

func (fd FlexDate) MarshalJSON() ([]byte, error) {
	t := time.Time(fd)
	if t.IsZero() {
		return json.Marshal(nil)
	}
	return json.Marshal(t.Format(time.RFC3339))
}
