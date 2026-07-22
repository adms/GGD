# Match flow & game server — TODO

`apps/game-server`. MatchController (headless orchestrator) + Colyseus MatchRoom wrapper +
PairedDuels + driver seam + AI Tier-0 + Go⇄Colyseus HMAC.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| match-01 | PhaseMachine: champSelect→[interm→combat→resolution]*→end | phase-machine-transitions | unit | done |
| match-02 | PairedDuels pairing rotates round-robin (4/3/2 teams) | paired-duels-pairing | unit | done |
| match-03 | Lives lost scales with round | paired-duels-lives | unit | done |
| match-04 | Full 12-bot match runs to matchEnd with placements 1-4 | match-full-bots | integration | done |
| match-05 | Driver swap at tick boundary preserves entity state | driver-swap-seam | integration | done |
| match-06 | AI buys/ranks in intermission; picks augment offers | ai-intermission | integration | done |
| match-07 | HMAC sign/verify + skew reject (game side) | game-hmac | security | done |
| match-08 | Seat ticket mint/verify + expiry | game-ticket | security | done |
| match-09 | Combat ends when one side is down; loser loses lives | combat-resolution | integration | done |
| match-10 | Same seed + all-bot match → identical result | match-deterministic | determinism | done |
| match-11 | Human mailbox: stale seq dropped, latest order wins | input-mailbox-seq | unit | done |
| match-12 | Snapshot projects seats/teams/entities to schema | snapshot-projection | unit | done |
| match-13 | Schema state ENCODES without crashing (field semantics) | schema-encode | regression | done |
