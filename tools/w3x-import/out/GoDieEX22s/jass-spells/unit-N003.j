// unit rawcode: N003
// keyed by hero-activation cluster (no ability rawcode)
// source: tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (CR-normalized line numbers)
// generator: tools/w3x-import/extract_jass_spells.py
// trigger families: init_Die, AnKiMagic, BlackBoom, Bleach_Moon, Bleach_Null, Bleach_Null_start, Bleach_Rush, Bleach_Strike, Blood, BloodKill, Blood_Cast, BlueDragonWave, CallPay, ChangeDNA, ChangeNote, ChoChuFireDro, CombineOne, Cookie, Deal_Elemental_Effect, DeathEye, DeathHeart, DeathTrain, DefEndC, DefMagic, DefStartC, DestWall, Dontkick, EarthBoom, Eat, EightCloud, Elemental_Buff_Attempt, EvilEye, FireBird, FlySwallow, GaiaAngre, Get_Magic_EX, GodWind, HolyShit, HunrThum, ImbaEye, Initiate_Fan_Toss, KaoLight, KniSkill, KnockBack, Legendary_Strike, Light, LightAttack, LightCut, MagicStamp, NO_Eat, NineSlash, Open_World, PayDie, Ptt_Judge, RiderSprint, Riderspell, Set_Charges, ShanWindDragon, SkySlash, Spell_Mark, The_End_ofWorld, The_End_ofWorldStart, ThuBird, TrueBlackBoom, TrueBody, WolfStrike, Wolf_EX, YouDie, animal, chieken, farmer, goagain, godJumpWall, godback, link, lzfs, newlzfs

// === family init_Die (armed) events=none ===

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36897) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Orkn' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36904) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'N003' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func010002 (family, line 36911) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func010002 takes nothing returns nothing
    call SetPlayerAbilityAvailableBJ( false, 'A0LS', GetEnumPlayer() )
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36915) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01N' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36922) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Uwar' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36929) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Harf' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36936) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Hvsh' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36943) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Umal' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36950) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Osam' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36957) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36964) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001C (family, line 36971) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Huth' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001C (family, line 36978) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Othr' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001C (family, line 36985) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Naka' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001C (family, line 36992) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Edem' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001Func001C (family, line 36999) ---
function Trig_init_Die_Func002Func002Func001Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Emns' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001Func001C (family, line 37006) ---
function Trig_init_Die_Func002Func002Func001Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Opgh' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func001C (family, line 37013) ---
function Trig_init_Die_Func002Func002Func001Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Hpal' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002Func001Func008A (family, line 37020) ---
function Trig_init_Die_Func002Func002Func001Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_init_Die_Func002Func002Func001C (family, line 37025) ---
function Trig_init_Die_Func002Func002Func001C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Eevi' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002Func002C (family, line 37032) ---
function Trig_init_Die_Func002Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Obla' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Func002C (family, line 37039) ---
function Trig_init_Die_Func002C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Ubal' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_init_Die_Actions (family, line 37046) ---
function Trig_init_Die_Actions takes nothing returns nothing
    // 未在此觸發內英雄--皮卡丘、皮卡娘、飛影、鋼彈
    if ( Trig_init_Die_Func002C() ) then
        call EnableTrigger( gg_trg_EvilEye )
        call EnableTrigger( gg_trg_CombineOne )
        call EnableTrigger( gg_trg_HolyShit )
        call EnableTrigger( gg_trg_DestWall )
        call EnableTrigger( gg_trg_BlackBoom )
        call EnableTrigger( gg_trg_TrueBlackBoom )
        set udg_BaMDesWallUnit = GetTriggerUnit()
        call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "巴恩: 看黑核晶就像煙火慶祝魔界浮上地面" + "|r" ) ) )
    else
        if ( Trig_init_Die_Func002Func002C() ) then
            call EnableTrigger( gg_trg_animal )
            call EnableTrigger( gg_trg_GaiaAngre )
            call EnableTrigger( gg_trg_chieken )
            call EnableTrigger( gg_trg_farmer )
            call EnableTrigger( gg_trg_goagain )
            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "牧太郎: 老闆~無薪假又要責任制了嗎?" + "|r" ) ) )
        else
            if ( Trig_init_Die_Func002Func002Func001C() ) then
                call EnableTrigger( gg_trg_SkySlash )
                call EnableTrigger( gg_trg_NineSlash )
                call CreateNUnitsAtLoc( 1, 'o01P', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
                call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetRectCenter(gg_rct_SpecialUnitCreateArea), bj_UNIT_FACING )
                call TriggerSleepAction( 2.00 )
                call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'o01P'), function Trig_init_Die_Func002Func002Func001Func008A )
                call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "劍心: 我的時代已經過去了...為何招喚我" + "|r" ) ) )
            else
                if ( Trig_init_Die_Func002Func002Func001Func001C() ) then
                    set udg_EyesMaster = GetTriggerUnit()
                    call EnableTrigger( gg_trg_CallPay )
                    call EnableTrigger( gg_trg_EightCloud )
                    call EnableTrigger( gg_trg_PayDie )
                    call EnableTrigger( gg_trg_Light )
                    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "八雲: 又來到一個死不完的地獄" + "|r" ) ) )
                else
                    if ( Trig_init_Die_Func002Func002Func001Func001Func001C() ) then
                        call EnableTrigger( gg_trg_KnockBack )
                        call EnableTrigger( gg_trg_KniSkill )
                        call EnableTrigger( gg_trg_DefStartC )
                        call EnableTrigger( gg_trg_DefEndC )
                        call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "趙雲: 有沒有三國無雙都變成超級賽亞人的八卦?" + "|r" ) ) )
                    else
                        if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001C() ) then
                            set udg_DeathGod = GetTriggerUnit()
                            call EnableTrigger( gg_trg_ChangeNote )
                            call EnableTrigger( gg_trg_DeathEye )
                            call EnableTrigger( gg_trg_DeathHeart )
                            call EnableTrigger( gg_trg_DeathTrain )
                            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "夜神月: 你知道嗎?死神是只吃蘋果的" + "|r" ) ) )
                        else
                            if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001C() ) then
                                set udg_ChoChuUnit = GetTriggerUnit()
                                call EnableTrigger( gg_trg_Spell_Mark )
                                call EnableTrigger( gg_trg_LightCut )
                                call EnableTrigger( gg_trg_ChoChuFireDro )
                                call EnableTrigger( gg_trg_ThuBird )
                                call EnableTrigger( gg_trg_ImbaEye )
                                set udg_ZZ_LC_Caster = GetTriggerUnit()
                                call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "佐助: 總有一天我要用寫輪眼直接爆掉火影忍者村" + "|r" ) ) )
                            else
                                if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001C() ) then
                                    set udg_NiJan2 = GetTriggerUnit()
                                    set udg_ElementalBuffedUnit = null
                                    call EnableTrigger( gg_trg_Initiate_Fan_Toss )
                                    call EnableTrigger( gg_trg_Set_Charges )
                                    call EnableTrigger( gg_trg_Elemental_Buff_Attempt )
                                    call EnableTrigger( gg_trg_Deal_Elemental_Effect )
                                    call EnableTrigger( gg_trg_FlySwallow )
                                    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "風魔: 任務...接受" + "|r" ) ) )
                                else
                                    if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001C() ) then
                                        call InitSetup( GetTriggerUnit() )
                                        call EnableTrigger( gg_trg_Wolf_EX )
                                        call EnableTrigger( gg_trg_Legendary_Strike )
                                        call EnableTrigger( gg_trg_WolfStrike )
                                        call EnableTrigger( gg_trg_Dontkick )
                                        call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "金鋼狼: 我要用我的爪子 塞到你的(逼...)" + "|r" ) ) )
                                    else
                                        if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                            call EnableTrigger( gg_trg_Cookie )
                                            call EnableTrigger( gg_trg_Eat )
                                            call EnableTrigger( gg_trg_NO_Eat )
                                            call EnableTrigger( gg_trg_EarthBoom )
                                            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "普烏: 噗~~~~~來吧來吧!" + "|r" ) ) )
                                        else
                                            if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                call EnableTrigger( gg_trg_DefMagic )
                                                call EnableTrigger( gg_trg_AnKiMagic )
                                                call EnableTrigger( gg_trg_KaoLight )
                                                call EnableTrigger( gg_trg_Get_Magic_EX )
                                                set udg_KaoUnit = GetTriggerUnit()
                                                call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "傑洛士: 這也不是我願意的呢" + "|r" ) ) )
                                            else
                                                if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                    call EnableTrigger( gg_trg_ShanWindDragon )
                                                    call EnableTrigger( gg_trg_GodWind )
                                                    call EnableTrigger( gg_trg_FireBird )
                                                    call EnableTrigger( gg_trg_TrueBody )
                                                    set udg_WindDragonUnit = GetTriggerUnit()
                                                    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "鬼眼狂刀: 反正我只要隨便砍一刀你就會爆體了" + "|r" ) ) )
                                                else
                                                    if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                        call EnableTrigger( gg_trg_BlueDragonWave )
                                                        call EnableTrigger( gg_trg_lzfs )
                                                        call EnableTrigger( gg_trg_newlzfs )
                                                        call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "殺生丸: 你也是讓我決定生死的人吧" + "|r" ) ) )
                                                    else
                                                        if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                            call EnableTrigger( gg_trg_YouDie )
                                                            call EnableTrigger( gg_trg_ChangeDNA )
                                                            call EnableTrigger( gg_trg_LightAttack )
                                                            call EnableTrigger( gg_trg_HunrThum )
                                                            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "拳四郎: 身上有七顆痔瘡的男人將會帶來災難" + "|r" ) ) )
                                                        else
                                                            if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                set udg_BloodKillAccount = 0
                                                                set udg_Rider = GetTriggerUnit()
                                                                call EnableTrigger( gg_trg_Blood_Cast )
                                                                call EnableTrigger( gg_trg_Blood )
                                                                call EnableTrigger( gg_trg_BloodKill )
                                                                call EnableTrigger( gg_trg_Riderspell )
                                                                call EnableTrigger( gg_trg_link )
                                                                call EnableTrigger( gg_trg_RiderSprint )
                                                                call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "Rider: 我感到我正在加速...和馬一起加速...." + "|r" ) ) )
                                                            else
                                                                if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                    call EnableTrigger( gg_trg_Open_World )
                                                                    call EnableTrigger( gg_trg_Ptt_Judge )
                                                                    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "鄭先生: 你吃過洨嗎?" + "|r" ) ) )
                                                                else
                                                                    if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                        call EnableTrigger( gg_trg_godJumpWall )
                                                                        call EnableTrigger( gg_trg_godback )
                                                                        call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "撒尿牛丸: 自從我吃了撒尿牛丸之後，考試都考一百分！" + "|r" ) ) )
                                                                    else
                                                                        if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                            call TriggerRegisterUnitEvent( gg_trg_Bleach_Null, GetTriggerUnit(), EVENT_UNIT_DAMAGED )
                                                                            set udg_BleachUnit = GetTriggerUnit()
                                                                            call EnableTrigger( gg_trg_Bleach_Rush )
                                                                            call EnableTrigger( gg_trg_Bleach_Strike )
                                                                            call EnableTrigger( gg_trg_Bleach_Moon )
                                                                            call EnableTrigger( gg_trg_Bleach_Null_start )
                                                                            set udg_BleachPlayerNum = GetOwningPlayer(GetTriggerUnit())
                                                                            set udg_BleachGosNum = udg_BleachPlayerNum
                                                                            call ForForce( GetPlayersAll(), function Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func010002 )
                                                                            call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "一護: 喔喔喔喔喔喔喔喔喔喔喔喔喔!!!!! (跨頁)" + "|r" ) ) )
                                                                        else
                                                                            if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                                set udg_EVN_Unit = GetTriggerUnit()
                                                                                call EnableTrigger( gg_trg_The_End_ofWorld )
                                                                                call EnableTrigger( gg_trg_The_End_ofWorldStart )
                                                                                call EnableTrigger( gg_trg_MagicStamp )
                                                                                call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "依文: 讓我吸你的血吧?嗯? " + "|r" ) ) )
                                                                            else
                                                                                if ( Trig_init_Die_Func002Func002Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001Func001C() ) then
                                                                                    set udg_Train_Unit = GetTriggerUnit()
                                                                                    call DisplayTextToForce( GetPlayersAll(), ( udg_Player_Colors[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] + ( "臭作: 我們已經是好碰友了!!嘿嘿!! " + "|r" ) ) )
                                                                                else
                                                                                endif
                                                                            endif
                                                                        endif
                                                                    endif
                                                                endif
                                                            endif
                                                        endif
                                                    endif
                                                endif
                                            endif
                                        endif
                                    endif
                                endif
                            endif
                        endif
                    endif
                endif
            endif
        endif
    endif
endfunction

// --- InitTrig_init_Die (family, line 37229) ---
function InitTrig_init_Die takes nothing returns nothing
    set gg_trg_init_Die = CreateTrigger(  )
    call TriggerRegisterEnterRectSimple( gg_trg_init_Die, GetPlayableMapRect() )
    call TriggerAddAction( gg_trg_init_Die, function Trig_init_Die_Actions )
endfunction

// === family AnKiMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_AnKiMagic_Conditions (family, line 39954) ---
function Trig_AnKiMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0UE' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Func004Func004Func001C (family, line 39961) ---
function Trig_AnKiMagic_Func004Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_KaoUnit)) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Func004Func004A (family, line 39968) ---
function Trig_AnKiMagic_Func004Func004A takes nothing returns nothing
    if ( Trig_AnKiMagic_Func004Func004Func001C() ) then
        set udg_SumOfSinMagic = ( udg_SumOfSinMagic + GetUnitStateSwap(UNIT_STATE_MANA, GetEnumUnit()) )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Undead\\Darksummoning\\DarkSummonTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_AnKiMagic_Func004C (family, line 39977) ---
function Trig_AnKiMagic_Func004C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_KaoUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_AnKiMagic_Actions (family, line 39984) ---
function Trig_AnKiMagic_Actions takes nothing returns nothing
    set udg_KaoUnit = GetTriggerUnit()
    set udg_KaoIndex = 0.00
    set udg_KaoAngle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_AnKiMagic_Func004C() ) then
        call AddSpecialEffectTargetUnitBJ( "chest", udg_KaoUnit, "Abilities\\Spells\\Undead\\DeathCoil\\DeathCoilMissile.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_SumOfSinMagic = 0.00
        call ForGroupBJ( GetUnitsInRangeOfLocAll(1200.00, GetUnitLoc(udg_KaoUnit)), function Trig_AnKiMagic_Func004Func004A )
        set udg_SumOfSinMagic = ( udg_SumOfSinMagic * 0.03 )
    else
    endif
    call EnableTrigger( gg_trg_AnKiMagic_Effect )
endfunction

// --- InitTrig_AnKiMagic (family, line 40000) ---
function InitTrig_AnKiMagic takes nothing returns nothing
    set gg_trg_AnKiMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_AnKiMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_AnKiMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_AnKiMagic, Condition( function Trig_AnKiMagic_Conditions ) )
    call TriggerAddAction( gg_trg_AnKiMagic, function Trig_AnKiMagic_Actions )
endfunction

// === family BlackBoom (armed) events=none ===

// --- Trig_BlackBoom_Func004C (family, line 44592) ---
function Trig_BlackBoom_Func004C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetEnteringUnit()) == 'n00O' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetEnteringUnit()) == 'n00Y' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetEnteringUnit()) == 'n00Z' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetEnteringUnit()) == 'n00X' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_BlackBoom_Conditions (family, line 44608) ---
function Trig_BlackBoom_Conditions takes nothing returns boolean
    if ( not Trig_BlackBoom_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackBoom_Func002Func001Func003C (family, line 44615) ---
function Trig_BlackBoom_Func002Func001Func003C takes nothing returns boolean
    if ( not ( udg_BlackBoomCounter == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackBoom_Func002Func001Func005C (family, line 44622) ---
function Trig_BlackBoom_Func002Func001Func005C takes nothing returns boolean
    if ( not ( udg_BlackBoomCounter >= 7 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackBoom_Func002Func001C (family, line 44629) ---
function Trig_BlackBoom_Func002Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlackBoom_Func002A (family, line 44636) ---
function Trig_BlackBoom_Func002A takes nothing returns nothing
    if ( Trig_BlackBoom_Func002Func001C() ) then
        if ( Trig_BlackBoom_Func002Func001Func003C() ) then
            set udg_BlackBoomUnit = GetEnumUnit()
        else
        endif
        set udg_BlackBoomCounter = ( udg_BlackBoomCounter + 1 )
        if ( Trig_BlackBoom_Func002Func001Func005C() ) then
            call KillUnit( udg_BlackBoomUnit )
            set udg_BlackBoomCounter = ( udg_BlackBoomCounter - 1 )
        else
        endif
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_BlackBoom_Actions (family, line 44653) ---
function Trig_BlackBoom_Actions takes nothing returns nothing
    set udg_BlackBoomCounter = 0
    call ForGroupBJ( udg_BlackBoomGroup, function Trig_BlackBoom_Func002A )
    call GroupAddUnitSimple( GetEnteringUnit(), udg_BlackBoomGroup )
endfunction

// --- InitTrig_BlackBoom (family, line 44660) ---
function InitTrig_BlackBoom takes nothing returns nothing
    set gg_trg_BlackBoom = CreateTrigger(  )
    call DisableTrigger( gg_trg_BlackBoom )
    call TriggerRegisterEnterRectSimple( gg_trg_BlackBoom, GetEntireMapRect() )
    call TriggerAddCondition( gg_trg_BlackBoom, Condition( function Trig_BlackBoom_Conditions ) )
    call TriggerAddAction( gg_trg_BlackBoom, function Trig_BlackBoom_Actions )
endfunction

// === family Bleach_Moon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Moon_Conditions (family, line 37492) ---
function Trig_Bleach_Moon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0LL' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Func007C (family, line 37499) ---
function Trig_Bleach_Moon_Func007C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'H01O' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Moon_Actions (family, line 37506) ---
function Trig_Bleach_Moon_Actions takes nothing returns nothing
    set udg_BleachUnit = GetTriggerUnit()
    set udg_BleachCastPoint = GetSpellTargetLoc()
    set udg_BleachTrigPoint = GetUnitLoc(udg_BleachUnit)
    set udg_BleachFaceAngle = AngleBetweenPoints(udg_BleachTrigPoint, udg_BleachCastPoint)
    set udg_BleachMoonDistan = 1000
    if ( Trig_Bleach_Moon_Func007C() ) then
        set udg_BleachMoonDam = ( ( 550.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01R', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    else
        set udg_BleachMoonDam = ( ( 300.00 + I2R(( GetUnitAbilityLevelSwapped('A0LL', udg_BleachUnit) * 150 )) ) + 0.00 )
        call CreateNUnitsAtLoc( 1, 'o01Q', GetOwningPlayer(udg_BleachUnit), GetUnitLoc(udg_BleachUnit), GetUnitFacing(udg_BleachUnit) )
        set udg_BleachCreateUnit = GetLastCreatedUnit()
        call SetUnitPathing( udg_BleachCreateUnit, false )
    endif
    call EnableTrigger( gg_trg_Bleach_Moon_Effect )
endfunction

// --- InitTrig_Bleach_Moon (family, line 37527) ---
function InitTrig_Bleach_Moon takes nothing returns nothing
    set gg_trg_Bleach_Moon = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Moon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Moon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Moon, Condition( function Trig_Bleach_Moon_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Moon, function Trig_Bleach_Moon_Actions )
endfunction

// === family Bleach_Null (armed) events=none ===

// --- Trig_Bleach_Null_Conditions (family, line 37687) ---
function Trig_Bleach_Null_Conditions takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(GetTriggerUnit(), 'B048') == true ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Null_Actions (family, line 37697) ---
function Trig_Bleach_Null_Actions takes nothing returns nothing
    call DamageModify(0)
endfunction

// --- InitTrig_Bleach_Null (family, line 37702) ---
function InitTrig_Bleach_Null takes nothing returns nothing
    set gg_trg_Bleach_Null = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Null )
    call TriggerAddCondition( gg_trg_Bleach_Null, Condition( function Trig_Bleach_Null_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Null, function Trig_Bleach_Null_Actions )
endfunction

// === family Bleach_Null_start (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Null_start_Conditions (family, line 37635) ---
function Trig_Bleach_Null_start_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0W5' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Null_start_Actions (family, line 37642) ---
function Trig_Bleach_Null_start_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0LS', GetTriggerUnit(), 2 )
    call SetUnitVertexColorBJ( udg_BleachUnit, 30.00, 30.00, 30.00, 0 )
    call EnableTrigger( gg_trg_Bleach_Null )
    call EnableTrigger( gg_trg_Bleach_Null_close )
endfunction

// --- InitTrig_Bleach_Null_start (family, line 37650) ---
function InitTrig_Bleach_Null_start takes nothing returns nothing
    set gg_trg_Bleach_Null_start = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Null_start )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Null_start, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Null_start, Condition( function Trig_Bleach_Null_start_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Null_start, function Trig_Bleach_Null_start_Actions )
endfunction

// === family Bleach_Rush (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Bleach_Rush_Conditions (family, line 37371) ---
function Trig_Bleach_Rush_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Func004Func001C (family, line 37378) ---
function Trig_Bleach_Rush_Func004Func001C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_BleachUnit, 'B02E') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Func004C (family, line 37385) ---
function Trig_Bleach_Rush_Func004C takes nothing returns boolean
    if ( not ( UnitHasBuffBJ(udg_BleachCaster, 'B03P') == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_BleachCaster) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_BleachCaster, UNIT_TYPE_GROUND) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(udg_BleachCaster, UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Rush_Actions (family, line 37401) ---
function Trig_Bleach_Rush_Actions takes nothing returns nothing
    set udg_BleachCaster = GetSpellTargetUnit()
    set udg_BleachUnit = GetTriggerUnit()
    call TriggerSleepAction( 0.10 )
    if ( Trig_Bleach_Rush_Func004C() ) then
        if ( Trig_Bleach_Rush_Func004Func001C() ) then
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Spells\\Other\\Volcano\\VolcanoDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + ( 50.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call TriggerSleepAction( 0.30 )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + ( 50.00 + I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        else
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + 50.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call TriggerSleepAction( 0.30 )
            call AddSpecialEffectLocBJ( GetUnitLoc(udg_BleachUnit), "Abilities\\Spells\\NightElf\\Blink\\BlinkCaster.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
            call SetUnitPositionLocFacingLocBJ( udg_BleachUnit, PolarProjectionBJ(GetUnitLoc(udg_BleachCaster), 100.00, AngleBetweenPoints(GetUnitLoc(udg_BleachUnit), GetUnitLoc(udg_BleachCaster))), GetUnitLoc(udg_BleachCaster) )
            call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachCaster, ( I2R(( GetUnitAbilityLevelSwapped('A0RX', udg_BleachUnit) * 50 )) + 50.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
            call SetUnitAnimation( udg_BleachUnit, "Attack" )
            call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachCaster, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
            call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        endif
    else
    endif
endfunction

// --- InitTrig_Bleach_Rush (family, line 37444) ---
function InitTrig_Bleach_Rush takes nothing returns nothing
    set gg_trg_Bleach_Rush = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Rush )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Rush, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Bleach_Rush, Condition( function Trig_Bleach_Rush_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Rush, function Trig_Bleach_Rush_Actions )
endfunction

// === family Bleach_Strike (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_Bleach_Strike_Conditions (family, line 37455) ---
function Trig_Bleach_Strike_Conditions takes nothing returns boolean
    if ( not ( GetAttacker() == udg_BleachUnit ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(GetAttacker(), 'B02E') == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetAttackedUnitBJ()), GetOwningPlayer(GetAttacker())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Bleach_Strike_Actions (family, line 37471) ---
function Trig_Bleach_Strike_Actions takes nothing returns nothing
    set udg_BleachTarget = GetAttackedUnitBJ()
    call UnitRemoveBuffBJ( 'B02E', udg_BleachUnit )
    call TriggerSleepAction( 0.10 )
    call AddSpecialEffectTargetUnitBJ( "chest", udg_BleachTarget, "BloodBreathStream.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitDamageTargetBJ( udg_BleachUnit, udg_BleachTarget, ( ( 50.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A0LK', udg_BleachUnit)) ) ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_BleachUnit, true)) * 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- InitTrig_Bleach_Strike (family, line 37481) ---
function InitTrig_Bleach_Strike takes nothing returns nothing
    set gg_trg_Bleach_Strike = CreateTrigger(  )
    call DisableTrigger( gg_trg_Bleach_Strike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Bleach_Strike, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Bleach_Strike, Condition( function Trig_Bleach_Strike_Conditions ) )
    call TriggerAddAction( gg_trg_Bleach_Strike, function Trig_Bleach_Strike_Actions )
endfunction

// === family Blood (passive) events=none ===

// --- Trig_Blood_Func001Func004Func001C (family, line 38471) ---
function Trig_Blood_Func001Func004Func001C takes nothing returns boolean
    if ( not ( IsPlayerAlly(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(udg_Blood_Unit)) == false ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'earc' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'nska' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Func001Func004A (family, line 38490) ---
function Trig_Blood_Func001Func004A takes nothing returns nothing
    if ( Trig_Blood_Func001Func004Func001C() ) then
        call UnitDamageTargetBJ( udg_Blood_Unit, GetEnumUnit(), ( 75.00 * I2R(GetUnitAbilityLevelSwapped('A06C', udg_Rider)) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call SetUnitLifePercentBJ( udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))], ( GetUnitLifePercent(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))]) + 1.00 ) )
        set udg_BloodSpecialPoint = GetUnitLoc(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(udg_Blood_Unit))])
        call AddSpecialEffectLocBJ( udg_BloodSpecialPoint, "Abilities\\Spells\\Undead\\ReplenishMana\\SpiritTouchTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_Blood_Func001C (family, line 38501) ---
function Trig_Blood_Func001C takes nothing returns boolean
    if ( not ( IsUnitAliveBJ(udg_Blood_Unit) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Actions (family, line 38508) ---
function Trig_Blood_Actions takes nothing returns nothing
    if ( Trig_Blood_Func001C() ) then
        set udg_Blood_Point = GetUnitLoc(udg_Blood_Unit)
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(580.00, udg_Blood_Point), function Trig_Blood_Func001Func004A )
        call RemoveLocation( udg_Blood_Point )
    else
        call DisableTrigger( GetTriggeringTrigger() )
    endif
endfunction

// --- InitTrig_Blood (family, line 38520) ---
function InitTrig_Blood takes nothing returns nothing
    set gg_trg_Blood = CreateTrigger(  )
    call DisableTrigger( gg_trg_Blood )
    call TriggerRegisterTimerEventPeriodic( gg_trg_Blood, 1.00 )
    call TriggerAddAction( gg_trg_Blood, function Trig_Blood_Actions )
endfunction

// === family BloodKill (armed) events=none ===

// --- Trig_BloodKill_Conditions (family, line 38530) ---
function Trig_BloodKill_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetKillingUnitBJ()) == 'o005' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BloodKill_Func002C (family, line 38537) ---
function Trig_BloodKill_Func002C takes nothing returns boolean
    if ( not ( udg_BloodKillAccount >= 14 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BloodKill_Actions (family, line 38544) ---
function Trig_BloodKill_Actions takes nothing returns nothing
    set udg_BloodKillAccount = ( udg_BloodKillAccount + 1 )
    if ( Trig_BloodKill_Func002C() ) then
        call ModifyHeroStat( bj_HEROSTAT_STR, udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], bj_MODIFYMETHOD_ADD, 1 )
        call ModifyHeroStat( bj_HEROSTAT_AGI, udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], bj_MODIFYMETHOD_ADD, 1 )
        call ModifyHeroStat( bj_HEROSTAT_INT, udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))], bj_MODIFYMETHOD_ADD, 1 )
        set udg_BloodKillAccount = 0
        set udg_BloodSpecialPoint = GetUnitLoc(udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetKillingUnitBJ()))])
        call AddSpecialEffectLocBJ( udg_BloodSpecialPoint, "Abilities\\Spells\\Undead\\DeathPact\\DeathPactCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call RemoveLocation( udg_BloodSpecialPoint )
    else
    endif
endfunction

// --- InitTrig_BloodKill (family, line 38560) ---
function InitTrig_BloodKill takes nothing returns nothing
    set gg_trg_BloodKill = CreateTrigger(  )
    call DisableTrigger( gg_trg_BloodKill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BloodKill, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_BloodKill, Condition( function Trig_BloodKill_Conditions ) )
    call TriggerAddAction( gg_trg_BloodKill, function Trig_BloodKill_Actions )
endfunction

// === family Blood_Cast (armed) events=none ===

// --- Trig_Blood_Cast_Conditions (family, line 38447) ---
function Trig_Blood_Cast_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetEnteringUnit()) == 'o005' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Blood_Cast_Actions (family, line 38454) ---
function Trig_Blood_Cast_Actions takes nothing returns nothing
    set udg_Blood_Unit = GetEnteringUnit()
    call EnableTrigger( gg_trg_Blood )
endfunction

// --- InitTrig_Blood_Cast (family, line 38460) ---
function InitTrig_Blood_Cast takes nothing returns nothing
    set gg_trg_Blood_Cast = CreateTrigger(  )
    call DisableTrigger( gg_trg_Blood_Cast )
    call TriggerRegisterEnterRectSimple( gg_trg_Blood_Cast, GetPlayableMapRect() )
    call TriggerAddCondition( gg_trg_Blood_Cast, Condition( function Trig_Blood_Cast_Conditions ) )
    call TriggerAddAction( gg_trg_Blood_Cast, function Trig_Blood_Cast_Actions )
endfunction

// === family BlueDragonWave (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_BlueDragonWave_Conditions (family, line 38856) ---
function Trig_BlueDragonWave_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0FP' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_BlueDragonWave_Func003A (family, line 38863) ---
function Trig_BlueDragonWave_Func003A takes nothing returns nothing
    call IssuePointOrderLocBJ( GetEnumUnit(), "smart", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 800.00, GetUnitFacing(GetTriggerUnit())) )
endfunction

// --- Trig_BlueDragonWave_Func005A (family, line 38867) ---
function Trig_BlueDragonWave_Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_BlueDragonWave_Actions (family, line 38872) ---
function Trig_BlueDragonWave_Actions takes nothing returns nothing
    set udg_BlueDargon = 1
    loop
        exitwhen udg_BlueDargon > 12
        call CreateNUnitsAtLoc( 1, 'n00N', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), ( I2R(udg_BlueDargon) * 12.00 ), ( I2R(udg_BlueDargon) * 30.00 )), bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call TriggerSleepAction( 0.03 )
        set udg_BlueDargon = udg_BlueDargon + 1
    endloop
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'n00N'), function Trig_BlueDragonWave_Func003A )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'n00N'), function Trig_BlueDragonWave_Func005A )
endfunction

// --- InitTrig_BlueDragonWave (family, line 38887) ---
function InitTrig_BlueDragonWave takes nothing returns nothing
    set gg_trg_BlueDragonWave = CreateTrigger(  )
    call DisableTrigger( gg_trg_BlueDragonWave )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_BlueDragonWave, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_BlueDragonWave, Condition( function Trig_BlueDragonWave_Conditions ) )
    call TriggerAddAction( gg_trg_BlueDragonWave, function Trig_BlueDragonWave_Actions )
endfunction

// === family CallPay (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CallPay_Conditions (family, line 42902) ---
function Trig_CallPay_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MM' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CallPay_Actions (family, line 42909) ---
function Trig_CallPay_Actions takes nothing returns nothing
    call KillUnit( udg_EyesPay )
    call RemoveUnit( udg_EyesPay )
    call CreateNUnitsAtLoc( 1, 'h01Q', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    set udg_EyesPay = GetLastCreatedUnit()
    call IssueTargetOrderBJ( udg_EyesPay, "move", GetTriggerUnit() )
endfunction

// --- InitTrig_CallPay (family, line 42918) ---
function InitTrig_CallPay takes nothing returns nothing
    set gg_trg_CallPay = CreateTrigger(  )
    call DisableTrigger( gg_trg_CallPay )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CallPay, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CallPay, Condition( function Trig_CallPay_Conditions ) )
    call TriggerAddAction( gg_trg_CallPay, function Trig_CallPay_Actions )
endfunction

// === family ChangeDNA (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChangeDNA_Func001C (family, line 38645) ---
function Trig_ChangeDNA_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HW' ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'Umal' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeDNA_Conditions (family, line 38655) ---
function Trig_ChangeDNA_Conditions takes nothing returns boolean
    if ( not Trig_ChangeDNA_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeDNA_Func008A (family, line 38662) ---
function Trig_ChangeDNA_Func008A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0HY', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_ChangeDNA_Func013A (family, line 38671) ---
function Trig_ChangeDNA_Func013A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChangeDNA_Actions (family, line 38676) ---
function Trig_ChangeDNA_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_DNAUnit = GetTriggerUnit()
    set udg_DNATime = ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 8.00 )
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call PlaySoundBJ( gg_snd_nocute )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, GetUnitLoc(GetTriggerUnit())), function Trig_ChangeDNA_Func008A )
    call RemoveLocation( udg_P1 )
    call EnableTrigger( gg_trg_LightAttack )
    call TriggerSleepAction( udg_DNATime )
    call DisableTrigger( gg_trg_LightAttack )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_DNAUnit), 'o00E'), function Trig_ChangeDNA_Func013A )
    call EnableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_ChangeDNA (family, line 38693) ---
function InitTrig_ChangeDNA takes nothing returns nothing
    set gg_trg_ChangeDNA = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChangeDNA )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChangeDNA, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChangeDNA, Condition( function Trig_ChangeDNA_Conditions ) )
    call TriggerAddAction( gg_trg_ChangeDNA, function Trig_ChangeDNA_Actions )
endfunction

// === family ChangeNote (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChangeNote_Conditions (family, line 42420) ---
function Trig_ChangeNote_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0SA' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChangeNote_Actions (family, line 42427) ---
function Trig_ChangeNote_Actions takes nothing returns nothing
    set udg_tempHP = GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit())
    call SetUnitLifeBJ( GetTriggerUnit(), GetUnitStateSwap(UNIT_STATE_LIFE, GetSpellTargetUnit()) )
    call SetUnitLifeBJ( GetSpellTargetUnit(), udg_tempHP )
    set udg_DeathUnit = null
    call CreateTextTagUnitBJ( ( GetUnitName(udg_DeathUnit) + " 我們來交換日記吧~" ), GetSpellTargetUnit(), 0, 10.00, 80.00, 80.00, 80.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.70 )
    call PlaySoundOnUnitBJ( gg_snd_KaelYesAttack3, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_ChangeNote (family, line 42441) ---
function InitTrig_ChangeNote takes nothing returns nothing
    set gg_trg_ChangeNote = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChangeNote )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChangeNote, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChangeNote, Condition( function Trig_ChangeNote_Conditions ) )
    call TriggerAddAction( gg_trg_ChangeNote, function Trig_ChangeNote_Actions )
endfunction

// === family ChoChuFireDro (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ChoChuFireDro_Conditions (family, line 42096) ---
function Trig_ChoChuFireDro_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0M7' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChoChuFireDro_Func009A (family, line 42103) ---
function Trig_ChoChuFireDro_Func009A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), udg_ChoChuTargetPoint )
endfunction

// --- Trig_ChoChuFireDro_Func015Func001C (family, line 42107) ---
function Trig_ChoChuFireDro_Func015Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(udg_ChoChuUnit), GetOwningPlayer(GetEnumUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ChoChuFireDro_Func015A (family, line 42114) ---
function Trig_ChoChuFireDro_Func015A takes nothing returns nothing
    if ( Trig_ChoChuFireDro_Func015Func001C() ) then
        call UnitDamageTargetBJ( udg_ChoChuUnit, GetEnumUnit(), ( I2R(( udg_ChoChuSkill * 100 )) + ( 150.00 + I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_ChoChuUnit, true) * 2 )) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_ChoChuFireDro_Func017A (family, line 42124) ---
function Trig_ChoChuFireDro_Func017A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func019A (family, line 42129) ---
function Trig_ChoChuFireDro_Func019A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func020A (family, line 42134) ---
function Trig_ChoChuFireDro_Func020A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Func021A (family, line 42139) ---
function Trig_ChoChuFireDro_Func021A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ChoChuFireDro_Actions (family, line 42144) ---
function Trig_ChoChuFireDro_Actions takes nothing returns nothing
    set udg_ChoChuUnit = GetTriggerUnit()
    set udg_ChoChuSkill = GetUnitAbilityLevelSwapped('A0M7', GetTriggerUnit())
    set udg_ChoChuTargetPoint = GetSpellTargetLoc()
    set udg_ChoChuPoint = GetUnitLoc(GetTriggerUnit())
    set udg_ChoChuCounter = 1
    loop
        exitwhen udg_ChoChuCounter > ( GetUnitAbilityLevelSwapped('A0M7', GetTriggerUnit()) * 1 )
        call CreateNUnitsAtLoc( 1, 'o020', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuPoint, GetUnitFacing(GetTriggerUnit()) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_ChoChuGroup )
        set udg_ChoChuCounter = udg_ChoChuCounter + 1
    endloop
    call CreateNUnitsAtLoc( 1, 'o021', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuPoint, GetUnitFacing(GetTriggerUnit()) )
    call GroupAddUnitSimple( GetLastCreatedUnit(), udg_ChoChuGroup )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_ChoChuGroup, function Trig_ChoChuFireDro_Func009A )
    call AddSpecialEffectLocBJ( udg_ChoChuTargetPoint, "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_ChoChuTargetPoint, bj_UNIT_FACING )
    call UnitAddAbilityBJ( 'Acht', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "howlofterror" )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(330.00, udg_ChoChuTargetPoint), function Trig_ChoChuFireDro_Func015A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_ChoChuGroup, function Trig_ChoChuFireDro_Func017A )
    call GroupClear( udg_ChoChuGroup )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o020'), function Trig_ChoChuFireDro_Func019A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o021'), function Trig_ChoChuFireDro_Func020A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'hfoo'), function Trig_ChoChuFireDro_Func021A )
endfunction

// --- InitTrig_ChoChuFireDro (family, line 42175) ---
function InitTrig_ChoChuFireDro takes nothing returns nothing
    set gg_trg_ChoChuFireDro = CreateTrigger(  )
    call DisableTrigger( gg_trg_ChoChuFireDro )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ChoChuFireDro, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ChoChuFireDro, Condition( function Trig_ChoChuFireDro_Conditions ) )
    call TriggerAddAction( gg_trg_ChoChuFireDro, function Trig_ChoChuFireDro_Actions )
endfunction

// === family CombineOne (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_CombineOne_Conditions (family, line 44458) ---
function Trig_CombineOne_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01Z' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_CombineOne_Func004Func001A (family, line 44465) ---
function Trig_CombineOne_Func004Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 12.00 )
endfunction

// --- Trig_CombineOne_Actions (family, line 44469) ---
function Trig_CombineOne_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_TreantReady1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_ShadowHunterReady1, 100.00, GetTriggerUnit() )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_CombineOne_Func004Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_CombineOne (family, line 44491) ---
function InitTrig_CombineOne takes nothing returns nothing
    set gg_trg_CombineOne = CreateTrigger(  )
    call DisableTrigger( gg_trg_CombineOne )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_CombineOne, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_CombineOne, Condition( function Trig_CombineOne_Conditions ) )
    call TriggerAddAction( gg_trg_CombineOne, function Trig_CombineOne_Actions )
endfunction

// === family Cookie (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Cookie_Func001Func003C (family, line 40519) ---
function Trig_Cookie_Func001Func003C takes nothing returns boolean
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(0) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(6) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetSpellTargetUnit()) == Player(PLAYER_NEUTRAL_AGGRESSIVE) ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Cookie_Func001C (family, line 40532) ---
function Trig_Cookie_Func001C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0CK' ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetSpellTargetUnit(), UNIT_TYPE_HERO) != true ) ) then
        return false
    endif
    if ( not Trig_Cookie_Func001Func003C() ) then
        return false
    endif
    if ( not ( GetUnitLevel(GetSpellTargetUnit()) < 10 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cookie_Conditions (family, line 40548) ---
function Trig_Cookie_Conditions takes nothing returns boolean
    if ( not Trig_Cookie_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Cookie_Func006A (family, line 40555) ---
function Trig_Cookie_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Func007A (family, line 40560) ---
function Trig_Cookie_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Func008A (family, line 40565) ---
function Trig_Cookie_Func008A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Cookie_Actions (family, line 40570) ---
function Trig_Cookie_Actions takes nothing returns nothing
    call AddSpecialEffectTargetUnitBJ( "chest", GetSpellTargetUnit(), "Abilities\\Spells\\Orc\\FeralSpirit\\feralspiritdone.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call PlaySoundOnUnitBJ( gg_snd_EggSackDeath1, 100.00, GetTriggerUnit() )
    call CreateItemLoc( 'I03N', GetUnitLoc(GetSpellTargetUnit()) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func006A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func007A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'h02J'), function Trig_Cookie_Func008A )
endfunction

// --- InitTrig_Cookie (family, line 40581) ---
function InitTrig_Cookie takes nothing returns nothing
    set gg_trg_Cookie = CreateTrigger(  )
    call DisableTrigger( gg_trg_Cookie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Cookie, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Cookie, Condition( function Trig_Cookie_Conditions ) )
    call TriggerAddAction( gg_trg_Cookie, function Trig_Cookie_Actions )
endfunction

// === family Deal_Elemental_Effect (passive) events=none ===

// --- Trig_Deal_Elemental_Effect_Func002Func001001001 (family, line 41481) ---
function Trig_Deal_Elemental_Effect_Func002Func001001001 takes nothing returns boolean
    return ( GetEventDamageSource() == udg_NiJan2 )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001001002 (family, line 41485) ---
function Trig_Deal_Elemental_Effect_Func002Func001001002 takes nothing returns boolean
    return ( UnitHasBuffBJ(GetEventDamageSource(), 'B00C') == true )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001001 (family, line 41489) ---
function Trig_Deal_Elemental_Effect_Func002Func001001 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001001001(), Trig_Deal_Elemental_Effect_Func002Func001001002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002001 (family, line 41493) ---
function Trig_Deal_Elemental_Effect_Func002Func001002001 takes nothing returns boolean
    return ( IsUnitEnemy(GetTriggerUnit(), GetOwningPlayer(GetEventDamageSource())) == true )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002001 (family, line 41497) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002001 takes nothing returns boolean
    return ( IsUnitType(GetTriggerUnit(), UNIT_TYPE_STRUCTURE) == false )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002002 (family, line 41501) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002002 takes nothing returns boolean
    return ( udg_NumberofCharges > 0 )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002002 (family, line 41505) ---
function Trig_Deal_Elemental_Effect_Func002Func001002002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001002002001(), Trig_Deal_Elemental_Effect_Func002Func001002002002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func001002 (family, line 41509) ---
function Trig_Deal_Elemental_Effect_Func002Func001002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001002001(), Trig_Deal_Elemental_Effect_Func002Func001002002() )
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C (family, line 41513) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(udg_NiJan2)) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C (family, line 41526) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C takes nothing returns boolean
    if ( not Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A (family, line 41533) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A takes nothing returns nothing
    if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
        call UnitDamageTargetBJ( GetLastCreatedUnit(), GetEnumUnit(), ( 80.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03I', udg_NiJan2)) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetEnumUnit()), "Abilities\\Weapons\\GryphonRiderMissile\\GryphonRiderMissileTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( ( I2S(R2I(( ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03I', udg_NiJan2)) ) + 80.00 ))) + "!" ), GetEnumUnit(), -30.00, 10.00, 10.00, 10.00, 90.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C (family, line 41549) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C (family, line 41556) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003Func001C (family, line 41563) ---
function Trig_Deal_Elemental_Effect_Func002Func003Func001C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func003C (family, line 41570) ---
function Trig_Deal_Elemental_Effect_Func002Func003C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002Func007C (family, line 41577) ---
function Trig_Deal_Elemental_Effect_Func002Func007C takes nothing returns boolean
    if ( not ( udg_NumberofCharges == 0 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Func002C (family, line 41584) ---
function Trig_Deal_Elemental_Effect_Func002C takes nothing returns boolean
    if ( not GetBooleanAnd( Trig_Deal_Elemental_Effect_Func002Func001001(), Trig_Deal_Elemental_Effect_Func002Func001002() ) ) then
        return false
    endif
    if ( not ( udg_ElementalBuffedUnit != null ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Deal_Elemental_Effect_Actions (family, line 41594) ---
function Trig_Deal_Elemental_Effect_Actions takes nothing returns nothing
    call DestroyEffectBJ( udg_ElementalTrail )
    if ( Trig_Deal_Elemental_Effect_Func002C() ) then
        if ( Trig_Deal_Elemental_Effect_Func002Func003C() ) then
            call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
            call RemoveLocation(udg_ElementalBuffPoint)
            call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A03N', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A03N', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
            call IssueTargetOrderBJ( GetLastCreatedUnit(), "acidbomb", udg_ElementalBuffedUnit )
        else
            if ( Trig_Deal_Elemental_Effect_Func002Func003Func001C() ) then
                call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
                call RemoveLocation(udg_ElementalBuffPoint)
                call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                call UnitAddAbilityBJ( 'A03Z', GetLastCreatedUnit() )
                call SetUnitAbilityLevelSwapped( 'A03Z', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "thunderbolt", udg_ElementalBuffedUnit )
            else
                if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001C() ) then
                    call CreateNUnitsAtLoc( 1, 'h00A', GetOwningPlayer(udg_NiJan2), udg_ElementalBuffPoint, bj_UNIT_FACING )
                    call RemoveLocation(udg_ElementalBuffPoint)
                    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
                    call UnitAddAbilityBJ( 'A03O', GetLastCreatedUnit() )
                    call SetUnitAbilityLevelSwapped( 'A03O', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) )
                    call IssueTargetOrderBJ( GetLastCreatedUnit(), "frostnova", udg_ElementalBuffedUnit )
                else
                    if ( Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001C() ) then
                        call ForGroupBJ( GetUnitsInRangeOfLocAll(350.00, GetUnitLoc(udg_NiJan2)), function Trig_Deal_Elemental_Effect_Func002Func003Func001Func001Func001Func001A )
                    else
                        call DoNothing(  )
                    endif
                endif
            endif
        endif
        call RemoveLocation(udg_ElementalBuffPoint)
        set udg_NumberofCharges = ( udg_NumberofCharges - 1 )
        set udg_ElementalBuffedUnit = null
        if ( Trig_Deal_Elemental_Effect_Func002Func007C() ) then
            call UnitRemoveBuffBJ( 'B00C', GetEventDamageSource() )
        else
        endif
    else
    endif
endfunction

// --- InitTrig_Deal_Elemental_Effect (family, line 41641) ---
function InitTrig_Deal_Elemental_Effect takes nothing returns nothing
    set gg_trg_Deal_Elemental_Effect = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Deal_Elemental_Effect, function Trig_Deal_Elemental_Effect_Actions )
endfunction

// === family DeathEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathEye_Conditions (family, line 42231) ---
function Trig_DeathEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IK' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathEye_Func008C (family, line 42238) ---
function Trig_DeathEye_Func008C takes nothing returns boolean
    if ( not ( GetPlayerController(GetOwningPlayer(GetTriggerUnit())) == MAP_CONTROL_COMPUTER ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathEye_Actions (family, line 42245) ---
function Trig_DeathEye_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_FountainOfLifeWhat1, 100.00, GetTriggerUnit() )
    set udg_DeathUnit = GetSpellTargetUnit()
    call CreateTextTagUnitBJ( ( GetUnitName(udg_DeathUnit) + " 已經被死神之眼鎖定了..." ), GetSpellTargetUnit(), 0, 10.00, 90.00, 20.00, 30.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 3.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.70 )
    if ( Trig_DeathEye_Func008C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "manashieldon" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "roar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "battleroar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "thunderclap" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stomp" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "roar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "battleroar" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "thunderclap" )
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stomp" )
    else
    endif
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) / 2.00 ) )
    call SetUnitLifePercentBJ( GetTriggerUnit(), ( GetUnitLifePercent(GetTriggerUnit()) / 2.00 ) )
    call PlaySoundOnUnitBJ( gg_snd_GruntYesAttack1, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_DeathEye (family, line 42271) ---
function InitTrig_DeathEye takes nothing returns nothing
    set gg_trg_DeathEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathEye, Condition( function Trig_DeathEye_Conditions ) )
    call TriggerAddAction( gg_trg_DeathEye, function Trig_DeathEye_Actions )
endfunction

// === family DeathHeart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathHeart_Conditions (family, line 42352) ---
function Trig_DeathHeart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathHeart_Actions (family, line 42359) ---
function Trig_DeathHeart_Actions takes nothing returns nothing
    set udg_DeathHeartDam = ( ( GetUnitStateSwap(UNIT_STATE_MAX_LIFE, udg_DeathUnit) * ( 0.05 + ( 0.10 * I2R(GetUnitAbilityLevelSwapped('A05I', GetTriggerUnit())) ) ) ) + 450.00 )
    call EnableTrigger( gg_trg_DeathHeartBuff )
    call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_DeathUnit), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0EC', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0EC', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), udg_DeathUnit, 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "unholyfrenzy", udg_DeathUnit )
    call PlaySoundOnUnitBJ( gg_snd_GruntYesAttack3, 100, GetTriggerUnit() )
    call TriggerSleepAction( 1.00 )
    call DisableTrigger( gg_trg_DeathHeartBuff )
endfunction

// --- InitTrig_DeathHeart (family, line 42375) ---
function InitTrig_DeathHeart takes nothing returns nothing
    set gg_trg_DeathHeart = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathHeart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathHeart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathHeart, Condition( function Trig_DeathHeart_Conditions ) )
    call TriggerAddAction( gg_trg_DeathHeart, function Trig_DeathHeart_Actions )
endfunction

// === family DeathTrain (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DeathTrain_Conditions (family, line 42282) ---
function Trig_DeathTrain_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05H' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func009Func002Func001C (family, line 42289) ---
function Trig_DeathTrain_Func009Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func009Func002A (family, line 42296) ---
function Trig_DeathTrain_Func009Func002A takes nothing returns nothing
    if ( Trig_DeathTrain_Func009Func002Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetEnumUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0EB', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A0EB', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "impale", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_DeathTrain_Func009C (family, line 42309) ---
function Trig_DeathTrain_Func009C takes nothing returns boolean
    if ( not ( UnitHasItemOfTypeBJ(GetTriggerUnit(), 'I01O') == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DeathTrain_Func012A (family, line 42316) ---
function Trig_DeathTrain_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DeathTrain_Actions (family, line 42321) ---
function Trig_DeathTrain_Actions takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o002', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(udg_DeathUnit), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0EB', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0EB', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), udg_DeathUnit, 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "impale", udg_DeathUnit )
    call PlaySoundOnUnitBJ( gg_snd_RokhanWhat2, 100, GetTriggerUnit() )
    if ( Trig_DeathTrain_Func009C() ) then
        set bj_wantDestroyGroup = true
        call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, GetUnitLoc(udg_DeathUnit)), function Trig_DeathTrain_Func009Func002A )
    else
    endif
    call TriggerSleepAction( 2 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'o002'), function Trig_DeathTrain_Func012A )
endfunction

// --- InitTrig_DeathTrain (family, line 42341) ---
function InitTrig_DeathTrain takes nothing returns nothing
    set gg_trg_DeathTrain = CreateTrigger(  )
    call DisableTrigger( gg_trg_DeathTrain )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DeathTrain, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DeathTrain, Condition( function Trig_DeathTrain_Conditions ) )
    call TriggerAddAction( gg_trg_DeathTrain, function Trig_DeathTrain_Actions )
endfunction

// === family DefEndC (armed) events=none ===

// --- Trig_DefEndC_Func001C (family, line 42862) ---
function Trig_DefEndC_Func001C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'Opgh' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'O02P' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_DefEndC_Conditions (family, line 42872) ---
function Trig_DefEndC_Conditions takes nothing returns boolean
    if ( not Trig_DefEndC_Func001C() ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("undefend") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefEndC_Actions (family, line 42882) ---
function Trig_DefEndC_Actions takes nothing returns nothing
    call UnitRemoveAbilityBJ( 'A0TP', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0TQ', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0TT', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0TR', GetTriggerUnit() )
    call UnitRemoveAbilityBJ( 'A0TS', GetTriggerUnit() )
endfunction

// --- InitTrig_DefEndC (family, line 42891) ---
function InitTrig_DefEndC takes nothing returns nothing
    set gg_trg_DefEndC = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefEndC )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefEndC, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_DefEndC, Condition( function Trig_DefEndC_Conditions ) )
    call TriggerAddAction( gg_trg_DefEndC, function Trig_DefEndC_Actions )
endfunction

// === family DefMagic (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DefMagic_Conditions (family, line 39911) ---
function Trig_DefMagic_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07T' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefMagic_Func010A (family, line 39918) ---
function Trig_DefMagic_Func010A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "antimagicshell", GetEnumUnit() )
endfunction

// --- Trig_DefMagic_Func012A (family, line 39923) ---
function Trig_DefMagic_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DefMagic_Actions (family, line 39928) ---
function Trig_DefMagic_Actions takes nothing returns nothing
    set udg_KaoUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_WayGateWhat1, 100.00, GetTriggerUnit() )
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DS', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DS', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(550.00, GetUnitLoc(GetTriggerUnit())), function Trig_DefMagic_Func010A )
    call TriggerSleepAction( 6.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KaoUnit), 'hfoo'), function Trig_DefMagic_Func012A )
endfunction

// --- InitTrig_DefMagic (family, line 39943) ---
function InitTrig_DefMagic takes nothing returns nothing
    set gg_trg_DefMagic = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefMagic )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefMagic, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DefMagic, Condition( function Trig_DefMagic_Conditions ) )
    call TriggerAddAction( gg_trg_DefMagic, function Trig_DefMagic_Actions )
endfunction

// === family DefStartC (passive) events=EVENT_PLAYER_UNIT_ISSUED_ORDER ===

// --- Trig_DefStartC_Func001C (family, line 42792) ---
function Trig_DefStartC_Func001C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'Opgh' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetTriggerUnit()) == 'O02P' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_DefStartC_Conditions (family, line 42802) ---
function Trig_DefStartC_Conditions takes nothing returns boolean
    if ( not Trig_DefStartC_Func001C() ) then
        return false
    endif
    if ( not ( GetIssuedOrderIdBJ() == String2OrderIdBJ("defend") ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004Func001Func002C (family, line 42812) ---
function Trig_DefStartC_Func004Func001Func002C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004Func001C (family, line 42819) ---
function Trig_DefStartC_Func004Func001C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Func004C (family, line 42826) ---
function Trig_DefStartC_Func004C takes nothing returns boolean
    if ( not ( GetUnitAbilityLevelSwapped('A0TI', GetTriggerUnit()) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DefStartC_Actions (family, line 42833) ---
function Trig_DefStartC_Actions takes nothing returns nothing
    call UnitAddAbilityBJ( 'A0TP', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A0TQ', GetTriggerUnit() )
    if ( Trig_DefStartC_Func004C() ) then
        call UnitAddAbilityBJ( 'A0TT', GetTriggerUnit() )
    else
        if ( Trig_DefStartC_Func004Func001C() ) then
            call UnitAddAbilityBJ( 'A0TR', GetTriggerUnit() )
        else
            if ( Trig_DefStartC_Func004Func001Func002C() ) then
                call UnitAddAbilityBJ( 'A0TS', GetTriggerUnit() )
            else
            endif
        endif
    endif
endfunction

// --- InitTrig_DefStartC (family, line 42851) ---
function InitTrig_DefStartC takes nothing returns nothing
    set gg_trg_DefStartC = CreateTrigger(  )
    call DisableTrigger( gg_trg_DefStartC )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DefStartC, EVENT_PLAYER_UNIT_ISSUED_ORDER )
    call TriggerAddCondition( gg_trg_DefStartC, Condition( function Trig_DefStartC_Conditions ) )
    call TriggerAddAction( gg_trg_DefStartC, function Trig_DefStartC_Actions )
endfunction

// === family DestWall (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_DestWall_Conditions (family, line 44551) ---
function Trig_DestWall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0KC' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_DestWall_Func007A (family, line 44558) ---
function Trig_DestWall_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_DestWall_Actions (family, line 44563) ---
function Trig_DestWall_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    call PlaySoundOnUnitBJ( gg_snd_TrollbatriderPissed2, 100, GetTriggerUnit() )
    set udg_DestWall_P1 = GetSpellTargetLoc()
    set udg_DestWall_Index = 0
    loop
        exitwhen udg_DestWall_Index > 8
        set udg_DestWall_P2 = PolarProjectionBJ(udg_DestWall_P1, ( 400.00 - ( 100.00 * I2R(udg_DestWall_Index) ) ), ( GetUnitFacing(GetTriggerUnit()) + 90.00 ))
        call CreateNUnitsAtLoc( 1, 'u00R', GetOwningPlayer(udg_BaMDesWallUnit), udg_DestWall_P2, GetUnitFacing(GetTriggerUnit()) )
        call RemoveLocation( udg_DestWall_P2 )
        set udg_DestWall_Index = udg_DestWall_Index + 1
    endloop
    call PlaySoundOnUnitBJ( gg_snd_HCancelBuilding, 100.00, GetTriggerUnit() )
    call TriggerSleepAction( ( 2.00 + I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BaMDesWallUnit), 'u00R'), function Trig_DestWall_Func007A )
endfunction

// --- InitTrig_DestWall (family, line 44581) ---
function InitTrig_DestWall takes nothing returns nothing
    set gg_trg_DestWall = CreateTrigger(  )
    call DisableTrigger( gg_trg_DestWall )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_DestWall, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_DestWall, Condition( function Trig_DestWall_Conditions ) )
    call TriggerAddAction( gg_trg_DestWall, function Trig_DestWall_Actions )
endfunction

// === family Dontkick (armed) events=none ===

// --- Trig_Dontkick_Func001Func001Func004C (family, line 41032) ---
function Trig_Dontkick_Func001Func001Func004C takes nothing returns boolean
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(1) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(2) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(3) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(4) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(5) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(7) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(8) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(9) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(10) ) ) then
        return true
    endif
    if ( ( GetOwningPlayer(GetEventDamageSource()) == Player(11) ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_Dontkick_Func001Func001C (family, line 41066) ---
function Trig_Dontkick_Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_HERO) == false ) ) then
        return false
    endif
    if ( not Trig_Dontkick_Func001Func001Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Dontkick_Func001C (family, line 41076) ---
function Trig_Dontkick_Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEventDamageSource(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Dontkick_Actions (family, line 41083) ---
function Trig_Dontkick_Actions takes nothing returns nothing
    if ( Trig_Dontkick_Func001C() ) then
        if ( Trig_Dontkick_Func001Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), udg_PlayerHeroUnit[GetConvertedPlayerId(GetOwningPlayer(GetEventDamageSource()))], ( 0.60 * GetEventDamage() ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEventDamageSource(), ( 0.60 * GetEventDamage() ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
    endif
endfunction

// --- InitTrig_Dontkick (family, line 41095) ---
function InitTrig_Dontkick takes nothing returns nothing
    set gg_trg_Dontkick = CreateTrigger(  )
    call TriggerAddAction( gg_trg_Dontkick, function Trig_Dontkick_Actions )
endfunction

// === family EarthBoom (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EarthBoom_Conditions (family, line 40693) ---
function Trig_EarthBoom_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A08U' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EarthBoom_Func010A (family, line 40700) ---
function Trig_EarthBoom_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Func011A (family, line 40705) ---
function Trig_EarthBoom_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Func012A (family, line 40710) ---
function Trig_EarthBoom_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_EarthBoom_Actions (family, line 40715) ---
function Trig_EarthBoom_Actions takes nothing returns nothing
    set udg_EarthDamage = ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 100.00 ) + 200.00 )
    set udg_EarthPoint = GetSpellTargetLoc()
    set udg_EarthCounter = -1
    set udg_PuUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'o029', GetOwningPlayer(GetTriggerUnit()), udg_EarthPoint, bj_UNIT_FACING )
    set udg_EarthBallUnit = GetLastCreatedUnit()
    call SetUnitScalePercent( GetLastCreatedUnit(), 1500.00, 1500.00, 1500.00 )
    call TriggerExecute( gg_trg_EarthBoomCheck )
    call EnableTrigger( gg_trg_EarthBoomCheck )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func011A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_PuUnit), 'h02J'), function Trig_EarthBoom_Func012A )
endfunction

// --- InitTrig_EarthBoom (family, line 40731) ---
function InitTrig_EarthBoom takes nothing returns nothing
    set gg_trg_EarthBoom = CreateTrigger(  )
    call DisableTrigger( gg_trg_EarthBoom )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EarthBoom, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EarthBoom, Condition( function Trig_EarthBoom_Conditions ) )
    call TriggerAddAction( gg_trg_EarthBoom, function Trig_EarthBoom_Actions )
endfunction

// === family Eat (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Eat_Conditions (family, line 40592) ---
function Trig_Eat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Eat_Func002C (family, line 40599) ---
function Trig_Eat_Func002C takes nothing returns boolean
    if ( not ( udg_Eat_Index == 6 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Eat_Actions (family, line 40606) ---
function Trig_Eat_Actions takes nothing returns nothing
    set udg_Eat_Index = ( udg_Eat_Index + 1 )
    if ( Trig_Eat_Func002C() ) then
        set udg_Eat_Index = 0
        call ModifyHeroStat( bj_HEROSTAT_STR, GetTriggerUnit(), bj_MODIFYMETHOD_ADD, 1 )
    else
    endif
endfunction

// --- InitTrig_Eat (family, line 40616) ---
function InitTrig_Eat takes nothing returns nothing
    set gg_trg_Eat = CreateTrigger(  )
    call DisableTrigger( gg_trg_Eat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Eat, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Eat, Condition( function Trig_Eat_Conditions ) )
    call TriggerAddAction( gg_trg_Eat, function Trig_Eat_Actions )
endfunction

// === family EightCloud (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EightCloud_Func004C (family, line 42956) ---
function Trig_EightCloud_Func004C takes nothing returns boolean
    if ( ( GetSpellAbilityId() == 'A0U6' ) ) then
        return true
    endif
    if ( ( GetSpellAbilityId() == 'A06G' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_EightCloud_Conditions (family, line 42966) ---
function Trig_EightCloud_Conditions takes nothing returns boolean
    if ( not Trig_EightCloud_Func004C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_EightCloud_Actions (family, line 42973) ---
function Trig_EightCloud_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), RMinBJ(925.00, ( 0.44 * GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    set udg_EyesMaster = GetTriggerUnit()
endfunction

// --- InitTrig_EightCloud (family, line 42979) ---
function InitTrig_EightCloud takes nothing returns nothing
    set gg_trg_EightCloud = CreateTrigger(  )
    call DisableTrigger( gg_trg_EightCloud )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EightCloud, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EightCloud, Condition( function Trig_EightCloud_Conditions ) )
    call TriggerAddAction( gg_trg_EightCloud, function Trig_EightCloud_Actions )
endfunction

// === family Elemental_Buff_Attempt (armed) events=none ===

// --- Trig_Elemental_Buff_Attempt_Func006001001 (family, line 41374) ---
function Trig_Elemental_Buff_Attempt_Func006001001 takes nothing returns boolean
    return ( GetAttacker() == udg_NiJan2 )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006001002 (family, line 41378) ---
function Trig_Elemental_Buff_Attempt_Func006001002 takes nothing returns boolean
    return ( UnitHasBuffBJ(GetAttacker(), 'B00C') == true )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006001 (family, line 41382) ---
function Trig_Elemental_Buff_Attempt_Func006001 takes nothing returns boolean
    return GetBooleanAnd( Trig_Elemental_Buff_Attempt_Func006001001(), Trig_Elemental_Buff_Attempt_Func006001002() )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006002001 (family, line 41386) ---
function Trig_Elemental_Buff_Attempt_Func006002001 takes nothing returns boolean
    return ( IsUnitEnemy(GetAttackedUnitBJ(), GetOwningPlayer(GetAttacker())) == true )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006002002001 (family, line 41390) ---
function Trig_Elemental_Buff_Attempt_Func006002002001 takes nothing returns boolean
    return ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006002002002 (family, line 41394) ---
function Trig_Elemental_Buff_Attempt_Func006002002002 takes nothing returns boolean
    return ( udg_NumberofCharges > 0 )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006002002 (family, line 41398) ---
function Trig_Elemental_Buff_Attempt_Func006002002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Elemental_Buff_Attempt_Func006002002001(), Trig_Elemental_Buff_Attempt_Func006002002002() )
endfunction

// --- Trig_Elemental_Buff_Attempt_Func006002 (family, line 41402) ---
function Trig_Elemental_Buff_Attempt_Func006002 takes nothing returns boolean
    return GetBooleanAnd( Trig_Elemental_Buff_Attempt_Func006002001(), Trig_Elemental_Buff_Attempt_Func006002002() )
endfunction

// --- Trig_Elemental_Buff_Attempt_Conditions (family, line 41406) ---
function Trig_Elemental_Buff_Attempt_Conditions takes nothing returns boolean
    if ( not GetBooleanAnd( Trig_Elemental_Buff_Attempt_Func006001(), Trig_Elemental_Buff_Attempt_Func006002() ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Elemental_Buff_Attempt_Func005Func003Func003Func003C (family, line 41413) ---
function Trig_Elemental_Buff_Attempt_Func005Func003Func003Func003C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 4 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Elemental_Buff_Attempt_Func005Func003Func003C (family, line 41420) ---
function Trig_Elemental_Buff_Attempt_Func005Func003Func003C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 2 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Elemental_Buff_Attempt_Func005Func003C (family, line 41427) ---
function Trig_Elemental_Buff_Attempt_Func005Func003C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Elemental_Buff_Attempt_Func005C (family, line 41434) ---
function Trig_Elemental_Buff_Attempt_Func005C takes nothing returns boolean
    if ( not ( udg_RandomChanceElemental == 1 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Elemental_Buff_Attempt_Actions (family, line 41441) ---
function Trig_Elemental_Buff_Attempt_Actions takes nothing returns nothing
    set udg_ElementalBuffedUnit = GetAttackedUnitBJ()
    set udg_ElementalBuffPoint = PolarProjectionBJ(GetUnitLoc(udg_ElementalBuffedUnit), 100.00, AngleBetweenPoints(GetUnitLoc(GetAttacker()), GetUnitLoc(udg_ElementalBuffedUnit)))
    set udg_RandomChanceElemental = GetRandomInt(1, 4)
    call DestroyEffectBJ( udg_ElementalTrail )
    if ( Trig_Elemental_Buff_Attempt_Func005C() ) then
        call AddSpecialEffectTargetUnitBJ( "weapon, right", GetAttacker(), "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl" )
        set udg_ElementalTrail = GetLastCreatedEffectBJ()
    else
        if ( Trig_Elemental_Buff_Attempt_Func005Func003C() ) then
            call AddSpecialEffectTargetUnitBJ( "weapon, right", GetAttacker(), "Abilities\\Spells\\Other\\HealingSpray\\HealBottleMissile.mdl" )
            set udg_ElementalTrail = GetLastCreatedEffectBJ()
        else
            if ( Trig_Elemental_Buff_Attempt_Func005Func003Func003C() ) then
                call AddSpecialEffectTargetUnitBJ( "weapon, right", GetAttacker(), "Abilities\\Weapons\\ZigguratFrostMissile\\ZigguratFrostMissile.mdl" )
                set udg_ElementalTrail = GetLastCreatedEffectBJ()
            else
                if ( Trig_Elemental_Buff_Attempt_Func005Func003Func003Func003C() ) then
                    call AddSpecialEffectTargetUnitBJ( "weapon, right", GetAttacker(), "Abilities\\Weapons\\IllidanMissile\\IllidanMissile.mdl" )
                    set udg_ElementalTrail = GetLastCreatedEffectBJ()
                else
                    call DoNothing(  )
                endif
            endif
        endif
    endif
endfunction

// --- InitTrig_Elemental_Buff_Attempt (family, line 41470) ---
function InitTrig_Elemental_Buff_Attempt takes nothing returns nothing
    set gg_trg_Elemental_Buff_Attempt = CreateTrigger(  )
    call DisableTrigger( gg_trg_Elemental_Buff_Attempt )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Elemental_Buff_Attempt, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Elemental_Buff_Attempt, Condition( function Trig_Elemental_Buff_Attempt_Conditions ) )
    call TriggerAddAction( gg_trg_Elemental_Buff_Attempt, function Trig_Elemental_Buff_Attempt_Actions )
endfunction

// === family EvilEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_EvilEye_Conditions (family, line 44418) ---
function Trig_EvilEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'S001' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_EvilEye_Func013A (family, line 44425) ---
function Trig_EvilEye_Func013A takes nothing returns nothing
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "cripple", GetEnumUnit() )
endfunction

// --- Trig_EvilEye_Actions (family, line 44430) ---
function Trig_EvilEye_Actions takes nothing returns nothing
    set udg_BaMDesWallUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_GostUnit = GetTriggerUnit()
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'S002', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'S002', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call RemoveLocation( udg_P1 )
    set udg_P1 = GetUnitLoc(GetSpellTargetUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(600.00, udg_P1), function Trig_EvilEye_Func013A )
    call RemoveLocation( udg_P1 )
endfunction

// --- InitTrig_EvilEye (family, line 44447) ---
function InitTrig_EvilEye takes nothing returns nothing
    set gg_trg_EvilEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_EvilEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_EvilEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_EvilEye, Condition( function Trig_EvilEye_Conditions ) )
    call TriggerAddAction( gg_trg_EvilEye, function Trig_EvilEye_Actions )
endfunction

// === family FireBird (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FireBird_Conditions (family, line 39585) ---
function Trig_FireBird_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0Z4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireBird_Func007C (family, line 39592) ---
function Trig_FireBird_Func007C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) == false ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 10) <= ( GetUnitAbilityLevelSwapped('A0Z4', GetTriggerUnit()) + 1 ) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FireBird_Actions (family, line 39602) ---
function Trig_FireBird_Actions takes nothing returns nothing
    local location P1
    local location P2  
    local unit Caster
    local unit Master

    set Caster = GetSpellTargetUnit()
    set Master = GetTriggerUnit()

    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetSpellTargetLoc(), 100.00, AngleBetweenPoints(GetUnitLoc(GetTriggerUnit()), GetUnitLoc(GetSpellTargetUnit()))), AngleBetweenPoints(GetSpellTargetLoc(), GetUnitLoc(GetTriggerUnit())) )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DM', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DM', GetLastCreatedUnit(), 5 )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    if ( Trig_FireBird_Func007C() ) then
      set P1 = GetUnitLoc(Caster)
      set P2 = GetUnitLoc(Master)
      call Set_Move_Value(Caster , 10 , AngleBetweenPoints( P1 , P2 ) )
      call RemoveLocation (P1)
      call RemoveLocation (P2)
    else
    endif
endfunction

// --- InitTrig_FireBird (family, line 39628) ---
function InitTrig_FireBird takes nothing returns nothing
    set gg_trg_FireBird = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FireBird, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FireBird, Condition( function Trig_FireBird_Conditions ) )
    call TriggerAddAction( gg_trg_FireBird, function Trig_FireBird_Actions )
endfunction

// --- Set_Move_Value (helper, line 4785) ---
function Set_Move_Value takes unit MoveUnit , integer Distance , real Angle returns nothing
    local timer t

    set t = CreateTimer()

    call SetHandleUnit(t ,"MoveUnit", MoveUnit)
    call SetHandleInt( MoveUnit, "Distance", Distance)
    call SetHandleReal( MoveUnit, "Angle", Angle)
    call TimerStart(t, 0.04, true, function Move_Func)

    set t = null
endfunction

// === family FlySwallow (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_FlySwallow_Conditions (family, line 41649) ---
function Trig_FlySwallow_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A030' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FlySwallow_Func007C (family, line 41656) ---
function Trig_FlySwallow_Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_FlySwallowUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_FlySwallow_Actions (family, line 41663) ---
function Trig_FlySwallow_Actions takes nothing returns nothing
    set udg_FlySwallowUnit = GetTriggerUnit()
    set udg_FlySwallowTarget = GetSpellTargetUnit()
    call UnitAddAbilityBJ( 'A0F3', GetTriggerUnit() )
    call UnitAddAbilityBJ( 'A09P', GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPositionLocFacingBJ( udg_FlySwallowUnit, PolarProjectionBJ(GetUnitLoc(udg_FlySwallowTarget), 150.00, AngleBetweenPoints(GetUnitLoc(udg_FlySwallowUnit), GetUnitLoc(udg_FlySwallowTarget))), GetUnitFacing(udg_FlySwallowUnit) )
    if ( Trig_FlySwallow_Func007C() ) then
        call UnitDamageTargetBJ( udg_FlySwallowUnit, udg_FlySwallowTarget, I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_FlySwallowUnit, true) * 6 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( udg_FlySwallowUnit, udg_FlySwallowTarget, I2R(( GetHeroStatBJ(bj_HEROSTAT_AGI, udg_FlySwallowUnit, true) * 3 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call SetUnitVertexColorBJ( udg_FlySwallowUnit, 100.00, 100.00, 100.00, 0.00 )
    call TriggerSleepAction( 0.10 )
    call UnitRemoveAbilityBJ( 'A0F3', udg_FlySwallowUnit )
    call UnitRemoveAbilityBJ( 'A09P', udg_FlySwallowUnit )
endfunction

// --- InitTrig_FlySwallow (family, line 41682) ---
function InitTrig_FlySwallow takes nothing returns nothing
    set gg_trg_FlySwallow = CreateTrigger(  )
    call DisableTrigger( gg_trg_FlySwallow )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_FlySwallow, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_FlySwallow, Condition( function Trig_FlySwallow_Conditions ) )
    call TriggerAddAction( gg_trg_FlySwallow, function Trig_FlySwallow_Actions )
endfunction

// === family GaiaAngre (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GaiaAngre_Conditions (family, line 43421) ---
function Trig_GaiaAngre_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A07D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GaiaAngre_Func014A (family, line 43428) ---
function Trig_GaiaAngre_Func014A takes nothing returns nothing
    call KillDestructable( GetEnumDestructable() )
endfunction

// --- Trig_GaiaAngre_Func026A (family, line 43432) ---
function Trig_GaiaAngre_Func026A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GaiaAngre_Actions (family, line 43437) ---
function Trig_GaiaAngre_Actions takes nothing returns nothing
    set udg_GaiaCastUnit = GetTriggerUnit()
    set udg_GaiaFacing = GetUnitFacing(GetTriggerUnit())
    set udg_GaiaTarget = GetSpellTargetLoc()
    set udg_GaiaUnitPoint = GetUnitLoc(GetTriggerUnit())
    set udg_GaiaLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_GaiaDistance = ( DistanceBetweenPoints(udg_GaiaUnitPoint, udg_GaiaTarget) / 75.00 )
    call ShowUnitHide( udg_GaiaCastUnit )
    call TriggerSleepAction( 0.01 )
    set udg_GaiaCounter = 1
    loop
        exitwhen udg_GaiaCounter > R2I(udg_GaiaDistance)
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_GaiaUnitPoint, ( 75.00 * I2R(udg_GaiaCounter) ), udg_GaiaFacing), "Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TerrainDeformationRippleBJ( 1.00, true, PolarProjectionBJ(udg_GaiaUnitPoint, ( I2R(udg_GaiaCounter) * 50.00 ), udg_GaiaFacing), 100.00, 340.00, 48.00, 1, 200.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
        call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit2, 100, udg_GaiaTarget, 0 )
        call TriggerSleepAction( 0.01 )
        set udg_GaiaCounter = udg_GaiaCounter + 1
    endloop
    call SetUnitPositionLoc( udg_GaiaCastUnit, udg_GaiaTarget )
    call ShowUnitShow( udg_GaiaCastUnit )
    call SelectUnitForPlayerSingle( udg_GaiaCastUnit, GetOwningPlayer(udg_GaiaCastUnit) )
    set udg_GaiaCounter = 1
    loop
        exitwhen udg_GaiaCounter > 10
        call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_GaiaCastUnit), PolarProjectionBJ(udg_GaiaTarget, 160.00, I2R(( 30 * udg_GaiaCounter ))), GetRandomDirectionDeg() )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_GaiaGroup )
        call AddSpecialEffectLocBJ( udg_GaiaTarget, "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        set udg_GaiaCounter = udg_GaiaCounter + 1
    endloop
    call EnumDestructablesInCircleBJ( 400.00, GetUnitLoc(udg_GaiaCastUnit), function Trig_GaiaAngre_Func014A )
    call CreateNUnitsAtLoc( 1, 'o011', GetOwningPlayer(udg_GaiaCastUnit), udg_GaiaTarget, GetRandomDirectionDeg() )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A07Q', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A07Q', GetLastCreatedUnit(), udg_GaiaLevel )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "stomp" )
    call TerrainDeformationRippleBJ( 5.00, true, udg_GaiaTarget, 100.00, 340.00, 88.00, 1, 200.00 )
    call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    call PlaySoundAtPointBJ( gg_snd_GlueScreenMeteorHit1, 100, udg_GaiaTarget, 0 )
    call RemoveLocation(udg_GaiaUnitPoint)
    call RemoveLocation(udg_GaiaTarget)
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( udg_GaiaGroup, function Trig_GaiaAngre_Func026A )
endfunction

// --- InitTrig_GaiaAngre (family, line 43485) ---
function InitTrig_GaiaAngre takes nothing returns nothing
    set gg_trg_GaiaAngre = CreateTrigger(  )
    call DisableTrigger( gg_trg_GaiaAngre )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GaiaAngre, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GaiaAngre, Condition( function Trig_GaiaAngre_Conditions ) )
    call TriggerAddAction( gg_trg_GaiaAngre, function Trig_GaiaAngre_Actions )
endfunction

// === family Get_Magic_EX (armed) events=none ===

// --- Trig_Get_Magic_EX_Conditions (family, line 40177) ---
function Trig_Get_Magic_EX_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'O00L' ) ) then
        return false
    endif
    if ( not ( GetHeroLevel(GetTriggerUnit()) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Get_Magic_EX_Actions (family, line 40187) ---
function Trig_Get_Magic_EX_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A10B', GetTriggerUnit(), 1 )
    call DisableTrigger( GetTriggeringTrigger() )
    call DestroyTrigger(GetTriggeringTrigger())
endfunction

// --- InitTrig_Get_Magic_EX (family, line 40194) ---
function InitTrig_Get_Magic_EX takes nothing returns nothing
    set gg_trg_Get_Magic_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Get_Magic_EX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Get_Magic_EX, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_Get_Magic_EX, Condition( function Trig_Get_Magic_EX_Conditions ) )
    call TriggerAddAction( gg_trg_Get_Magic_EX, function Trig_Get_Magic_EX_Actions )
endfunction

// === family GodWind (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_GodWind_Conditions (family, line 39784) ---
function Trig_GodWind_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0DJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005Func001Func001C (family, line 39791) ---
function Trig_GodWind_Func005Func001Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_WindDragonUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005Func001C (family, line 39798) ---
function Trig_GodWind_Func005Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetTriggerPlayer()) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_GodWind_Func005A (family, line 39808) ---
function Trig_GodWind_Func005A takes nothing returns nothing
    if ( Trig_GodWind_Func005Func001C() ) then
        if ( Trig_GodWind_Func005Func001Func001C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * ( 2.00 * I2R(GetUnitAbilityLevelSwapped('A0DJ', GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * ( 1.00 * I2R(GetUnitAbilityLevelSwapped('A0DJ', GetTriggerUnit())) ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
    else
    endif
endfunction

// --- Trig_GodWind_Func072A (family, line 39819) ---
function Trig_GodWind_Func072A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_GodWind_Actions (family, line 39824) ---
function Trig_GodWind_Actions takes nothing returns nothing
    set udg_WindDragonUnit = GetTriggerUnit()
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(550.00, GetUnitLoc(GetTriggerUnit())), function Trig_GodWind_Func005A )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 0), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DM', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DM', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_100", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call PlaySoundOnUnitBJ( gg_snd_DragonYes2, 100.00, GetTriggerUnit() )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 90.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DL', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DL', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_101", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 180.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DN', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DN', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_154", GetLastCreatedUnit(), 0, 12.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    // 四神
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, 270.00), bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0DK', GetLastCreatedUnit() )
    call SetUnitAbilityLevelSwapped( 'A0DK', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
    call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", GetUnitLoc(GetTriggerUnit()) )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call AddSpecialEffectLocBJ( GetUnitLoc(GetLastCreatedUnit()), "Abilities\\Spells\\other\\ANsa\\ANsaTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateTextTagUnitBJ( "TRIGSTR_198", GetLastCreatedUnit(), 0, 16.00, 100.00, 100.00, 100.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call TriggerSleepAction( 1.50 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_WindDragonUnit), 'hfoo'), function Trig_GodWind_Func072A )
endfunction

// --- InitTrig_GodWind (family, line 39900) ---
function InitTrig_GodWind takes nothing returns nothing
    set gg_trg_GodWind = CreateTrigger(  )
    call DisableTrigger( gg_trg_GodWind )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_GodWind, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_GodWind, Condition( function Trig_GodWind_Conditions ) )
    call TriggerAddAction( gg_trg_GodWind, function Trig_GodWind_Actions )
endfunction

// === family HolyShit (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HolyShit_Conditions (family, line 44502) ---
function Trig_HolyShit_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01W' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HolyShit_Func006A (family, line 44509) ---
function Trig_HolyShit_Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_HolyShit_Actions (family, line 44514) ---
function Trig_HolyShit_Actions takes nothing returns nothing
    set udg_BNChang = GetTriggerUnit()
    set udg_BaMP = GetUnitLoc(udg_BNChang)
    set udg_BaM = 1
    loop
        exitwhen udg_BaM > 18
        call CreateNUnitsAtLoc( 1, 'o00B', GetOwningPlayer(udg_BNChang), udg_BaMP, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 10.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A01X', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A024', GetLastCreatedUnit() )
        call SetUnitAbilityLevelSwapped( 'A01X', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call SetUnitAbilityLevelSwapped( 'A024', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(udg_BaMP, 256.00, ( I2R(udg_BaM) * 20.00 )) )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "impale", PolarProjectionBJ(udg_BaMP, 256.00, ( I2R(udg_BaM) * 20.00 )) )
        call AddSpecialEffectLocBJ( PolarProjectionBJ(udg_BaMP, 256, ( I2R(udg_BaM) * 20.00 )), "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call TriggerSleepAction( 0.05 )
        set udg_BaM = udg_BaM + 1
    endloop
    call TriggerSleepAction( 5.00 )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_BNChang), 'o00B'), function Trig_HolyShit_Func006A )
endfunction

// --- InitTrig_HolyShit (family, line 44540) ---
function InitTrig_HolyShit takes nothing returns nothing
    set gg_trg_HolyShit = CreateTrigger(  )
    call DisableTrigger( gg_trg_HolyShit )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HolyShit, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HolyShit, Condition( function Trig_HolyShit_Conditions ) )
    call TriggerAddAction( gg_trg_HolyShit, function Trig_HolyShit_Actions )
endfunction

// === family HunrThum (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_HunrThum_Conditions (family, line 38781) ---
function Trig_HunrThum_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0HV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001Func002Func003C (family, line 38788) ---
function Trig_HunrThum_Func002Func001Func002Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_YouDieKiller))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001Func002C (family, line 38798) ---
function Trig_HunrThum_Func002Func001Func002C takes nothing returns boolean
    if ( not Trig_HunrThum_Func002Func001Func002Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002Func001C (family, line 38805) ---
function Trig_HunrThum_Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_HunrThum_Func002A (family, line 38818) ---
function Trig_HunrThum_Func002A takes nothing returns nothing
    if ( Trig_HunrThum_Func002Func001C() ) then
        if ( Trig_HunrThum_Func002Func001Func002C() ) then
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 250.00 ) + 50.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 6.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        else
            call UnitDamageTargetBJ( GetTriggerUnit(), GetEnumUnit(), ( ( ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 250.00 ) + 50.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true)) * 2.00 ) ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        endif
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
        call CreateTextTagUnitBJ( "TRIGSTR_5862", GetEnumUnit(), 0, 12.00, 100.00, 50.00, 50.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, GetRandomDirectionDeg() )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_HunrThum_Actions (family, line 38837) ---
function Trig_HunrThum_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.10 )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, GetSpellTargetLoc()), function Trig_HunrThum_Func002A )
endfunction

// --- InitTrig_HunrThum (family, line 38843) ---
function InitTrig_HunrThum takes nothing returns nothing
    set gg_trg_HunrThum = CreateTrigger(  )
    call DisableTrigger( gg_trg_HunrThum )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_HunrThum, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_HunrThum, Condition( function Trig_HunrThum_Conditions ) )
    call TriggerAddAction( gg_trg_HunrThum, function Trig_HunrThum_Actions )
endfunction

// === family ImbaEye (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ImbaEye_Conditions (family, line 42186) ---
function Trig_ImbaEye_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A102' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ImbaEye_Func004Func001C (family, line 42193) ---
function Trig_ImbaEye_Func004Func001C takes nothing returns boolean
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == false ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ImbaEye_Func004A (family, line 42200) ---
function Trig_ImbaEye_Func004A takes nothing returns nothing
    if ( Trig_ImbaEye_Func004Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(udg_ChoChuUnit), udg_ZZ_ImbaEyePoint, bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call RemoveUnitSP( GetLastCreatedUnit() , 10 , 1)
        call UnitAddAbilityBJ( 'A100', GetLastCreatedUnit() )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "soulburn", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_ImbaEye_Actions (family, line 42211) ---
function Trig_ImbaEye_Actions takes nothing returns nothing
    set udg_ZZ_ImbaEyePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h030', GetOwningPlayer(GetTriggerUnit()), udg_ZZ_ImbaEyePoint, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 2 , 1)
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_ZZ_ImbaEyePoint), function Trig_ImbaEye_Func004A )
    call RemoveLocation(udg_ZZ_ImbaEyePoint)
endfunction

// --- InitTrig_ImbaEye (family, line 42220) ---
function InitTrig_ImbaEye takes nothing returns nothing
    set gg_trg_ImbaEye = CreateTrigger(  )
    call DisableTrigger( gg_trg_ImbaEye )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ImbaEye, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ImbaEye, Condition( function Trig_ImbaEye_Conditions ) )
    call TriggerAddAction( gg_trg_ImbaEye, function Trig_ImbaEye_Actions )
endfunction

// --- RemoveUnitSP (helper, line 4847) ---
function RemoveUnitSP takes unit R_unit , real Life_Time , real Die_Time returns nothing
    local unit Last = bj_lastCreatedUnit
    local real Bj_Timer = bj_enumDestructableRadius
    local real Bj_Rand = bj_randomSubGroupChance
    set bj_lastCreatedUnit = R_unit
    set bj_enumDestructableRadius = Life_Time
    set bj_randomSubGroupChance = Die_Time
    call ExecuteFunc("RemoveUnitSP_Action")
    set bj_lastCreatedUnit = Last
    set bj_enumDestructableRadius = Bj_Timer
    set bj_randomSubGroupChance = Bj_Rand
endfunction

// === family Initiate_Fan_Toss (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Initiate_Fan_Toss_Conditions (family, line 41136) ---
function Trig_Initiate_Fan_Toss_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03A' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Initiate_Fan_Toss_Actions (family, line 41143) ---
function Trig_Initiate_Fan_Toss_Actions takes nothing returns nothing
    set udg_NiJan = GetTriggerUnit()
    set udg_FanTossDamage = ( 50.00 + ( 50.00 * I2R(GetUnitAbilityLevelSwapped('A03A', GetTriggerUnit())) ) )
    set udg_FanTossCenterPoint = GetSpellTargetLoc()
    set udg_TrackWE_Point = GetUnitLoc(GetTriggerUnit())
    set udg_Fan_Right_Point_1 = PolarProjectionBJ(udg_TrackWE_Point, SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )), ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) + ( 45.00 - AcosBJ(( 500.00 / SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )) )) ) ))
    set udg_Fan_Left_Point_1 = PolarProjectionBJ(udg_TrackWE_Point, SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )), ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) - ( 45.00 - AcosBJ(( 500.00 / SquareRoot(( Pow(500.00, 2.00) + Pow(250.00, 2.00) )) )) ) ))
    call CreateNUnitsAtLoc( 1, 'h009', GetOwningPlayer(GetTriggerUnit()), udg_TrackWE_Point, bj_UNIT_FACING )
    set udg_FanLeft = GetLastCreatedUnit()
    call CreateNUnitsAtLoc( 1, 'h009', GetOwningPlayer(GetTriggerUnit()), udg_TrackWE_Point, bj_UNIT_FACING )
    set udg_FanRight = GetLastCreatedUnit()
    set udg_FanLeftAngle = ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) - 45.00 )
    set udg_FanRightAngle = ( AngleBetweenPoints(udg_TrackWE_Point, udg_FanTossCenterPoint) + 45.00 )
    call RemoveLocation(udg_FanTossCenterPoint)
    call RemoveLocation(udg_TrackWE_Point)
    set udg_FanTravel_DIST = 500.00
    set udg_FanRotationCounter = 0.00
    call EnableTrigger( gg_trg_Fan_Movement )
endfunction

// --- InitTrig_Initiate_Fan_Toss (family, line 41164) ---
function InitTrig_Initiate_Fan_Toss takes nothing returns nothing
    set gg_trg_Initiate_Fan_Toss = CreateTrigger(  )
    call DisableTrigger( gg_trg_Initiate_Fan_Toss )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Initiate_Fan_Toss, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Initiate_Fan_Toss, Condition( function Trig_Initiate_Fan_Toss_Conditions ) )
    call TriggerAddAction( gg_trg_Initiate_Fan_Toss, function Trig_Initiate_Fan_Toss_Actions )
endfunction

// === family KaoLight (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KaoLight_Conditions (family, line 40097) ---
function Trig_KaoLight_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0K1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KaoLight_Func008A (family, line 40104) ---
function Trig_KaoLight_Func008A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_KaoCastPoint, 450.00, 450.00)) )
endfunction

// --- Trig_KaoLight_Func010A (family, line 40108) ---
function Trig_KaoLight_Func010A takes nothing returns nothing
    call SetUnitPositionLoc( GetEnumUnit(), GetRandomLocInRect(RectFromCenterSizeBJ(udg_KaoTarget, 250.00, 250.00)) )
endfunction

// --- Trig_KaoLight_Func013Func001C (family, line 40112) ---
function Trig_KaoLight_Func013Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(udg_KaoUnit), GetOwningPlayer(GetEnumUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KaoLight_Func013A (family, line 40119) ---
function Trig_KaoLight_Func013A takes nothing returns nothing
    if ( Trig_KaoLight_Func013Func001C() ) then
        call UnitDamageTargetBJ( udg_KaoUnit, GetEnumUnit(), udg_KaoDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_KaoLight_Func015A (family, line 40129) ---
function Trig_KaoLight_Func015A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KaoLight_Func016A (family, line 40134) ---
function Trig_KaoLight_Func016A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_KaoLight_Actions (family, line 40139) ---
function Trig_KaoLight_Actions takes nothing returns nothing
    set udg_KaoSkill = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_KaoTarget = GetSpellTargetLoc()
    set udg_KaoUnit = GetTriggerUnit()
    set udg_KaoCastPoint = GetUnitLoc(GetTriggerUnit())
    set udg_KaoDamage = ( I2R(( udg_KaoSkill * 100 )) + ( 150.00 + I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, udg_KaoUnit, true) * 3 )) ) )
    set udg_KaoCounter = 1
    loop
        exitwhen udg_KaoCounter > ( udg_KaoSkill + 2 )
        call CreateNUnitsAtLoc( 1, 'o014', GetOwningPlayer(udg_KaoUnit), udg_KaoCastPoint, GetUnitFacing(udg_KaoUnit) )
        call GroupAddUnitSimple( GetLastCreatedUnit(), udg_KaoGroup )
        set udg_KaoCounter = udg_KaoCounter + 1
    endloop
    call TriggerSleepAction( 0.05 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func008A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func010A )
    call AddSpecialEffectLocBJ( udg_KaoTarget, "Abilities\\Spells\\Other\\Doom\\DoomDeath.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_KaoTarget, 450.00, 450.00)), function Trig_KaoLight_Func013A )
    call TriggerSleepAction( 0.30 )
    call ForGroupBJ( udg_KaoGroup, function Trig_KaoLight_Func015A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_KaoUnit), 'o014'), function Trig_KaoLight_Func016A )
    call GroupClear( udg_KaoGroup )
endfunction

// --- InitTrig_KaoLight (family, line 40166) ---
function InitTrig_KaoLight takes nothing returns nothing
    set gg_trg_KaoLight = CreateTrigger(  )
    call DisableTrigger( gg_trg_KaoLight )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KaoLight, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KaoLight, Condition( function Trig_KaoLight_Conditions ) )
    call TriggerAddAction( gg_trg_KaoLight, function Trig_KaoLight_Actions )
endfunction

// === family KniSkill (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KniSkill_Conditions (family, line 42656) ---
function Trig_KniSkill_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I1' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KniSkill_Actions (family, line 42663) ---
function Trig_KniSkill_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_SnowCUnit = GetTriggerUnit()
    set udg_KniSkillCastedUnit = GetSpellTargetUnit()
    set udg_KniSkillCastPoint = GetUnitLoc(udg_KniSkillCastedUnit)
    set udg_KniSkillPoint = GetUnitLoc(GetTriggerUnit())
    set udg_KniSkillLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_KniSkillCounter = 1
    set udg_KniSkillDist = ( DistanceBetweenPoints(udg_KniSkillCastPoint, udg_KniSkillPoint) / 50.00 )
    set udg_KniSkillGet = false
    call AddSpecialEffectLocBJ( udg_KniSkillPoint, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0I5', udg_SnowCUnit )
    call SetUnitAnimation( udg_SnowCUnit, "attack slam" )
    call PlaySoundOnUnitBJ( gg_snd_NazgrelYes2, 100, GetTriggerUnit() )
    call TriggerSleepAction( 0.10 )
    call SetUnitPathing( udg_SnowCUnit, false )
    call EnableTrigger( gg_trg_KniSkillEffect )
endfunction

// --- InitTrig_KniSkill (family, line 42684) ---
function InitTrig_KniSkill takes nothing returns nothing
    set gg_trg_KniSkill = CreateTrigger(  )
    call DisableTrigger( gg_trg_KniSkill )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KniSkill, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KniSkill, Condition( function Trig_KniSkill_Conditions ) )
    call TriggerAddAction( gg_trg_KniSkill, function Trig_KniSkill_Actions )
endfunction

// === family KnockBack (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_KnockBack_Func002C (family, line 42538) ---
function Trig_KnockBack_Func002C takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A049' ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetSpellTargetUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_KnockBack_Conditions (family, line 42548) ---
function Trig_KnockBack_Conditions takes nothing returns boolean
    if ( not Trig_KnockBack_Func002C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_KnockBack_Func011Func001A (family, line 42555) ---
function Trig_KnockBack_Func011Func001A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 8.00 )
endfunction

// --- Trig_KnockBack_Actions (family, line 42559) ---
function Trig_KnockBack_Actions takes nothing returns nothing
    set udg_SnowUnit = GetTriggerUnit()
    set udg_KnockBack_Index = 0
    set udg_KnockBack_Target = GetSpellTargetUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_P2 = GetUnitLoc(GetSpellTargetUnit())
    set udg_KnockBack_Angle = AngleBetweenPoints(udg_P1, udg_P2)
    call RemoveLocation( udg_P1 )
    call RemoveLocation( udg_P2 )
    call EnableTrigger( gg_trg_KnockBack_Effect )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(GetSpellTargetLoc(), 1600.00, 1600.00)), function Trig_KnockBack_Func011Func001A )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
    call TriggerSleepAction( 0.50 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_KnockBack (family, line 42587) ---
function InitTrig_KnockBack takes nothing returns nothing
    set gg_trg_KnockBack = CreateTrigger(  )
    call DisableTrigger( gg_trg_KnockBack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_KnockBack, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_KnockBack, Condition( function Trig_KnockBack_Conditions ) )
    call TriggerAddAction( gg_trg_KnockBack, function Trig_KnockBack_Actions )
endfunction

// === family Legendary_Strike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Legendary_Strike_Conditions (family, line 40873) ---
function Trig_Legendary_Strike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AQ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Legendary_Strike_Actions (family, line 40880) ---
function Trig_Legendary_Strike_Actions takes nothing returns nothing
    call TriggerSleepAction( 0.00 )
    call SetUnitLifeBJ( GetTriggerUnit(), RMinBJ(( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) + ( 250.00 + ( I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) * 150.00 ) ) ), GetUnitStateSwap(UNIT_STATE_MAX_LIFE, GetTriggerUnit())) )
endfunction

// --- InitTrig_Legendary_Strike (family, line 40886) ---
function InitTrig_Legendary_Strike takes nothing returns nothing
    set gg_trg_Legendary_Strike = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Legendary_Strike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Legendary_Strike, Condition( function Trig_Legendary_Strike_Conditions ) )
    call TriggerAddAction( gg_trg_Legendary_Strike, function Trig_Legendary_Strike_Actions )
endfunction

// === family Light (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Light_Conditions (family, line 42990) ---
function Trig_Light_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0U6' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func004C (family, line 42997) ---
function Trig_Light_Func004C takes nothing returns boolean
    if ( not ( udg_EyesPay != null ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(udg_EyesPay) == true ) ) then
        return false
    endif
    if ( not ( DistanceBetweenPoints(GetUnitLoc(udg_EyesMaster), GetUnitLoc(udg_EyesPay)) <= 350.00 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func008Func001C (family, line 43010) ---
function Trig_Light_Func008Func001C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    if ( not ( udg_Angry3x3 == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Func008C (family, line 43020) ---
function Trig_Light_Func008C takes nothing returns boolean
    if ( not Trig_Light_Func008Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Light_Actions (family, line 43027) ---
function Trig_Light_Actions takes nothing returns nothing
    set udg_P1 = GetSpellTargetLoc()
    set udg_P2 = GetUnitLoc(GetTriggerUnit())
    set udg_EyesLightAngle = AngleBetweenPoints(udg_P2, udg_P1)
    if ( Trig_Light_Func004C() ) then
        set udg_PayDam = ( 1.50 * ( 800.00 - GetUnitStateSwap(UNIT_STATE_LIFE, udg_EyesPay) ) )
        set udg_Eyes_Light_Damage = ( ( udg_PayDam + 200.00 ) + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    else
        set udg_Eyes_Light_Damage = ( 200.00 + ( 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) ) )
    endif
    set udg_LightTeethIndex = 0
    call RemoveLocation( udg_P1 )
    call EnableTrigger( gg_trg_LightMove )
    if ( Trig_Light_Func008C() ) then
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V3', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V1', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V2', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0UZ', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V4', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V5', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V0', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), bj_UNIT_FACING )
        call ShowUnitHide( GetLastCreatedUnit() )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call UnitAddAbilityBJ( 'A0V6', GetLastCreatedUnit() )
        call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(GetUnitLoc(GetTriggerUnit()), 256, ( GetUnitFacing(GetTriggerUnit()) + GetRandomReal(-30.00, 30.00) )) )
        call TerrainDeformationRippleBJ( 2.00, false, GetUnitLoc(GetTriggerUnit()), 600.00, 600.00, 64.00, 1.00, 300.00 )
        call EnableWeatherEffect( GetLastCreatedWeatherEffect(), true )
    else
    endif
endfunction

// --- InitTrig_Light (family, line 43088) ---
function InitTrig_Light takes nothing returns nothing
    set gg_trg_Light = CreateTrigger(  )
    call DisableTrigger( gg_trg_Light )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Light, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Light, Condition( function Trig_Light_Conditions ) )
    call TriggerAddAction( gg_trg_Light, function Trig_Light_Actions )
endfunction

// === family LightAttack (armed) events=none ===

// --- Trig_LightAttack_Func001Func001Func013C (family, line 38704) ---
function Trig_LightAttack_Func001Func001Func013C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttackedUnitBJ()) == 'U00L' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 4) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightAttack_Func001Func001C (family, line 38714) ---
function Trig_LightAttack_Func001Func001C takes nothing returns boolean
    if ( not Trig_LightAttack_Func001Func001Func013C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightAttack_Func001Func006C (family, line 38721) ---
function Trig_LightAttack_Func001Func006C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00L' ) ) then
        return false
    endif
    if ( not ( GetRandomInt(1, 4) == 3 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightAttack_Func001C (family, line 38731) ---
function Trig_LightAttack_Func001C takes nothing returns boolean
    if ( not Trig_LightAttack_Func001Func006C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightAttack_Actions (family, line 38738) ---
function Trig_LightAttack_Actions takes nothing returns nothing
    if ( Trig_LightAttack_Func001C() ) then
        call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(udg_DNAUnit), GetUnitLoc(udg_DNAUnit), bj_UNIT_FACING )
        set udg_LightingUnit = GetLastCreatedUnit()
        call UnitAddAbilityBJ( 'A0HZ', GetLastCreatedUnit() )
        call SetUnitPositionLoc( udg_LightingUnit, GetUnitLoc(GetAttackedUnitBJ()) )
        call SetUnitFacingToFaceUnitTimed( udg_LightingUnit, GetAttackedUnitBJ(), 0 )
        call IssueTargetOrderBJ( udg_LightingUnit, "chainlightning", GetAttackedUnitBJ() )
        call CreateTextTagUnitBJ( "TRIGSTR_3270", GetAttacker(), 0, 14.00, 100.00, 50.00, 50.00, 0 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
        if ( Trig_LightAttack_Func001Func001C() ) then
            call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(udg_DNAUnit), GetUnitLoc(udg_DNAUnit), bj_UNIT_FACING )
            set udg_LightingUnit = GetLastCreatedUnit()
            call UnitAddAbilityBJ( 'A02H', GetLastCreatedUnit() )
            call SetUnitPositionLoc( udg_LightingUnit, GetUnitLoc(GetAttacker()) )
            call SetUnitFacingToFaceUnitTimed( udg_LightingUnit, GetAttacker(), 0 )
            call IssueTargetOrderBJ( udg_LightingUnit, "purge", GetAttacker() )
            call CreateTextTagUnitBJ( "TRIGSTR_6515", GetAttackedUnitBJ(), 0, 14.00, 100.00, 50.00, 50.00, 0 )
            call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
            call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
            call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
            call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
        else
            call DoNothing(  )
        endif
    endif
endfunction

// --- InitTrig_LightAttack (family, line 38771) ---
function InitTrig_LightAttack takes nothing returns nothing
    set gg_trg_LightAttack = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightAttack )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightAttack, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddAction( gg_trg_LightAttack, function Trig_LightAttack_Actions )
endfunction

// === family LightCut (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_LightCut_Conditions (family, line 41777) ---
function Trig_LightCut_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0IJ' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_LightCut_Func024A (family, line 41784) ---
function Trig_LightCut_Func024A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Func025A (family, line 41789) ---
function Trig_LightCut_Func025A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_LightCut_Actions (family, line 41794) ---
function Trig_LightCut_Actions takes nothing returns nothing
    call DisableTrigger( GetTriggeringTrigger() )
    set udg_ZZ_LC_Caster = GetTriggerUnit()
    set udg_ZZ_LC_Target = GetSpellTargetUnit()
    set udg_ZZ_LC_P1 = GetUnitLoc(GetTriggerUnit())
    set udg_ZZ_LC_P2 = GetUnitLoc(udg_ZZ_LC_Target)
    set udg_ZZ_LC_Damage = I2R(( ( ( GetHeroLevel(GetTriggerUnit()) * 20 ) + ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 200 ) ) + 200 ))
    set udg_ZZ_LC_Dist = ( 45.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 5.00 ) )
    set udg_ZZ_LC_Tolerance = ( 160.00 + ( I2R(GetUnitAbilityLevelSwapped('A0U7', GetTriggerUnit())) * 40.00 ) )
    set udg_ZZ_LC_Get = true
    set udg_ZZ_LC_Count = 0
    call AddSpecialEffectLocBJ( udg_ZZ_LC_P1, "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call UnitAddAbilityBJ( 'A0I5', udg_ZZ_LC_Caster )
    call SetUnitAnimation( udg_ZZ_LC_Caster, "attack slam" )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    set udg_ZZ_LC_Int = 1
    loop
        exitwhen udg_ZZ_LC_Int > 12
        set udg_ZZ_LC_P3 = PolarProjectionBJ(udg_ZZ_LC_P1, ( I2R(udg_ZZ_LC_Int) * 12.00 ), ( I2R(udg_ZZ_LC_Int) * 30.00 ))
        call CreateNUnitsAtLoc( 1, 'n00N', GetOwningPlayer(GetTriggerUnit()), udg_ZZ_LC_P3, bj_UNIT_FACING )
        call UnitApplyTimedLifeBJ( 1.00, 'BTLF', GetLastCreatedUnit() )
        call RemoveLocation( udg_ZZ_LC_P3 )
        set udg_ZZ_LC_Int = udg_ZZ_LC_Int + 1
    endloop
    call RemoveLocation( udg_ZZ_LC_P1 )
    call TriggerSleepAction( 0.20 )
    call SetUnitPathing( udg_ZZ_LC_Caster, false )
    call EnableTrigger( gg_trg_LightCutRun )
    call TriggerSleepAction( 3.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'n00N'), function Trig_LightCut_Func024A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ZZ_LC_Caster), 'o022'), function Trig_LightCut_Func025A )
endfunction

// --- InitTrig_LightCut (family, line 41830) ---
function InitTrig_LightCut takes nothing returns nothing
    set gg_trg_LightCut = CreateTrigger(  )
    call DisableTrigger( gg_trg_LightCut )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_LightCut, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_LightCut, Condition( function Trig_LightCut_Conditions ) )
    call TriggerAddAction( gg_trg_LightCut, function Trig_LightCut_Actions )
endfunction

// === family MagicStamp (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_MagicStamp_Conditions (family, line 37878) ---
function Trig_MagicStamp_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A06K' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_MagicStamp_Func010A (family, line 37885) ---
function Trig_MagicStamp_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Func011A (family, line 37890) ---
function Trig_MagicStamp_Func011A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Func012A (family, line 37895) ---
function Trig_MagicStamp_Func012A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_MagicStamp_Actions (family, line 37900) ---
function Trig_MagicStamp_Actions takes nothing returns nothing
    set udg_MagicStampOn = true
    set udg_EndWorldPoint = GetUnitLoc(GetTriggerUnit())
    call EnableTrigger( gg_trg_The_End_ofWorldCasting_EX )
    call EnableTrigger( gg_trg_MagicAttackPoint )
    call TriggerSleepAction( 7.00 )
    set udg_MagicStampOn = false
    call DisableTrigger( gg_trg_The_End_ofWorldCasting_EX )
    call DisableTrigger( gg_trg_MagicAttackPoint )
    call TriggerSleepAction( 2 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func010A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func011A )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_EndWorldUnit), 'u013'), function Trig_MagicStamp_Func012A )
endfunction

// --- InitTrig_MagicStamp (family, line 37916) ---
function InitTrig_MagicStamp takes nothing returns nothing
    set gg_trg_MagicStamp = CreateTrigger(  )
    call DisableTrigger( gg_trg_MagicStamp )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_MagicStamp, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_MagicStamp, Condition( function Trig_MagicStamp_Conditions ) )
    call TriggerAddAction( gg_trg_MagicStamp, function Trig_MagicStamp_Actions )
endfunction

// === family NO_Eat (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_NO_Eat_Conditions (family, line 40627) ---
function Trig_NO_Eat_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0GB' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NO_Eat_Func001Func007C (family, line 40634) ---
function Trig_NO_Eat_Func001Func007C takes nothing returns boolean
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'ebal' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'orai' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'n002' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'h01W' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'nshe' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u001' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u00D' ) ) then
        return true
    endif
    if ( ( GetUnitTypeId(GetSpellTargetUnit()) == 'u00E' ) ) then
        return true
    endif
    return false
endfunction

// --- Trig_NO_Eat_Func001C (family, line 40662) ---
function Trig_NO_Eat_Func001C takes nothing returns boolean
    if ( not Trig_NO_Eat_Func001Func007C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_NO_Eat_Actions (family, line 40669) ---
function Trig_NO_Eat_Actions takes nothing returns nothing
    if ( Trig_NO_Eat_Func001C() ) then
        call IssueImmediateOrderBJ( GetTriggerUnit(), "stop" )
        call CreateTextTagUnitBJ( "TRIGSTR_1679", GetTriggerUnit(), -30.00, 10.00, 90.00, 0.00, 0.00, 10.00 )
        call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64.00, 90.00 )
        call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
        call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
        call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    else
    endif
endfunction

// --- InitTrig_NO_Eat (family, line 40682) ---
function InitTrig_NO_Eat takes nothing returns nothing
    set gg_trg_NO_Eat = CreateTrigger(  )
    call DisableTrigger( gg_trg_NO_Eat )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NO_Eat, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_NO_Eat, Condition( function Trig_NO_Eat_Conditions ) )
    call TriggerAddAction( gg_trg_NO_Eat, function Trig_NO_Eat_Actions )
endfunction

// === family NineSlash (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_NineSlash_Conditions (family, line 43276) ---
function Trig_NineSlash_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A01B' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_NineSlash_Actions (family, line 43283) ---
function Trig_NineSlash_Actions takes nothing returns nothing
    set udg_Kenshine = GetTriggerUnit()
    set udg_KenshineFacing = GetUnitFacing(udg_Kenshine)
    set udg_NineDargonP = GetSpellTargetLoc()
    set udg_NineCount = 0
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_NineDargonP, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 4 , 1)
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0RP', GetLastCreatedUnit() )
    call IssueImmediateOrderBJ( GetLastCreatedUnit(), "thunderclap" )
    call EnableTrigger( gg_trg_NineSlashEffect )
endfunction

// --- InitTrig_NineSlash (family, line 43297) ---
function InitTrig_NineSlash takes nothing returns nothing
    set gg_trg_NineSlash = CreateTrigger(  )
    call DisableTrigger( gg_trg_NineSlash )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_NineSlash, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_NineSlash, Condition( function Trig_NineSlash_Conditions ) )
    call TriggerAddAction( gg_trg_NineSlash, function Trig_NineSlash_Actions )
endfunction

// === family Open_World (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_Open_World_Conditions (family, line 38026) ---
function Trig_Open_World_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0EW' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Open_World_Actions (family, line 38033) ---
function Trig_Open_World_Actions takes nothing returns nothing
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\NightElf\\Starfall\\StarfallCaster.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 3.00 + 3.00* I2R( GetUnitAbilityLevelSwapped( 'A0EW' , GetTriggerUnit() ) ) )
endfunction

// --- InitTrig_Open_World (family, line 38039) ---
function InitTrig_Open_World takes nothing returns nothing
    set gg_trg_Open_World = CreateTrigger(  )
    call DisableTrigger( gg_trg_Open_World )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Open_World, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_Open_World, Condition( function Trig_Open_World_Conditions ) )
    call TriggerAddAction( gg_trg_Open_World, function Trig_Open_World_Actions )
endfunction

// --- RemoveEffectSP (helper, line 4814) ---
function RemoveEffectSP takes effect R_Effect , real Life_Time returns nothing
    local real Bj_Timer = bj_enumDestructableRadius
    set bj_lastCreatedEffect = R_Effect
    set bj_enumDestructableRadius = Life_Time
    call ExecuteFunc("RemoveEffectSP_Action")
    set bj_enumDestructableRadius = Bj_Timer
endfunction

// === family PayDie (armed) events=none ===

// --- Trig_PayDie_Conditions (family, line 42929) ---
function Trig_PayDie_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetDyingUnit()) == 'h01Q' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_PayDie_Actions (family, line 42936) ---
function Trig_PayDie_Actions takes nothing returns nothing
    set udg_EyesPay = null
    set udg_PayDam = 0.00
    set udg_Angry3x3 = true
    call TriggerSleepAction( 3.00 )
    set udg_Angry3x3 = false
endfunction

// --- InitTrig_PayDie (family, line 42945) ---
function InitTrig_PayDie takes nothing returns nothing
    set gg_trg_PayDie = CreateTrigger(  )
    call DisableTrigger( gg_trg_PayDie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_PayDie, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_PayDie, Condition( function Trig_PayDie_Conditions ) )
    call TriggerAddAction( gg_trg_PayDie, function Trig_PayDie_Actions )
endfunction

// === family Ptt_Judge (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Ptt_Judge_Conditions (family, line 38050) ---
function Trig_Ptt_Judge_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A106' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Ptt_Judge_Func001Func001C (family, line 38057) ---
function Trig_Ptt_Judge_Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_HERO) == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetEnumUnit()) != 'Utic' ) ) then
        return false
    endif
    if ( not ( IsUnitEnemy(GetEnumUnit(), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Ptt_Judge_Func001A (family, line 38070) ---
function Trig_Ptt_Judge_Func001A takes nothing returns nothing
    local location Ptt_P1
    local location Ptt_P2
    local integer Ptt_LoopCountB

    if ( Trig_Ptt_Judge_Func001Func001C() ) then
            set Ptt_LoopCountB = 1
            set Ptt_P1 = GetUnitLoc(GetEnumUnit())
            loop
                exitwhen Ptt_LoopCountB > 5
                set Ptt_P2 = PolarProjectionBJ(Ptt_P1, 200.00, ( 75.00 * I2R(Ptt_LoopCountB) ))
                call AddSpecialEffectLocBJ( Ptt_P2, "Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl" )
                call DestroyEffectBJ( GetLastCreatedEffectBJ() )
                call CreateNUnitsAtLocFacingLocBJ( 1, 'h031', GetOwningPlayer(GetTriggerUnit()), Ptt_P2, Ptt_P1 )
                call UnitApplyTimedLifeBJ( 20.00, 'BTLF', GetLastCreatedUnit() )
                call IssueTargetOrderBJ( GetLastCreatedUnit(), "attack", GetEnumUnit() )
                call RemoveLocation( Ptt_P2 )
                set Ptt_LoopCountB = Ptt_LoopCountB + 1
            endloop
            call RemoveLocation( Ptt_P1 )
    else
    endif
endfunction

// --- Trig_Ptt_Judge_Actions (family, line 38094) ---
function Trig_Ptt_Judge_Actions takes nothing returns nothing
    call ForGroupBJ( GetUnitsInRectAll(GetPlayableMapRect()), function Trig_Ptt_Judge_Func001A )
endfunction

// --- InitTrig_Ptt_Judge (family, line 38099) ---
function InitTrig_Ptt_Judge takes nothing returns nothing
    set gg_trg_Ptt_Judge = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Ptt_Judge, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Ptt_Judge, Condition( function Trig_Ptt_Judge_Conditions ) )
    call TriggerAddAction( gg_trg_Ptt_Judge, function Trig_Ptt_Judge_Actions )
endfunction

// === family RiderSprint (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_RiderSprint_Conditions (family, line 38251) ---
function Trig_RiderSprint_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RQ' )) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == false )) then
        return false
    endif
    return true
endfunction

// --- Trig_RiderSprint_Actions (family, line 38261) ---
function Trig_RiderSprint_Actions takes nothing returns nothing
    local location RiderPoints

    call ShowUnitHide( udg_Rider )
    set RiderPoints = GetUnitLoc(GetTriggerUnit())
    set udg_RiderCastPoint = GetSpellTargetLoc()
    set udg_RiderCenCirPoint = PolarProjectionBJ(RiderPoints, 800.00, ( GetUnitFacing(GetTriggerUnit()) + 180.00 ))
    set udg_RiderFlyAngle = AngleBetweenPoints(RiderPoints, udg_RiderCenCirPoint)
    set udg_RiderChaAngle = ( udg_RiderFlyAngle + 37.00 )
    call CreateNUnitsAtLoc( 1, 'h024', GetOwningPlayer(GetTriggerUnit()), RiderPoints, udg_RiderChaAngle )
    set udg_RiderUnit = GetLastCreatedUnit()
    set udg_RiderDistance = 750.00
    set udg_RiderHight = 100.00
    call RemoveLocation( RiderPoints )
    call EnableTrigger( gg_trg_Ridermoveline )
endfunction

// --- InitTrig_RiderSprint (family, line 38279) ---
function InitTrig_RiderSprint takes nothing returns nothing
    set gg_trg_RiderSprint = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_RiderSprint, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_RiderSprint, Condition( function Trig_RiderSprint_Conditions ) )
    call TriggerAddAction( gg_trg_RiderSprint, function Trig_RiderSprint_Actions )
endfunction

// === family Riderspell (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Riderspell_Conditions (family, line 38109) ---
function Trig_Riderspell_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RR' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Riderspell_Actions (family, line 38116) ---
function Trig_Riderspell_Actions takes nothing returns nothing
    local location RiderHidePoint
    local unit RiderHideUnit

    set RiderHidePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h025', GetOwningPlayer(GetTriggerUnit()), RiderHidePoint, bj_UNIT_FACING )
    set RiderHideUnit = GetLastCreatedUnit()
    call ShowUnitHide( RiderHideUnit )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', RiderHideUnit )
    call IssuePointOrderLocBJ( RiderHideUnit, "silence", RiderHidePoint )
    call RemoveLocation( RiderHidePoint )
    call TriggerSleepAction( 1.00 )
    call KillUnit( RiderHideUnit )
    call RemoveUnit( RiderHideUnit )
endfunction

// --- InitTrig_Riderspell (family, line 38133) ---
function InitTrig_Riderspell takes nothing returns nothing
    set gg_trg_Riderspell = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Riderspell, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Riderspell, Condition( function Trig_Riderspell_Conditions ) )
    call TriggerAddAction( gg_trg_Riderspell, function Trig_Riderspell_Actions )
endfunction

// === family Set_Charges (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Set_Charges_Conditions (family, line 41344) ---
function Trig_Set_Charges_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A03I' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Set_Charges_Func003A (family, line 41351) ---
function Trig_Set_Charges_Func003A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_Set_Charges_Actions (family, line 41356) ---
function Trig_Set_Charges_Actions takes nothing returns nothing
    set udg_NiJan2 = GetTriggerUnit()
    set udg_NumberofCharges = ( 3 + ( GetUnitAbilityLevelSwapped('A03I', udg_NiJan2) * 3 ) )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_NiJan2), 'h00A'), function Trig_Set_Charges_Func003A )
endfunction

// --- InitTrig_Set_Charges (family, line 41363) ---
function InitTrig_Set_Charges takes nothing returns nothing
    set gg_trg_Set_Charges = CreateTrigger(  )
    call DisableTrigger( gg_trg_Set_Charges )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Set_Charges, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Set_Charges, Condition( function Trig_Set_Charges_Conditions ) )
    call TriggerAddAction( gg_trg_Set_Charges, function Trig_Set_Charges_Actions )
endfunction

// === family ShanWindDragon (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ShanWindDragon_Conditions (family, line 39638) ---
function Trig_ShanWindDragon_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0DO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ShanWindDragon_Func004C (family, line 39645) ---
function Trig_ShanWindDragon_Func004C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_WindDragonUnit))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ShanWindDragon_Actions (family, line 39652) ---
function Trig_ShanWindDragon_Actions takes nothing returns nothing
    set udg_WindDragonCount = 0
    set udg_WindDragonUnit = GetTriggerUnit()
    set udg_WindDragonAngle = GetUnitFacing(GetTriggerUnit())
    if ( Trig_ShanWindDragon_Func004C() ) then
        set udg_WindDragonDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * 6.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0DO', GetTriggerUnit())) ) + 250.00 ) )
    else
        set udg_WindDragonDamage = ( ( I2R(GetHeroStatBJ(bj_HEROSTAT_AGI, GetTriggerUnit(), true)) * 3.00 ) + ( ( 100.00 * I2R(GetUnitAbilityLevelSwapped('A0DO', GetTriggerUnit())) ) + 250.00 ) )
    endif
    set udg_WindDragonPostion = GetUnitLoc(GetTriggerUnit())
    set udg_WindDragonTargetPoint = GetSpellTargetLoc()
    call GroupClear( udg_WindDragonGroup )
    call CreateNUnitsAtLoc( 3, 'u00W', GetOwningPlayer(GetTriggerUnit()), GetUnitLoc(GetTriggerUnit()), GetUnitFacing(GetTriggerUnit()) )
    call TriggerSleepAction( 0.10 )
    call UnitAddAbilityBJ( 'A0KW', udg_WindDragonUnit )
    call EnableTrigger( gg_trg_ShanWindDragonMove )
    call PlaySoundOnUnitBJ( gg_snd_FlareTarget2, 100.00, udg_WindDragonUnit )
endfunction

// --- InitTrig_ShanWindDragon (family, line 39672) ---
function InitTrig_ShanWindDragon takes nothing returns nothing
    set gg_trg_ShanWindDragon = CreateTrigger(  )
    call DisableTrigger( gg_trg_ShanWindDragon )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ShanWindDragon, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ShanWindDragon, Condition( function Trig_ShanWindDragon_Conditions ) )
    call TriggerAddAction( gg_trg_ShanWindDragon, function Trig_ShanWindDragon_Actions )
endfunction

// === family SkySlash (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_SkySlash_Conditions (family, line 43185) ---
function Trig_SkySlash_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A012' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Func002Func001C (family, line 43192) ---
function Trig_SkySlash_Func002Func001C takes nothing returns boolean
    if ( not ( IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()), GetOwningPlayer(GetTriggerUnit())) == true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), Player(PLAYER_NEUTRAL_AGGRESSIVE)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Func002A (family, line 43208) ---
function Trig_SkySlash_Func002A takes nothing returns nothing
    if ( Trig_SkySlash_Func002Func001C() ) then
        call SetUnitPositionLoc( GetEnumUnit(), GetUnitLoc(GetTriggerUnit()) )
        call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- Trig_SkySlash_Func003Func005A (family, line 43217) ---
function Trig_SkySlash_Func003Func005A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003Func006A (family, line 43222) ---
function Trig_SkySlash_Func003Func006A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003Func007A (family, line 43227) ---
function Trig_SkySlash_Func003Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_SkySlash_Func003C (family, line 43232) ---
function Trig_SkySlash_Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetTriggerUnit()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_SkySlash_Actions (family, line 43239) ---
function Trig_SkySlash_Actions takes nothing returns nothing
    set udg_SkySlashUnit = GetTriggerUnit()
    call ForGroupBJ( GetUnitsInRangeOfLocAll(200.00, GetUnitLoc(GetTriggerUnit())), function Trig_SkySlash_Func002A )
    if ( Trig_SkySlash_Func003C() ) then
        set udg_SkySlashP = GetUnitLoc(GetTriggerUnit())
        call CreateNUnitsAtLoc( 1, 'o01P', GetOwningPlayer(GetTriggerUnit()), udg_SkySlashP, bj_UNIT_FACING )
        set udg_SkySlash = 1
        loop
            exitwhen udg_SkySlash > 18
            call CreateNUnitsAtLoc( 1, 'hkni', GetOwningPlayer(GetTriggerUnit()), udg_SkySlashP, ( I2R(udg_SkySlash) * 20.00 ) )
            call ShowUnitHide( GetLastCreatedUnit() )
            call UnitAddAbilityBJ( 'A09F', GetLastCreatedUnit() )
            call SetUnitAbilityLevelSwapped( 'A09F', GetLastCreatedUnit(), GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) )
            call IssuePointOrderLocBJ( GetLastCreatedUnit(), "shockwave", PolarProjectionBJ(udg_SkySlashP, 300.00, ( I2R(udg_SkySlash) * 20.00 )) )
            set udg_SkySlash = udg_SkySlash + 1
        endloop
        call TriggerSleepAction( 2.00 )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'o01P'), function Trig_SkySlash_Func003Func005A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hfoo'), function Trig_SkySlash_Func003Func006A )
        call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_SkySlashUnit), 'hkni'), function Trig_SkySlash_Func003Func007A )
        call RemoveLocation(udg_SkySlashP)
    else
    endif
endfunction

// --- InitTrig_SkySlash (family, line 43265) ---
function InitTrig_SkySlash takes nothing returns nothing
    set gg_trg_SkySlash = CreateTrigger(  )
    call DisableTrigger( gg_trg_SkySlash )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_SkySlash, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_SkySlash, Condition( function Trig_SkySlash_Conditions ) )
    call TriggerAddAction( gg_trg_SkySlash, function Trig_SkySlash_Actions )
endfunction

// === family Spell_Mark (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_Spell_Mark_Conditions (family, line 41711) ---
function Trig_Spell_Mark_Conditions takes nothing returns boolean
    return ( GetSpellAbilityId() == 'A04W' )
endfunction

// --- Trig_Spell_Mark_Actions (family, line 41715) ---
function Trig_Spell_Mark_Actions takes nothing returns nothing
    local real Dmg = 400.00 * I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())) - 100.00
    call TriggerSleepAction( 10.00 )
    call UnitDamageTargetBJ( GetTriggerUnit(), GetTriggerUnit(), Dmg , ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
    call AddSpecialEffectTargetUnitBJ( "origin", GetTriggerUnit(), "Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl" )
    call RemoveEffectSP( GetLastCreatedEffectBJ() , 1.50 )
endfunction

// --- InitTrig_Spell_Mark (family, line 41724) ---
function InitTrig_Spell_Mark takes nothing returns nothing
    set gg_trg_Spell_Mark = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Spell_Mark, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_Spell_Mark, Condition( function Trig_Spell_Mark_Conditions ) )
    call TriggerAddAction( gg_trg_Spell_Mark, function Trig_Spell_Mark_Actions )
endfunction

// === family The_End_ofWorld (active) events=EVENT_PLAYER_UNIT_SPELL_CAST ===

// --- Trig_The_End_ofWorld_Conditions (family, line 37712) ---
function Trig_The_End_ofWorld_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorld_Actions (family, line 37719) ---
function Trig_The_End_ofWorld_Actions takes nothing returns nothing
    call CreateTextTagUnitBJ( "TRIGSTR_4021", GetTriggerUnit(), 0, 10.00, 50.00, 50.00, 90.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 64, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 4.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 2.00 )
endfunction

// --- InitTrig_The_End_ofWorld (family, line 37728) ---
function InitTrig_The_End_ofWorld takes nothing returns nothing
    set gg_trg_The_End_ofWorld = CreateTrigger(  )
    call DisableTrigger( gg_trg_The_End_ofWorld )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_The_End_ofWorld, EVENT_PLAYER_UNIT_SPELL_CAST )
    call TriggerAddCondition( gg_trg_The_End_ofWorld, Condition( function Trig_The_End_ofWorld_Conditions ) )
    call TriggerAddAction( gg_trg_The_End_ofWorld, function Trig_The_End_ofWorld_Actions )
endfunction

// === family The_End_ofWorldStart (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_The_End_ofWorldStart_Conditions (family, line 37739) ---
function Trig_The_End_ofWorldStart_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A05D' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorldStart_Func009Func001C (family, line 37746) ---
function Trig_The_End_ofWorldStart_Func009Func001C takes nothing returns boolean
    if ( not ( IsUnitType(GetEnumUnit(), UNIT_TYPE_STRUCTURE) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAlly(GetEnumUnit(), GetOwningPlayer(udg_EndWorldUnit)) != true ) ) then
        return false
    endif
    if ( not ( IsUnitAliveBJ(GetEnumUnit()) == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_The_End_ofWorldStart_Func009A (family, line 37759) ---
function Trig_The_End_ofWorldStart_Func009A takes nothing returns nothing
    if ( Trig_The_End_ofWorldStart_Func009Func001C() ) then
        call UnitDamageTargetBJ( udg_EndWorldUnit, GetEnumUnit(), udg_WorldEndDamage, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
        call AddSpecialEffectTargetUnitBJ( "chest", GetEnumUnit(), "Abilities\\Spells\\Undead\\Unsummon\\UnsummonTarget.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
        call DoNothing(  )
    endif
endfunction

// --- Trig_The_End_ofWorldStart_Func010A (family, line 37769) ---
function Trig_The_End_ofWorldStart_Func010A takes nothing returns nothing
    call CameraSetEQNoiseForPlayer( GetOwningPlayer(GetEnumUnit()), 18.00 )
endfunction

// --- Trig_The_End_ofWorldStart_Actions (family, line 37773) ---
function Trig_The_End_ofWorldStart_Actions takes nothing returns nothing
    set udg_EndWorldUnit = GetTriggerUnit()
    set udg_EndWorldPoint = GetSpellTargetLoc()
    set udg_WorldEndDamage = I2R(( ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) + 3 ) * GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) ))
    set udg_EndWorldLevel = GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit())
    set udg_WorldEndCount = 0
    call AddSpecialEffectLocBJ( GetUnitLoc(GetTriggerUnit()), "frostnova.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.01 )
    call ForGroupBJ( GetUnitsInRangeOfLocAll(500.00, udg_EndWorldPoint), function Trig_The_End_ofWorldStart_Func009A )
    call ForGroupBJ( GetUnitsInRectAll(RectFromCenterSizeBJ(udg_EndWorldPoint, 1600.00, 1600.00)), function Trig_The_End_ofWorldStart_Func010A )
    call EnableTrigger( gg_trg_The_End_ofWorldCasting )
    call TriggerSleepAction( 1.00 )
    set bj_forLoopBIndex = 1
    set bj_forLoopBIndexEnd = 12
    loop
        exitwhen bj_forLoopBIndex > bj_forLoopBIndexEnd
        call CameraClearNoiseForPlayer( ConvertedPlayer(GetForLoopIndexB()) )
        set bj_forLoopBIndex = bj_forLoopBIndex + 1
    endloop
endfunction

// --- InitTrig_The_End_ofWorldStart (family, line 37796) ---
function InitTrig_The_End_ofWorldStart takes nothing returns nothing
    set gg_trg_The_End_ofWorldStart = CreateTrigger(  )
    call DisableTrigger( gg_trg_The_End_ofWorldStart )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_The_End_ofWorldStart, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_The_End_ofWorldStart, Condition( function Trig_The_End_ofWorldStart_Conditions ) )
    call TriggerAddAction( gg_trg_The_End_ofWorldStart, function Trig_The_End_ofWorldStart_Actions )
endfunction

// === family ThuBird (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_ThuBird_Conditions (family, line 41734) ---
function Trig_ThuBird_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0JX' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_ThuBird_Func004A (family, line 41741) ---
function Trig_ThuBird_Func004A takes nothing returns nothing
    call CreateNUnitsAtLoc( 1, 'o00E', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 6.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A0HY', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "chainlightning", GetEnumUnit() )
endfunction

// --- Trig_ThuBird_Func007A (family, line 41750) ---
function Trig_ThuBird_Func007A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_ThuBird_Actions (family, line 41755) ---
function Trig_ThuBird_Actions takes nothing returns nothing
    set udg_ChoChuUnit = GetTriggerUnit()
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(450.00, udg_P1), function Trig_ThuBird_Func004A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 2.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(udg_ChoChuUnit), 'o00E'), function Trig_ThuBird_Func007A )
endfunction

// --- InitTrig_ThuBird (family, line 41766) ---
function InitTrig_ThuBird takes nothing returns nothing
    set gg_trg_ThuBird = CreateTrigger(  )
    call DisableTrigger( gg_trg_ThuBird )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_ThuBird, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_ThuBird, Condition( function Trig_ThuBird_Conditions ) )
    call TriggerAddAction( gg_trg_ThuBird, function Trig_ThuBird_Actions )
endfunction

// === family TrueBlackBoom (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_TrueBlackBoom_Conditions (family, line 44671) ---
function Trig_TrueBlackBoom_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0ZV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TrueBlackBoom_Actions (family, line 44678) ---
function Trig_TrueBlackBoom_Actions takes nothing returns nothing
    set udg_AKTCastPoint = GetSpellTargetLoc()
    call CreateNUnitsAtLoc( 1, 'n00W', GetOwningPlayer(GetTriggerUnit()), udg_AKTCastPoint, bj_UNIT_FACING )
    call RemoveLocation( udg_AKTCastPoint )
endfunction

// --- InitTrig_TrueBlackBoom (family, line 44685) ---
function InitTrig_TrueBlackBoom takes nothing returns nothing
    set gg_trg_TrueBlackBoom = CreateTrigger(  )
    call DisableTrigger( gg_trg_TrueBlackBoom )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TrueBlackBoom, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_TrueBlackBoom, Condition( function Trig_TrueBlackBoom_Conditions ) )
    call TriggerAddAction( gg_trg_TrueBlackBoom, function Trig_TrueBlackBoom_Actions )
endfunction

// === family TrueBody (armed) events=none ===

// --- Trig_TrueBody_Conditions (family, line 39558) ---
function Trig_TrueBody_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'U00H' ) ) then
        return false
    endif
    if ( not ( GetHeroLevel(GetTriggerUnit()) >= 30 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_TrueBody_Actions (family, line 39568) ---
function Trig_TrueBody_Actions takes nothing returns nothing
    call SetUnitAbilityLevelSwapped( 'A0Z3', GetTriggerUnit(), 2 )
    call DisableTrigger( GetTriggeringTrigger() )
endfunction

// --- InitTrig_TrueBody (family, line 39574) ---
function InitTrig_TrueBody takes nothing returns nothing
    set gg_trg_TrueBody = CreateTrigger(  )
    call DisableTrigger( gg_trg_TrueBody )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_TrueBody, EVENT_PLAYER_HERO_LEVEL )
    call TriggerAddCondition( gg_trg_TrueBody, Condition( function Trig_TrueBody_Conditions ) )
    call TriggerAddAction( gg_trg_TrueBody, function Trig_TrueBody_Actions )
endfunction

// === family WolfStrike (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_WolfStrike_Conditions (family, line 40896) ---
function Trig_WolfStrike_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0I4' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WolfStrike_Func007C (family, line 40903) ---
function Trig_WolfStrike_Func007C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_Henti))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_WolfStrike_Actions (family, line 40910) ---
function Trig_WolfStrike_Actions takes nothing returns nothing
    set udg_KnockBack_IndexWolf = 0
    set udg_WolfUnit = GetTriggerUnit()
    set udg_P1Wolf = GetUnitLoc(GetTriggerUnit())
    set udg_P2Wolf = GetSpellTargetLoc()
    set udg_KnockBack_AngleWolf = AngleBetweenPoints(udg_P1Wolf, udg_P2Wolf)
    set udg_WolfDamage = I2R(( ( GetHeroStatBJ(bj_HEROSTAT_STR, GetTriggerUnit(), true) * 2 ) + ( ( GetUnitAbilityLevelSwapped(GetSpellAbilityId(), GetTriggerUnit()) * 100 ) + 50 ) ))
    if ( Trig_WolfStrike_Func007C() ) then
        set udg_WolfDamage = ( udg_WolfDamage * 2.00 )
    else
    endif
    call CreateNUnitsAtLoc( 1, 'h019', GetOwningPlayer(GetTriggerUnit()), udg_P1Wolf, GetRandomDirectionDeg() )
    set udg_KnockBack_TargetWolf = GetLastCreatedUnit()
    call SetUnitTimeScalePercent( udg_KnockBack_TargetWolf, 600.00 )
    call GroupClear( udg_WolfGroup )
    call ShowUnitHide( udg_WolfUnit )
    call RemoveLocation( udg_P1Wolf )
    call RemoveLocation( udg_P2Wolf )
    call EnableTrigger( gg_trg_WolfStrikeEffect )
endfunction

// --- InitTrig_WolfStrike (family, line 40932) ---
function InitTrig_WolfStrike takes nothing returns nothing
    set gg_trg_WolfStrike = CreateTrigger(  )
    call DisableTrigger( gg_trg_WolfStrike )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_WolfStrike, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_WolfStrike, Condition( function Trig_WolfStrike_Conditions ) )
    call TriggerAddAction( gg_trg_WolfStrike, function Trig_WolfStrike_Actions )
endfunction

// === family Wolf_EX (armed) events=none ===

// --- Trig_Wolf_EX_Conditions (family, line 40819) ---
function Trig_Wolf_EX_Conditions takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetAttacker()) == 'Othr' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wolf_EX_Func001Func001C (family, line 40826) ---
function Trig_Wolf_EX_Func001Func001C takes nothing returns boolean
    if ( not ( IsUnitIllusionBJ(GetAttackedUnitBJ()) == false ) ) then
        return false
    endif
    if ( not ( IsUnitType(GetAttackedUnitBJ(), UNIT_TYPE_STRUCTURE) == false ) ) then
        return false
    endif
    if ( not ( UnitHasBuffBJ(GetAttacker(), 'B021') == true ) ) then
        return false
    endif
    if ( not ( GetUnitLifePercent(GetAttackedUnitBJ()) < 15.00 ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetAttacker()))] == true ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wolf_EX_Func001C (family, line 40845) ---
function Trig_Wolf_EX_Func001C takes nothing returns boolean
    if ( not Trig_Wolf_EX_Func001Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_Wolf_EX_Actions (family, line 40852) ---
function Trig_Wolf_EX_Actions takes nothing returns nothing
    if ( Trig_Wolf_EX_Func001C() ) then
        call UnitDamageTargetBJ( GetAttacker(), GetAttackedUnitBJ(), 9999.00, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_UNKNOWN )
        call AddSpecialEffectTargetUnitBJ( "chest", GetAttackedUnitBJ(), "Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl" )
        call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    else
    endif
endfunction

// --- InitTrig_Wolf_EX (family, line 40862) ---
function InitTrig_Wolf_EX takes nothing returns nothing
    set gg_trg_Wolf_EX = CreateTrigger(  )
    call DisableTrigger( gg_trg_Wolf_EX )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_Wolf_EX, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_Wolf_EX, Condition( function Trig_Wolf_EX_Conditions ) )
    call TriggerAddAction( gg_trg_Wolf_EX, function Trig_Wolf_EX_Actions )
endfunction

// === family YouDie (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_YouDie_Conditions (family, line 38571) ---
function Trig_YouDie_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0AF' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Func028Func003C (family, line 38578) ---
function Trig_YouDie_Func028Func003C takes nothing returns boolean
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(udg_YouDieKiller))] == true ) ) then
        return false
    endif
    if ( not ( GetUnitTypeId(GetAttacker()) == 'U00L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Func028C (family, line 38588) ---
function Trig_YouDie_Func028C takes nothing returns boolean
    if ( not Trig_YouDie_Func028Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_YouDie_Actions (family, line 38595) ---
function Trig_YouDie_Actions takes nothing returns nothing
    set udg_YouDieUnit = GetSpellTargetUnit()
    set udg_YouDieKiller = GetTriggerUnit()
    call CreateTextTagUnitBJ( "TRIGSTR_5735", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 2.80 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.50 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_PeonWhat2, 100.00, udg_YouDieKiller )
    call CreateTextTagUnitBJ( "TRIGSTR_5863", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_GruntWhat2, 100.00, udg_YouDieKiller )
    call CreateTextTagUnitBJ( "TRIGSTR_5864", udg_YouDieUnit, 0, 10.00, 100.00, 50.00, 50.00, 0 )
    call SetTextTagVelocityBJ( GetLastCreatedTextTag(), 32.00, 90 )
    call SetTextTagPermanentBJ( GetLastCreatedTextTag(), false )
    call SetTextTagLifespanBJ( GetLastCreatedTextTag(), 1.00 )
    call SetTextTagFadepointBJ( GetLastCreatedTextTag(), 1.00 )
    call TriggerSleepAction( 1.00 )
    call PlaySoundOnUnitBJ( gg_snd_PeonDeath, 100.00, udg_YouDieKiller )
    call AddSpecialEffectTargetUnitBJ( "body", udg_YouDieUnit, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call CreateNUnitsAtLoc( 1, 'o001', GetOwningPlayer(udg_YouDieKiller), GetUnitLoc(udg_YouDieUnit), bj_UNIT_FACING )
    call UnitApplyTimedLifeBJ( 0.80, 'BTLF', GetLastCreatedUnit() )
    if ( Trig_YouDie_Func028C() ) then
        call UnitDamageTargetBJ( GetLastCreatedUnit(), udg_YouDieUnit, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0AF', udg_YouDieKiller)) * 150.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_YouDieKiller, true)) * 9.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    else
        call UnitDamageTargetBJ( GetLastCreatedUnit(), udg_YouDieUnit, ( ( ( ( I2R(GetUnitAbilityLevelSwapped('A0AF', udg_YouDieKiller)) * 150.00 ) + 0.00 ) + ( I2R(GetHeroStatBJ(bj_HEROSTAT_STR, udg_YouDieKiller, true)) * 3.00 ) ) + 0.00 ), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
    endif
    call AddSpecialEffectTargetUnitBJ( "chest", udg_YouDieUnit, "Objects\\Spawnmodels\\Orc\\OrcSmallDeathExplode\\OrcSmallDeathExplode.mdl" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call SetUnitAnimation( udg_YouDieUnit, "death" )
endfunction

// --- InitTrig_YouDie (family, line 38634) ---
function InitTrig_YouDie takes nothing returns nothing
    set gg_trg_YouDie = CreateTrigger(  )
    call DisableTrigger( gg_trg_YouDie )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_YouDie, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_YouDie, Condition( function Trig_YouDie_Conditions ) )
    call TriggerAddAction( gg_trg_YouDie, function Trig_YouDie_Actions )
endfunction

// === family animal (passive) events=EVENT_PLAYER_UNIT_ATTACKED ===

// --- Trig_animal_Func001Func002C (family, line 43496) ---
function Trig_animal_Func001Func002C takes nothing returns boolean
    if ( not ( GetRandomInt(1, 5) == 1 ) ) then
        return false
    endif
    if ( not ( udg_EX_Mode[GetConvertedPlayerId(GetOwningPlayer(GetAttacker()))] == true ) ) then
        return false
    endif
    if ( not ( GetAttacker() == udg_GaiaCastUnit ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_animal_Func001C (family, line 43509) ---
function Trig_animal_Func001C takes nothing returns boolean
    if ( ( GetRandomInt(1, 25) <= GetUnitAbilityLevelSwapped('A09J', GetAttacker()) ) ) then
        return true
    endif
    if ( Trig_animal_Func001Func002C() ) then
        return true
    endif
    return false
endfunction

// --- Trig_animal_Conditions (family, line 43519) ---
function Trig_animal_Conditions takes nothing returns boolean
    if ( not Trig_animal_Func001C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_animal_Actions (family, line 43526) ---
function Trig_animal_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_FarmWhat1, 100.00, GetTriggerUnit() )
    call PlaySoundOnUnitBJ( gg_snd_SealWhat2, 100, GetTriggerUnit() )
    set udg_PassivePoint = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'ogru', GetOwningPlayer(GetAttacker()), udg_PassivePoint, bj_UNIT_FACING )
    call ShowUnitHide( GetLastCreatedUnit() )
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A04A', GetLastCreatedUnit() )
    call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetTriggerUnit(), 0 )
    call IssueTargetOrderBJ( GetLastCreatedUnit(), "hex", GetTriggerUnit() )
    call RemoveLocation(udg_PassivePoint)
    call EnableTrigger( gg_trg_Closeaeff )
endfunction

// --- InitTrig_animal (family, line 43541) ---
function InitTrig_animal takes nothing returns nothing
    set gg_trg_animal = CreateTrigger(  )
    call DisableTrigger( gg_trg_animal )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_animal, EVENT_PLAYER_UNIT_ATTACKED )
    call TriggerAddCondition( gg_trg_animal, Condition( function Trig_animal_Conditions ) )
    call TriggerAddAction( gg_trg_animal, function Trig_animal_Actions )
endfunction

// === family chieken (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_chieken_Conditions (family, line 43368) ---
function Trig_chieken_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A02L' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_chieken_Actions (family, line 43375) ---
function Trig_chieken_Actions takes nothing returns nothing
    call PlaySoundOnUnitBJ( gg_snd_ChickenWhat1, 100, GetTriggerUnit() )
endfunction

// --- InitTrig_chieken (family, line 43380) ---
function InitTrig_chieken takes nothing returns nothing
    set gg_trg_chieken = CreateTrigger(  )
    call DisableTrigger( gg_trg_chieken )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_chieken, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_chieken, Condition( function Trig_chieken_Conditions ) )
    call TriggerAddAction( gg_trg_chieken, function Trig_chieken_Actions )
endfunction

// === family farmer (armed) events=none ===

// --- Trig_farmer_Func003C (family, line 43391) ---
function Trig_farmer_Func003C takes nothing returns boolean
    if ( not ( GetUnitTypeId(GetTriggerUnit()) == 'n000' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_farmer_Conditions (family, line 43398) ---
function Trig_farmer_Conditions takes nothing returns boolean
    if ( not Trig_farmer_Func003C() ) then
        return false
    endif
    return true
endfunction

// --- Trig_farmer_Actions (family, line 43405) ---
function Trig_farmer_Actions takes nothing returns nothing
    call CreateItemLoc( 'I00O', GetUnitLoc(GetTriggerUnit()) )
endfunction

// --- InitTrig_farmer (family, line 43410) ---
function InitTrig_farmer takes nothing returns nothing
    set gg_trg_farmer = CreateTrigger(  )
    call DisableTrigger( gg_trg_farmer )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_farmer, EVENT_PLAYER_UNIT_DEATH )
    call TriggerAddCondition( gg_trg_farmer, Condition( function Trig_farmer_Conditions ) )
    call TriggerAddAction( gg_trg_farmer, function Trig_farmer_Actions )
endfunction

// === family goagain (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_goagain_Conditions (family, line 43552) ---
function Trig_goagain_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A088' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_goagain_Func001C (family, line 43559) ---
function Trig_goagain_Func001C takes nothing returns boolean
    if ( not ( GetPlayerState(GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD) >= 100 ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_goagain_Actions (family, line 43566) ---
function Trig_goagain_Actions takes nothing returns nothing
    if ( Trig_goagain_Func001C() ) then
        call AdjustPlayerStateBJ( -100, GetOwningPlayer(GetTriggerUnit()), PLAYER_STATE_RESOURCE_GOLD )
        call SetUnitLifeBJ( GetTriggerUnit(), ( GetUnitStateSwap(UNIT_STATE_LIFE, GetTriggerUnit()) + 1500.00 ) )
    else
    endif
endfunction

// --- InitTrig_goagain (family, line 43575) ---
function InitTrig_goagain takes nothing returns nothing
    set gg_trg_goagain = CreateTrigger(  )
    call DisableTrigger( gg_trg_goagain )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_goagain, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_goagain, Condition( function Trig_goagain_Conditions ) )
    call TriggerAddAction( gg_trg_goagain, function Trig_goagain_Actions )
endfunction

// === family godJumpWall (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_godJumpWall_Conditions (family, line 37951) ---
function Trig_godJumpWall_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'ANfd' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godJumpWall_Actions (family, line 37958) ---
function Trig_godJumpWall_Actions takes nothing returns nothing
    call UnitDamageTargetBJ( GetTriggerUnit(), GetSpellTargetUnit(), I2R(( GetHeroStatBJ(bj_HEROSTAT_INT, GetTriggerUnit(), true) * 3 )), ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC )
endfunction

// --- InitTrig_godJumpWall (family, line 37963) ---
function InitTrig_godJumpWall takes nothing returns nothing
    set gg_trg_godJumpWall = CreateTrigger(  )
    call DisableTrigger( gg_trg_godJumpWall )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_godJumpWall, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_godJumpWall, Condition( function Trig_godJumpWall_Conditions ) )
    call TriggerAddAction( gg_trg_godJumpWall, function Trig_godJumpWall_Actions )
endfunction

// === family godback (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_godback_Conditions (family, line 37974) ---
function Trig_godback_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A105' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godback_Func007Func001C (family, line 37981) ---
function Trig_godback_Func007Func001C takes nothing returns boolean
    if ( not ( GetOwningPlayer(GetEnumUnit()) != GetOwningPlayer(udg_whiteUnit) ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_godback_Func007A (family, line 37988) ---
function Trig_godback_Func007A takes nothing returns nothing
    if ( Trig_godback_Func007Func001C() ) then
        call SetUnitFacingToFaceUnitTimed( GetLastCreatedUnit(), GetEnumUnit(), 0 )
        call IssueTargetOrderBJ( GetLastCreatedUnit(), "polymorph", GetEnumUnit() )
    else
    endif
endfunction

// --- Trig_godback_Func010A (family, line 37996) ---
function Trig_godback_Func010A takes nothing returns nothing
    call KillUnit( GetEnumUnit() )
    call RemoveUnit( GetEnumUnit() )
endfunction

// --- Trig_godback_Actions (family, line 38001) ---
function Trig_godback_Actions takes nothing returns nothing
    set udg_P1 = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'hfoo', GetOwningPlayer(GetTriggerUnit()), udg_P1, bj_UNIT_FACING )
    set udg_whiteUnit = GetLastCreatedUnit()
    call UnitApplyTimedLifeBJ( 2.00, 'BTLF', GetLastCreatedUnit() )
    call UnitAddAbilityBJ( 'A104', GetLastCreatedUnit() )
    set bj_wantDestroyGroup = true
    call ForGroupBJ( GetUnitsInRangeOfLocAll(900.00, udg_P1), function Trig_godback_Func007A )
    call RemoveLocation( udg_P1 )
    call TriggerSleepAction( 5.00 )
    call ForGroupBJ( GetUnitsOfPlayerAndTypeId(GetOwningPlayer(GetTriggerUnit()), 'hfoo'), function Trig_godback_Func010A )
endfunction

// --- InitTrig_godback (family, line 38015) ---
function InitTrig_godback takes nothing returns nothing
    set gg_trg_godback = CreateTrigger(  )
    call DisableTrigger( gg_trg_godback )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_godback, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_godback, Condition( function Trig_godback_Conditions ) )
    call TriggerAddAction( gg_trg_godback, function Trig_godback_Actions )
endfunction

// === family link (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_link_Conditions (family, line 38143) ---
function Trig_link_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0RO' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_link_Actions (family, line 38150) ---
function Trig_link_Actions takes nothing returns nothing
    local location TedPoint

    set udg_TUnit[0] = GetTriggerUnit()
    set TedPoint = GetSpellTargetLoc()
    set udg_Tpoint = GetUnitLoc(udg_TUnit[0])
    set udg_TAngle = AngleBetweenPoints(udg_Tpoint, TedPoint)
    call RemoveLocation( TedPoint )
    call EnableTrigger( gg_trg_linkmove )
endfunction

// --- InitTrig_link (family, line 38162) ---
function InitTrig_link takes nothing returns nothing
    set gg_trg_link = CreateTrigger(  )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_link, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_link, Condition( function Trig_link_Conditions ) )
    call TriggerAddAction( gg_trg_link, function Trig_link_Actions )
endfunction

// === family lzfs (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_lzfs_Conditions (family, line 38898) ---
function Trig_lzfs_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0J8' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_lzfs_Actions (family, line 38905) ---
function Trig_lzfs_Actions takes nothing returns nothing
    set udg_lzfsUnits2[0] = GetTriggerUnit()
    set udg_lzfsUnits2[1] = GetSpellTargetUnit()
    call ShowUnitHide( udg_lzfsUnits2[0] )
    call AddSpecialEffectLocBJ( GetUnitLoc(udg_lzfsUnits2[1]), "AquaSpikeVersion2.mdx" )
    call DestroyEffectBJ( GetLastCreatedEffectBJ() )
    call TriggerSleepAction( 0.01 )
    set udg_lzfsCount = 0
    call EnableTrigger( gg_trg_lzfsEffect )
endfunction

// --- InitTrig_lzfs (family, line 38917) ---
function InitTrig_lzfs takes nothing returns nothing
    set gg_trg_lzfs = CreateTrigger(  )
    call DisableTrigger( gg_trg_lzfs )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_lzfs, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_lzfs, Condition( function Trig_lzfs_Conditions ) )
    call TriggerAddAction( gg_trg_lzfs, function Trig_lzfs_Actions )
endfunction

// === family newlzfs (active) events=EVENT_PLAYER_UNIT_SPELL_EFFECT ===

// --- Trig_newlzfs_Conditions (family, line 39007) ---
function Trig_newlzfs_Conditions takes nothing returns boolean
    if ( not ( GetSpellAbilityId() == 'A0MV' ) ) then
        return false
    endif
    return true
endfunction

// --- Trig_newlzfs_Actions (family, line 39014) ---
function Trig_newlzfs_Actions takes nothing returns nothing
    set udg_Dog_lzfsMU = GetTriggerUnit()
    set udg_Dog_lzfsP = GetSpellTargetLoc()
    set udg_Dog_lzfsTP = GetUnitLoc(GetTriggerUnit())
    call CreateNUnitsAtLoc( 1, 'h02E', GetOwningPlayer(GetTriggerUnit()), udg_Dog_lzfsTP, bj_UNIT_FACING )
    call RemoveUnitSP( GetLastCreatedUnit() , 5 , 1)
    set udg_Dog_lzfsU = GetLastCreatedUnit()
    set udg_Dog_lzfsAngle = AngleBetweenPoints(udg_Dog_lzfsTP, udg_Dog_lzfsP)
    set udg_Dog_lzfsDist = DistanceBetweenPoints(udg_Dog_lzfsTP, udg_Dog_lzfsP)
    call EnableTrigger( gg_trg_newlzfsmove )
endfunction

// --- InitTrig_newlzfs (family, line 39027) ---
function InitTrig_newlzfs takes nothing returns nothing
    set gg_trg_newlzfs = CreateTrigger(  )
    call DisableTrigger( gg_trg_newlzfs )
    call TriggerRegisterAnyUnitEventBJ( gg_trg_newlzfs, EVENT_PLAYER_UNIT_SPELL_EFFECT )
    call TriggerAddCondition( gg_trg_newlzfs, Condition( function Trig_newlzfs_Conditions ) )
    call TriggerAddAction( gg_trg_newlzfs, function Trig_newlzfs_Actions )
endfunction
