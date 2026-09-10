# Hero74 action v3

This is the frozen, reproducible bounded-action training projection for the
74 verified compact HeroPlan teachers. It adds no hero, does not alter any
teacher configuration, retains the 59-hero train / 15-hero internal-dev split,
and does not place teacher answers in an unseen inference prompt.

The model produces identity, one selection per slot, product-template cores,
then bounded JSON `shape` / `value` actions. The action runtime—not a teacher
record—derives each next frontier cursor from accepted prior shapes. Every
completion is at most 600 JSON characters. All 74 teacher configurations
replay exactly through that queue.

Template/effect/hook/condition/VFX semantic choices remain catalog-bounded.
The pinned catalog is not yet a complete config-tree schema; JSON field
validity therefore remains fail-closed at the authoritative HeroPlan schema
and compiler. This is a staged validation boundary, not permission to accept
an invalid hero. A separate catalog-completeness issue draft records the
missing early-field grammar work.

Counts: 2,116 train decisions across 59 heroes; 586 internal-dev decisions
across 15 heroes. This proves data/protocol replay only, not training quality,
compile/import/match behavior, promotion, or unseen-hero success.
