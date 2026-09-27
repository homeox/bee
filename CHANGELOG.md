# Changelog

All notable changes to Bee are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
