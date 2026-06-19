package types

import (
	"encoding/json"
	"strconv"
	"strings"
)

type FlexFloat64 float64

func (ff *FlexFloat64) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*ff = 0
		return nil
	}

	// attempt to unmarshal as a float first
	var f float64
	if err := json.Unmarshal(b, &f); err == nil {
		*ff = FlexFloat64(f)
		return nil
	}

	// fallback to string and parse as a float
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		// Strip common currency junk like commas or $
		junk := []string{
			",",
			"$",
			" ",
		}
		for _, char := range junk {
			s = strings.ReplaceAll(s, char, "")
		}
		f, _ := strconv.ParseFloat(s, 64)
		*ff = FlexFloat64(f)
		return nil
	}

	return nil
}
