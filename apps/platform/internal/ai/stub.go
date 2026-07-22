package ai

import (
	"bytes"
	"fmt"
	"hash/fnv"
	"image"
	"image/color"
	"image/png"
	"strings"
)

// StubResult carries a deterministic placeholder so the whole editor flow is
// exercisable with NO provider configured.

// hash64 is a stable FNV-1a hash of the seed (same seed => same art/text).
func hash64(seed string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(seed))
	return h.Sum64()
}

// hsvToRGB converts h∈[0,360) s,v∈[0,1] to an 8-bit RGB colour.
func hsvToRGB(h, s, v float64) color.RGBA {
	c := v * s
	x := c * (1 - abs(mod(h/60.0, 2)-1))
	m := v - c
	var r, g, b float64
	switch {
	case h < 60:
		r, g, b = c, x, 0
	case h < 120:
		r, g, b = x, c, 0
	case h < 180:
		r, g, b = 0, c, x
	case h < 240:
		r, g, b = 0, x, c
	case h < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return color.RGBA{
		R: clamp8((r + m) * 255),
		G: clamp8((g + m) * 255),
		B: clamp8((b + m) * 255),
		A: 255,
	}
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func mod(a, b float64) float64 {
	m := a - b*float64(int(a/b))
	if m < 0 {
		m += b
	}
	return m
}

func clamp8(f float64) uint8 {
	if f < 0 {
		return 0
	}
	if f > 255 {
		return 255
	}
	return uint8(f)
}

func lerp(a, b uint8, t float64) uint8 {
	return clamp8(float64(a) + (float64(b)-float64(a))*t)
}

// PlaceholderPNG renders a deterministic "gradient + glyph" placeholder icon
// for the given seed (the prompt). The background is a diagonal gradient
// between two hash-derived hues; on top sits a 5×5 mirror-symmetric identicon
// glyph in a contrasting colour — distinct per prompt, stable across calls.
func PlaceholderPNG(seed string, size int) ([]byte, error) {
	if size < minSize {
		size = defaultSize
	}
	if size > maxStubSize {
		size = maxStubSize
	}
	h := hash64(seed)

	baseHue := float64(h % 360)
	accentHue := mod(baseHue+140+float64((h>>16)%80), 360)
	cTop := hsvToRGB(baseHue, 0.55, 0.32)                    // dark corner
	cBot := hsvToRGB(mod(baseHue+40, 360), 0.65, 0.60)       // lighter corner
	glyph := hsvToRGB(accentHue, 0.70, 0.95)                 // bright glyph
	glyphAlt := hsvToRGB(mod(accentHue+30, 360), 0.55, 0.80) // secondary blocks

	img := image.NewRGBA(image.Rect(0, 0, size, size))
	// diagonal gradient background
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			t := float64(x+y) / float64(2*(size-1))
			img.SetRGBA(x, y, color.RGBA{
				R: lerp(cTop.R, cBot.R, t),
				G: lerp(cTop.G, cBot.G, t),
				B: lerp(cTop.B, cBot.B, t),
				A: 255,
			})
		}
	}

	// 5×5 mirror-symmetric identicon. 15 independent cells (left 3 columns);
	// columns 3,4 mirror columns 1,0. Cell "on" is decided by hash bits; a
	// second bit picks the glyph shade so the sigil has a little structure.
	const grid = 5
	cell := size / (grid + 2) // 1-cell padding on each side
	if cell < 1 {
		cell = 1
	}
	offset := (size - cell*grid) / 2
	bits := h
	for gy := 0; gy < grid; gy++ {
		for gx := 0; gx < (grid+1)/2; gx++ {
			idx := uint(gy*3 + gx)
			on := (bits>>(idx%64))&1 == 1
			alt := (bits>>((idx+7)%64))&1 == 1
			if !on {
				continue
			}
			col := glyph
			if alt {
				col = glyphAlt
			}
			fillCell(img, offset+gx*cell, offset+gy*cell, cell, col)
			mx := grid - 1 - gx
			if mx != gx {
				fillCell(img, offset+mx*cell, offset+gy*cell, cell, col)
			}
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func fillCell(img *image.RGBA, x0, y0, cell int, col color.RGBA) {
	b := img.Bounds()
	for y := y0; y < y0+cell && y < b.Max.Y; y++ {
		for x := x0; x < x0+cell && x < b.Max.X; x++ {
			img.SetRGBA(x, y, col)
		}
	}
}

// stubText returns a deterministic canned string for the given field, derived
// from the prompt so the editor sees plausible placeholder copy even with no
// provider configured. It is clearly marked (via the `stub:true` flag on the
// response) so the user knows to configure AI for real generation.
func stubText(field, prompt, ctx string) string {
	field = strings.TrimSpace(field)
	subject := firstWords(strings.TrimSpace(prompt), 6)
	if subject == "" {
		subject = firstWords(strings.TrimSpace(ctx), 6)
	}
	if subject == "" {
		subject = "這個項目"
	}
	switch strings.ToLower(field) {
	case "description", "desc", "描述", "說明":
		return fmt.Sprintf("%s — 一名身經百戰的競技場鬥士，招式凌厲、身法飄逸。（AI 尚未設定，這是預留占位文字，設定後可重新生成。）", subject)
	case "name", "title", "名稱", "標題":
		return fmt.Sprintf("%s（占位名稱）", subject)
	case "lore", "flavor", "flavour", "背景":
		return fmt.Sprintf("關於「%s」的傳說仍在流傳。（占位文字：請於後台設定 AI 供應商後重新生成。）", subject)
	case "tip", "tips", "提示":
		return fmt.Sprintf("善用「%s」的位移接續控制，能在對線期取得優勢。（占位提示）", subject)
	default:
		if field == "" {
			return fmt.Sprintf("關於「%s」的占位文字。設定 AI 供應商後可生成正式內容。", subject)
		}
		return fmt.Sprintf("[%s] 關於「%s」的占位文字。設定 AI 供應商後可生成正式內容。", field, subject)
	}
}

// firstWords returns up to n whitespace-separated tokens of s, joined by a
// space, trimmed to a sane length.
func firstWords(s string, n int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	fields := strings.Fields(s)
	if len(fields) > n {
		fields = fields[:n]
	}
	out := strings.Join(fields, " ")
	if r := []rune(out); len(r) > 60 {
		out = string(r[:60])
	}
	return out
}
