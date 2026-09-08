/** Complete six-slot source intent, not executable Gold; no legacy mapping copied. */
export const INTENT_SEEDS = {
  '03': {
    identity: ['《THE KING OF FIGHTERS》', '飛行道具、近身範圍、突進'],
    slots: {
      PASSIVE: { steps: ['after_movement_complete', 'grant_one_empowered_basic'], limits: ['short_duration', 'refresh_not_stack'], forbidden: ['unconditional_basic_proc'], unknown: ['empower_amount', 'duration'] },
      Q: { steps: ['throw_projectile', 'damage_legal_path_targets'], limits: ['projectile_hit_geometry'], forbidden: ['invented_terminal_explosion'], unknown: ['damage_type', 'damage_amount', 'pierce_count'] },
      W: { steps: ['forward_close_flame_arc'], limits: ['forward_arc_not_full_circle'], forbidden: ['replace_with_long_ranged_line'], unknown: ['arc_angle', 'damage_amount'] },
      E: { steps: ['straight_caster_charge', 'collision_hit'], limits: ['stop_on_wall', 'stop_at_max_distance'], forbidden: ['wall_phasing', 'invented_knockback'], unknown: ['distance', 'repeat_hit_policy'] },
      R: { steps: ['visible_windup', 'charge_multi_hit', 'small_area_finisher'], limits: ['finisher_is_last'], forbidden: ['stationary_combo_only', 'unconditional_invulnerability'], unknown: ['strikes', 'windup', 'damage_budget'] },
      EX: { steps: ['temporary_follow_cast_afterimage', 'bounded_extra_hits'], limits: ['no_independent_target_search', 'no_self_recursive_afterimage_trigger'], forbidden: ['autonomous_combat_summon'], unknown: ['duration', 'extra_hit_cap'] }
    }, relations: [{ from: 'E', to: 'PASSIVE', kind: 'movement_completion_may_trigger', certainty: 'category_inference_not_explicit_slot_edge' },
      { from: 'R', to: 'PASSIVE', kind: 'movement_completion_may_trigger', certainty: 'category_inference_not_explicit_slot_edge' }],
    reviewScope: ['fan_body_arc_distinct_hit_geometry', 'wall_collision', 'repeat_collision', 'recursive_afterimage']
  },
  '12': {
    identity: ['《Fate/stay night》', 'Unlimited Blade Works 路線'],
    slots: {
      PASSIVE: { steps: ['melee_exchange_grants_analysis', 'discount_next_projection_cost'], limits: ['minimum_cost_floor'], forbidden: ['unlimited_free_projection'], unknown: ['stack_cap', 'discount_per_stack', 'minimum_cost'] },
      Q: { steps: ['project_twin_blades', 'close_cross_slash'], limits: ['temporary_projected_weapon'], forbidden: ['permanent_inventory_item'], unknown: ['hit_count', 'damage_amount'] },
      W: { steps: ['directional_projected_swords'], limits: ['finite_sword_count', 'temporary_projected_weapon'], forbidden: ['unlimited_projectiles'], unknown: ['sword_count', 'flight_speed'] },
      E: { steps: ['short_caster_move', 'empower_next_melee_hit'], limits: ['one_next_hit'], forbidden: ['invented_displacement_damage'], unknown: ['distance', 'empower_duration'] },
      R: { steps: ['temporary_sword_domain', 'empower_W', 'periodic_extra_swords'], limits: ['fixed_cadence', 'no_map_boundary_change', 'expiry_and_death_cleanup'], forbidden: ['permanent_domain'], unknown: ['domain_duration', 'cadence', 'W_boost'] },
      EX: { steps: ['intercept_one_frontal_attack', 'unlock_one_counter_on_success'], limits: ['frontal_only', 'counter_requires_success'], forbidden: ['counter_when_parry_fails', 'omnidirectional_intercept'], unknown: ['parry_window', 'counter_window'] }
    }, relations: [{ from: 'R', to: 'W', kind: 'temporary_empowerment', certainty: 'explicit' }],
    reviewScope: ['bounded_weapon_lifetime_and_count', 'domain_expiry', 'death_cleanup', 'no_HF_transplanted_arm']
  },
  '13': {
    identity: ['GGO 的詩乃', 'Hecate II'],
    slots: {
      PASSIVE: { steps: ['stable_posture_grants_aim', 'movement_or_damage_reduces_aim'], limits: ['aim_cap'], forbidden: ['unbounded_aim'], unknown: ['gain_rate', 'cap', 'reduction_amount'] },
      Q: { steps: ['short_charge', 'straight_shot', 'damage_scales_with_aim'], limits: ['server_ray_and_collision'], forbidden: ['ignore_cover'], unknown: ['aim_scaling', 'charge_time'] },
      W: { steps: ['show_valid_ray_and_cover', 'brief_mark_one_visible_enemy'], limits: ['target_already_visible'], forbidden: ['reveal_unseen_enemy', 'invented_damage'], unknown: ['mark_duration'] },
      E: { steps: ['short_roll', 'interrupt_own_aim', 'reposition'], limits: ['legal_movement'], forbidden: ['maintain_aim_while_rolling'], unknown: ['roll_distance', 'iframe_policy'] },
      R: { steps: ['longer_aim', 'visible_enemy_ray_warning', 'high_damage_bullet'], limits: ['server_ray_and_collision', 'interruption_and_movement_checks'], forbidden: ['unwarned_instant_hit'], unknown: ['aim_time', 'damage_amount'] },
      EX: { steps: ['close_quick_shot', 'small_caster_retreat'], limits: ['bounded_self_defense'], forbidden: ['enemy_knockback_instead_of_self_retreat'], unknown: ['retreat_distance'] }
    }, relations: [{ from: 'PASSIVE', to: 'Q', kind: 'aim_scales_damage', certainty: 'explicit' },
      { from: 'E', to: 'PASSIVE', kind: 'interrupts_aiming', certainty: 'explicit' }],
    reviewScope: ['cover', 'line_of_sight_loss', 'moving_cancels_aim', 'fast_target', 'exclude_ALO_and_god_account']
  },
  '16': {
    identity: ['《Fate/kaleid liner 魔法少女☆伊莉雅》', '魔杖射擊、職階卡、限時武裝'],
    slots: {
      PASSIVE: { steps: ['successive_different_magic_casts', 'empower_next_defense_or_attack'], limits: ['one_cast_multihit_cannot_quick_fill'], forbidden: ['each_damage_tick_is_new_cast'], unknown: ['cast_count', 'enhancement_amount'] },
      Q: { steps: ['straight_magic_projectile_from_ruby'], limits: ['correct_emitter'], forbidden: ['borrow_other_Illya_version'], unknown: ['collision_policy', 'damage_amount'] },
      W: { steps: ['finite_frontal_shield'], limits: ['frontal_only', 'finite_durability'], forbidden: ['unlimited_or_omnidirectional_shield'], unknown: ['shield_angle', 'durability'] },
      E: { steps: ['short_floating_move'], limits: ['duel_boundary', 'legal_landing'], forbidden: ['ignore_boundary'], unknown: ['flight_height', 'distance'] },
      R: { steps: ['temporary_Saber_armament', 'replace_basic_and_Q', 'restore_on_expiry'], limits: ['life_continues', 'cooldowns_continue', 'death_restoration'], forbidden: ['reset_health', 'reset_cooldowns', 'permanent_form'], unknown: ['duration', 'Saber_Q_recipe'] },
      EX: { steps: ['limited_install_treasure', 'visible_windup', 'one_straight_beam_attack'], limits: ['distinct_from_R_form'], forbidden: ['permanent_Saber_form_from_EX'], unknown: ['beam_width', 'windup'] }
    }, relations: [{ from: 'R', to: 'Q', kind: 'temporary_replacement', certainty: 'explicit' }],
    reviewScope: ['limited_install_vs_full_install', 'weapon_attach', 'return_original_skills', 'death_restore', 'exclude_other_Illya_versions']
  },
  '23': {
    identity: ['《銀魂》', '木刀近戰、反擊、喜劇節奏'],
    slots: {
      PASSIVE: { steps: ['out_of_combat_grants_supply'], limits: ['capacity_one'], forbidden: ['stack_multiple_supplies'], unknown: ['out_of_combat_time'] },
      Q: { steps: ['wooden_sword_forward_sweep'], limits: ['forward_geometry'], forbidden: ['global_damage'], unknown: ['damage_type', 'width'] },
      W: { steps: ['consume_supply', 'drink_briefly_and_heal'], limits: ['interrupt_on_damage', 'interrupt_on_move'], forbidden: ['heal_despite_interruption', 'use_without_supply'], unknown: ['heal_timing', 'heal_amount', 'consume_on_interrupt_policy'] },
      E: { steps: ['short_parry_window', 'unlock_one_counter_on_success'], limits: ['success_required'], forbidden: ['counter_after_failed_parry'], unknown: ['window', 'eligible_attacks'] },
      R: { steps: ['temporary_melee_and_pursuit_enhancement'], limits: ['finite_duration'], forbidden: ['permanent_transformation'], unknown: ['duration', 'exact_modifiers'] },
      EX: { steps: ['close_heavy_hit', 'interrupt_interruptible_cast'], limits: ['cast_must_be_interruptible', 'comedy_text_is_presentation'], forbidden: ['interrupt_uninterruptible', 'dialogue_as_extra_mechanic'], unknown: ['damage_amount'] }
    }, relations: [{ from: 'PASSIVE', to: 'W', kind: 'supply_consumption', certainty: 'explicit' }],
    reviewScope: ['counter_failure', 'supply_interrupt', 'enhancement_expiry', 'dialogue_not_instruction']
  },
  '25': {
    identity: ['角色實體：埼玉', '保留「一拳超人」顯示名稱'],
    slots: {
      PASSIVE: { steps: ['not_attacking_for_time', 'limited_next_normal_punch_boost'], limits: ['next_attack_only'], forbidden: ['always_empowered'], unknown: ['idle_duration', 'boost_amount', 'normal_punch_basic_or_Q_ambiguity'] },
      Q: { steps: ['short_range_single_heavy_punch'], limits: ['single_hit'], forbidden: ['delete_target_directly'], unknown: ['damage_amount'] },
      W: { steps: ['multi_punch_combo'], limits: ['fixed_whole_skill_damage_budget'], forbidden: ['full_skill_budget_on_every_hit'], unknown: ['strikes', 'budget_distribution'] },
      E: { steps: ['fast_straight_move'], limits: ['stop_after_collision'], forbidden: ['phase_through_wall', 'invented_collision_damage'], unknown: ['collision_class', 'distance'] },
      R: { steps: ['long_visible_windup', 'directional_high_damage_shockwave'], limits: ['dodge_window', 'shield_reduction_survival_resolution'], forbidden: ['instant_kill_bypass', 'integer_overflow'], unknown: ['damage_cap', 'windup'] },
      EX: { steps: ['temporary_fast_left_right_move', 'afterimages', 'limited_evasion_opportunity'], limits: ['finite_duration'], forbidden: ['permanent_invulnerability'], unknown: ['evasion_formula', 'move_sequence', 'duration'] }
    }, relations: [], reviewScope: ['shield_and_reduction_and_survival', 'overflow', 'collision', 'multihit_triggers', 'identity_not_instant_deletion']
  },
  '28': {
    identity: ['《無職轉生》', '接受劍之聖地訓練後的劍士版本'],
    slots: {
      PASSIVE: { steps: ['first_melee_hit_on_recent_engagement', 'limited_bonus'], limits: ['cooldown_per_target'], forbidden: ['every_hit_bonus', 'global_cooldown_substitution'], unknown: ['engagement_window', 'per_target_cooldown'] },
      Q: { steps: ['step_forward', 'slash'], limits: ['move_then_slash'], forbidden: ['stationary_hit_only'], unknown: ['step_distance', 'damage_amount'] },
      W: { steps: ['temporary_damage_endurance'], limits: ['bounded_stacking'], forbidden: ['unlimited_stacks'], unknown: ['mitigation_or_shield_design', 'duration'] },
      E: { steps: ['short_approach'], limits: ['interceptible_path'], forbidden: ['teleport', 'invented_damage_or_knockback'], unknown: ['distance'] },
      R: { steps: ['visible_windup', 'high_speed_straight_slash', 'stop_at_legal_hit_position'], limits: ['finite_distance', 'collision'], forbidden: ['infinite_light_speed', 'unwarned_teleport'], unknown: ['windup', 'hit_policy'] },
      EX: { steps: ['one_extra_pursuit_hit'], limits: ['target_recently_hit_by_self', 'close_target', 'refuse_out_of_range'], forbidden: ['ally_hit_enables', 'out_of_range_pursuit'], unknown: ['recent_hit_window', 'range'] }
    }, relations: [], reviewScope: ['first_engagement', 'own_hit_pursuit_window', 'charge_collision', 'high_attack_speed_animation']
  },
  '30': {
    identity: ['《ヤニねこ／尼古喵喵》', '佐藤ヤニ子', '以下戰鬥技能全部為 GGD 創編'],
    slots: {
      PASSIVE: { steps: ['stationary_accumulate_procrastination', 'clear_on_damage'], limits: ['maximum_three'], forbidden: ['unconditional_attack_proc'], unknown: ['accumulation_period', 'which_casts_can_spend'] },
      Q: { steps: ['throw_prop', 'one_small_area_hit_on_landing'], limits: ['impact_not_release'], forbidden: ['invented_damage_during_flight'], unknown: ['flight_time', 'damage_amount'] },
      W: { steps: ['temporary_small_smoke_zone', 'explicit_hit_interference'], limits: ['finite_area_and_duration'], forbidden: ['full_invisibility', 'single_target_slow_substitute'], unknown: ['hit_interference_rule', 'duration'] },
      E: { steps: ['short_retreat', 'cosmetic_junk_afterimage'], limits: ['afterimage_visual_only'], forbidden: ['afterimage_damage', 'invented_enemy_knockback'], unknown: ['retreat_distance'] },
      R: { steps: ['three_waves_of_props_in_selected_area', 'landing_warning'], limits: ['fixed_selected_area', 'three_waves'], forbidden: ['unwarned_hits', 'following_target_area'], unknown: ['damage_definition', 'wave_timing'] },
      EX: { steps: ['spend_procrastination_stacks', 'stationary_self_shield'], limits: ['end_early_on_movement'], forbidden: ['shield_persists_after_move'], unknown: ['spend_count', 'shield_scaling', 'duration'] }
    }, relations: [{ from: 'PASSIVE', to: 'EX', kind: 'resource_consumption', certainty: 'explicit' }],
    reviewScope: ['GGD_original_not_canon', 'smoke_information', 'prop_concurrency', 'stationary_charge', 'damage_clears_resource']
  },
  '34': {
    identity: ['《膽大黨》', '高速婆婆本體的妖怪戰鬥意象'],
    slots: {
      PASSIVE: { steps: ['chase_same_visible_target_accumulates_speed', 'decay_if_target_changes_or_los_lost_or_chase_stops'], limits: ['same_visible_target'], forbidden: ['permanent_speed_stack'], unknown: ['cap', 'gain_and_decay_rate'] },
      Q: { steps: ['short_charge', 'claw_hit'], limits: ['bounded_distance'], forbidden: ['invented_enemy_push'], unknown: ['distance', 'hit_count'] },
      W: { steps: ['rapid_direction_change', 'reduce_current_acceleration_stacks'], limits: ['spend_acceleration_for_control'], forbidden: ['keep_all_stacks', 'low_jump_substitute'], unknown: ['stack_cost', 'turn_rate'] },
      E: { steps: ['mark_one_visible_enemy', 'self_accelerates_while_moving_toward_mark'], limits: ['direction_toward_mark', 'visible_target'], forbidden: ['speed_while_fleeing_mark', 'invented_target_slow_or_damage'], unknown: ['duration', 'speed_bonus'] },
      R: { steps: ['temporary_speed_cap_and_turning_boost'], limits: ['collision_checks_remain'], forbidden: ['unlimited_wall_phasing'], unknown: ['duration', 'speed_cap', 'turn_rate'] },
      EX: { steps: ['windup', 'long_straight_charge'], limits: ['stop_on_first_hero_or_obstacle'], forbidden: ['pierce_all_heroes'], unknown: ['windup', 'distance'] }
    }, relations: [{ from: 'W', to: 'PASSIVE', kind: 'reduce_acceleration_stacks', certainty: 'explicit' }],
    reviewScope: ['wall_tunneling', 'corner_turns', 'target_death', 'pursuit_range', 'body_not_cat_container_or_Okarun']
  }
};
