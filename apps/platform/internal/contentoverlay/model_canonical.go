package contentoverlay

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// Match the shared content hash: sorted UTF-16 keys, ES number spelling and
// unescaped Unicode. Ordinary Go JSON escaping/float exponents are different.
func canonicalModelJSON(raw []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	var out bytes.Buffer
	var emit func(any) error
	quote := func(s string) {
		out.WriteByte('"')
		for _, r := range s {
			switch r {
			case '"', '\\':
				out.WriteByte('\\')
				out.WriteRune(r)
			case '\b':
				out.WriteString(`\b`)
			case '\f':
				out.WriteString(`\f`)
			case '\n':
				out.WriteString(`\n`)
			case '\r':
				out.WriteString(`\r`)
			case '\t':
				out.WriteString(`\t`)
			default:
				if r < 32 {
					fmt.Fprintf(&out, `\u%04x`, r)
				} else {
					out.WriteRune(r)
				}
			}
		}
		out.WriteByte('"')
	}
	emit = func(v any) error {
		switch x := v.(type) {
		case nil:
			out.WriteString("null")
		case bool:
			out.WriteString(strconv.FormatBool(x))
		case string:
			quote(x)
		case float64:
			if x == 0 {
				out.WriteByte('0')
				break
			}
			if math.Abs(x) >= 1e-6 && math.Abs(x) < 1e21 {
				out.WriteString(strconv.FormatFloat(x, 'f', -1, 64))
			} else {
				n := strconv.FormatFloat(x, 'e', -1, 64)
				n = strings.Replace(n, "e-0", "e-", 1)
				n = strings.Replace(n, "e+0", "e+", 1)
				out.WriteString(n)
			}
		case []any:
			out.WriteByte('[')
			for i, item := range x {
				if i > 0 {
					out.WriteByte(',')
				}
				if err := emit(item); err != nil {
					return err
				}
			}
			out.WriteByte(']')
		case map[string]any:
			keys := make([]string, 0, len(x))
			for k := range x {
				keys = append(keys, k)
			}
			sort.Slice(keys, func(i, j int) bool {
				a, b := utf16.Encode([]rune(keys[i])), utf16.Encode([]rune(keys[j]))
				for k := 0; k < len(a) && k < len(b); k++ {
					if a[k] != b[k] {
						return a[k] < b[k]
					}
				}
				return len(a) < len(b)
			})
			out.WriteByte('{')
			for i, k := range keys {
				if i > 0 {
					out.WriteByte(',')
				}
				quote(k)
				out.WriteByte(':')
				if err := emit(x[k]); err != nil {
					return err
				}
			}
			out.WriteByte('}')
		default:
			return fmt.Errorf("unsupported model JSON value")
		}
		return nil
	}
	if err := emit(value); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
