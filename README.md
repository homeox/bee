# Bee

`Bee` is a mobile-ready, top-down foraging game forked from the movement and scrolling foundation of Star Drift. Fly out from a central hive, find flower patches, slow down and land to gather nectar, then carry it safely home. A landed bee settles visibly into a flower or the hive and is sheltered from predators until it takes off. A prominent HOME pointer always shows the hive's direction and distance when it is off-screen.

The meadow grows busier as nectar is banked. It starts nearly empty and enemy numbers and health scale with the combined lifetime nectar of every colony: wasps pursue bees and launch direct raids on hives, biting for one damage from the front but dealing two with their rear stinger; dragonflies make lethal hit-and-run dives that take a bee, wasp, or spider outright before leaving to digest; and spiders guard webs that tangle anything but a spider. Every wasp strike on a hive consumes one stored nectar and rallies every surviving bee from that hive onto the attacker. Spider webs grow after every confirmed kill and disappear when they no longer have a living owner. A trapped bee must wriggle free slowly and turns sluggishly, giving a free spider room to outflank it. The meadow is persistent: relief-shaded trees and bushes stand as solid obstacles. Flowers grow in concentrated, reusable beds instead of being scattered evenly across the world. Combat is deliberately simple: reverse into a target and the rear stinger extends. Worker bees use the same visible stinger animation. Two workers begin at the hive, always keeping at least one forager and one hive guard, with any extra workers alternating between the two jobs. Workers search for flowerbeds, remember the beds they discover, and use that knowledge on later trips. They share memories at their hive and by bumping into a friendly bee in the field. Each colony maintains its own circulating knowledge, and a bee loses its personal memories when it dies. Workers land at flowers to gather and at the hive to unload, just like the player.

Every hive begins with three stored nectar. Nectar is both a spendable resource and the hive's siege reserve: wasp or rival-bee attacks remove one nectar, and a hive is destroyed when it reaches zero. Routine respawns preserve the final reserve. Each player or worker respawn otherwise costs one nectar. Every five actual stored nectar unlocks another worker, regardless of whether that nectar came from flowers, combat, or a raid; its first spawn also costs one nectar. Extra workers remain active if the bank drops, but after death they wait until the hive's current nectar reaches their five-nectar tier before spending one nectar to respawn.

After a hive gathers 100 nectar beyond its three-nectar reserve, it spends those 100 to launch a queen toward a distant unexplored site. On arrival she founds a persistent rival hive with two workers, a fresh three-nectar reserve, respawns, worker milestones, and future queens. Every descendant colony receives a distinct body and hive shade. Colonies compete for the same flowers and their bees can rear-sting one another; killing a rival bee awards one spendable nectar to the victorious hive. Well-funded colonies may also raid rival hives and steal one nectar per successful sting. Their workers compare reserves, known safe flower supply, distance, defenders, and target value before deciding whether a raid is worth the risk.

The compact procedural soundscape uses a filtered, low-volume wing flutter plus soft puffs and bell-like meadow cues. It remains fully offline and adds no downloaded audio assets.

The lobby doubles as a live attract mode: an AI-controlled bee plays the complete foraging loop behind the title screen, including flower landings, hive deliveries, evasive flying, and automatic reverse attacks. Starting the game resets the demo and hands over fresh controls.

## Play locally

Serve this folder with any static web server:

```bash
npx serve .
```

Opening `index.html` directly also works, except PWA installation requires a web server.

## Controls

- Turn: Arrow Left/Right or A/D
- Fly: Arrow Up or W
- Reverse/attack: Arrow Down or S (a short burst is faster than forward flight)
- Land/gather/unload: Space (press once near a flower or the hive to land, then press again to launch)
- Pause: P or Escape
- Zoom: + / -
- Mobile: analog movement joystick plus held ATTACK/reverse and toggle LAND buttons
- Mobile zoom: pinch two fingers on the meadow

## Developer launch controls

Unlock tuning with `?dev=hivelab`. Example:

```text
http://localhost:4174/?dev=hivelab&day=8&preset=chaos&enemies=3
```

Presets are `peaceful`, `forager`, `swarm`, and `chaos`. Feature switches are `wasps`, `dragonflies`, `spiders`, and `webs`. Balance controls are `flowers=0.5..3`, `enemies=0.25..3`, `capacity=1..8`, and `invincible=1`. Use `nectar=125` to begin with enough gathered nectar to pay the worker milestones and immediately launch a 100-nectar queen for colony testing.

## Android port

The Android port uses Capacitor while keeping the root web files as the source of truth. It targets Android SDK 34, supports Android 5.1 and newer, runs in immersive sensor-landscape mode, respects display cutouts, keeps the screen awake during play, and bundles all game assets for offline use.

```bash
npm install
npm run mobile:build
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`mobile:build` first copies the current web game into the ignored `www/` staging directory, synchronizes it into the native project, and builds the debug APK. Gradle uses the SDK from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `android/local.properties`.

The Progressive Web App remains available as a lighter install option, and the same Capacitor structure can be extended with an iOS target later without changing the game engine.

## License

MIT
