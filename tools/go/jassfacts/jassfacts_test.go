package jassfacts

import (
	"os"
	"path/filepath"
	"testing"
)

// ⭐ 承重的那一條：迴圈**展開**。Python 檔頭逐字點名
// 「`Trig_SuperFF7_Actions` 的七連斬 … ⛔ 不展開迴圈的話它只有 2 拍，
//
//	展開之後才是 14 拍 —— 而『連斬七次』正是卡面承諾的那個數字」。
//
// ⇒ 把 loopMultipliers 的乘數拿掉（mult[i] 恆為 1），這一條就會紅。
func parseSrc(t *testing.T, src string) map[string]*Group {
	t.Helper()
	p := filepath.Join(t.TempDir(), "war3map.j")
	if err := os.WriteFile(p, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	g, err := Parse(p)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestLoopExpansion(t *testing.T) {
	cases := []struct {
		name    string
		exitwhen string
		setup   string
		wantDmg int
		wantUnb bool
	}{
		{"literal bound", "exitwhen udg_i > 7", "", 7, false},
		{"variable bound", "exitwhen udg_i > udg_N", "set udg_N = 3", 3, false},
		{"unresolvable bound", "exitwhen udg_i > udg_Lv", "", 1, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			g := parseSrc(t, `function InitTrig_Combo takes nothing returns nothing
endfunction
function Trig_Combo_Actions takes nothing returns nothing
    `+c.setup+`
    loop
        `+c.exitwhen+`
        call UnitDamageTargetBJ( u, t, 100.00 )
        call TriggerSleepAction( 0.10 )
    endloop
endfunction
`)
			got := g["Combo"]
			if got == nil {
				t.Fatal("no Combo group")
			}
			if got.DamageCalls != c.wantDmg {
				t.Errorf("damageCalls = %d, want %d", got.DamageCalls, c.wantDmg)
			}
			if got.WaitBeats != c.wantDmg {
				t.Errorf("waitBeats = %d, want %d", got.WaitBeats, c.wantDmg)
			}
			if len(got.WaitValues) != c.wantDmg {
				t.Errorf("waitValues len = %d, want %d", len(got.WaitValues), c.wantDmg)
			}
			if got.UnboundedLoop != c.wantUnb {
				t.Errorf("unboundedLoop = %v, want %v", got.UnboundedLoop, c.wantUnb)
			}
		})
	}
}

// 模型路徑一律取呼叫之後**最後**一個字串（巢狀 BJ 呼叫的第一個 ")" 在裡面）。
func TestSfxStemFromNestedCall(t *testing.T) {
	g := parseSrc(t, `function InitTrig_Fx takes nothing returns nothing
endfunction
function Trig_Fx_Actions takes nothing returns nothing
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl" )
endfunction
`)
	if got := g["Fx"].Sfx["warstompcaster"]; got != 1 {
		t.Errorf("sfx[warstompcaster] = %d, want 1 (sfx=%v)", got, g["Fx"].Sfx)
	}
}
