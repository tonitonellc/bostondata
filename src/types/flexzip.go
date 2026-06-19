package types

import (
	"encoding/json"
	"strconv"
	"strings"
)

type FlexZip string

func (fz *FlexZip) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		*fz = ""
		return nil
	}

	// attempt to unmarshal as a string first (preserves leading zeros e.g. "07302")
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*fz = FlexZip(strings.TrimSpace(s))
		return nil
	}

	// fallback: unmarshal as an int (e.g. 10001 → "10001")
	var i int64
	if err := json.Unmarshal(b, &i); err == nil {
		*fz = FlexZip(strconv.FormatInt(i, 10))
		return nil
	}

	return nil
}
