# Changelog

All notable changes to Bee are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-09-28

### Added

- Anything caught in a web can now slowly wriggle free. A trapped bee or insect
  pushes outward with a slow wobble and slips loose after roughly ten seconds,
  so a spider busy eating someone else gives you a chance to escape — but if it
  is not busy, it will reach you first. Applies to the player, helper bees,
  wasps, and dragonflies alike.
- Spiders now eat anything caught in their web, not just wasps and dragonflies.
  A tangled helper bee or the tangled player is hunted and bitten until it dies.
  A helper eaten this way still queues its normal nectar respawn, via the shared
  `killGuard` path, so the colony can recover it.

## [0.5.1] - 2026-09-28

### Fixed

- Helper bees are now caught by webs too, completing the "everything but
  spiders" rule. A flying helper that enters a web loses steering and its speed
  collapses until it works free; a helper already settled on a flower or the
  hive is unaffected. Helpers also no longer choose flowers that sit inside a
  web, so a snared forager cannot get stuck circling an unreachable target.

## [0.5.0] - 2026-09-28

### Added

- Spider webs now catch everything except spiders. Wasps and dragonflies that
  fly into a web become tangled: their steering is cut and their speed
  collapses, so they crawl free only slowly instead of charging straight
  through. Webs marked with `tangled` state for both enemy types.
- Spiders now hunt and eat prey caught in their own web, biting roughly every
  0.9 seconds until it dies. Spiders stay immune to webs, including their own.

### Fixed

- A tangled dragonfly no longer teleports out of a web. The far-from-target
  relocation now skips entangled dragonflies, so they cannot escape by jumping
  several thousand pixels away.

### Changed

- Enemy stat rebalance. Wasps are now the tough ones (4 HP, +1 per 6 days) and
  dragonflies are fragile glass cannons (2 HP) that hit twice as hard — 2 lives
  per contact versus 1 for a wasp or spider — while staying the fastest enemy in
  the meadow. Previously this was inverted: dragonflies had 4 HP and were
  sturdier than wasps.
- Enemy contact damage is now actually applied. `resolveEnemyContact` was given
  an attack value that was never used, so every enemy cost exactly one life
  regardless of type; that value is now passed through to `damageBee`.

## [0.4.1] - 2026-09-28

### Fixed

- Colony growth no longer counts combat rewards. Killing an enemy still banks 2
  spendable nectar, but only nectar gathered from flowers advances the
  one-helper-per-5-nectar milestone. Previously kill rewards fed the same total
  that drives colony growth, which also feeds enemy scaling, so the colony could
  balloon from combat alone without any foraging.

## [0.4.0] - 2026-09-28

### Added

- A dedicated COLONY counter in the status row showing live bees over the
  colony's maximum (`alive/total`), including the player. It drops when a
  helper dies and recovers when one respawns.

### Changed

- The bee count moved out of the day line (`DAY 01 · GOAL 0/6`) into the new
  COLONY counter.

## [0.3.0] - 2026-09-28

### Added

- Helper bees now land at a flower to gather and land at the hive to unload,
  exactly like the player, so a working helper is hidden from enemies while it
  is settled.
- Enemy pressure now scales with nectar collected rather than the day counter:
  the meadow starts nearly empty and fills up as the colony banks nectar.
- Flowers are now consumed. A harvested flower disappears once the bee that
  picked it has taken off, and fresh flowers grow elsewhere on a fixed timer
  (`flowerSpawn`, default 6 seconds).

### Changed

- Removed in-place flower regrowth in favour of the consume-and-respawn cycle.
- New tuning knobs: `flowerSpawn`, `enemyBase`, `enemyStep`, `dragonStep`.

## [0.2.1] - 2026-09-27

### Fixed

- Enemies no longer see or pursue a bee that has landed. Wasps, dragonflies,
  and spiders now only target the player and helper bees while those bees are
  airborne (`sheltered`), so a landed bee is genuinely hidden rather than merely
  immune to damage.

## [0.2.0] - 2026-09-27

### Added

- Killing an enemy now rewards 2 nectar. This applies to kills by the player and
  by helper bees alike, and the nectar is banked at the hive immediately.

## [0.1.1] - 2026-09-27

### Fixed

- Helper bees now always keep at least one dedicated forager and one dedicated
  hive guard; any additional bees alternate freely between the two jobs.
  Previously every bee chose to forage or patrol probabilistically, so the hive
  could be left momentarily unguarded.

## [0.1.0] - 2026-09-27

First versioned pre-alpha: stability and polish lock. No new mechanics beyond
the nectar economy and helper bees; this release freezes the current feature set
and gives it a single source of truth for the version.

### Added

- Nectar economy: nectar delivered to the hive is a spendable resource.
- Helper bees that patrol the hive, attack nearby threats, forage flowers,
  collect one nectar, and return it to the hive.
- Two free helper bees at the start of every run.
- Every five nectar collected in total unlocks another helper; its first spawn
  costs one stored nectar.
- Player and helper respawns each cost one stored nectar.
- Extra helpers stay alive if the bank drops below their tier, but a dead extra
  waits for the hive's nectar to reach its tier (5, 10, 15, ...) before spending
  one nectar to respawn.
- Off-screen HOME pointer showing the hive's direction and distance.
- Persistent landing toggle: press once near a flower or the hive to land and
  stay sheltered without holding the control; press again to launch.
- HUD that distinguishes hive nectar from the nectar the bee is carrying.
- Single version source of truth (`version.js`) surfaced in the HUD and the
  service-worker cache, alongside `VERSION` and `package.json`.

### Changed

- Service-worker cache name now derives from the version constant instead of a
  hand-bumped literal.
