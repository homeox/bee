# Bee

`Bee` is a mobile-ready, top-down foraging game forked from the movement and scrolling foundation of Star Drift. Fly out from a central hive, find flower patches, slow down and land to gather nectar, then carry it safely home. A landed bee settles visibly into a flower or the hive and is sheltered from predators until it takes off. A prominent HOME pointer always shows the hive's direction and distance when it is off-screen.

The meadow grows busier as nectar is banked. It starts nearly empty and enemy numbers scale with the colony's total nectar: wasps pursue the player, dragonflies make lethal hit-and-run dives that take a bee, wasp, or spider outright before leaving to digest, and spiders guard webs that tangle anything but a spider, and they eat whatever is caught — wasps, dragonflies, helper bees, even you, so a trapped bee must wriggle free slowly and turns sluggishly — a spider that is busy with other prey gives you a chance to slip away, but one that is free can outflank a bee that was not already facing the right way. The meadow is persistent: trees and bushes stand as solid obstacles, and each spider's web grows with every kill it makes and is lost when the spider dies. Flowers are consumed when harvested — a picked flower vanishes once the bee that took it has flown off, and new flowers grow elsewhere on a timer. Combat is deliberately simple: reverse into a predator and the bee automatically extends its rear stinger, and helper bees fight the same way. Two friendly bees begin at the hive, always keeping at least one forager and one hive guard, with any extra bees alternating between the two jobs. Helpers land at flowers to gather and at the hive to unload, just like the player.

Nectar delivered to the hive is a spendable resource. Each player or helper respawn costs one nectar. Every five nectar collected in total unlocks another helper; its first spawn also costs one nectar. Extra helpers remain active if the bank drops, but after death they wait until the hive's current nectar reaches their five-nectar tier before spending one nectar to respawn.

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
- Mobile: on-screen multi-touch controls

## Developer launch controls

Unlock tuning with `?dev=hivelab`. Example:

```text
http://localhost:4174/?dev=hivelab&day=8&preset=chaos&enemies=3
```

Presets are `peaceful`, `forager`, `swarm`, and `chaos`. Feature switches are `wasps`, `dragonflies`, `spiders`, and `webs`. Balance controls are `flowers=0.5..3`, `enemies=0.25..3`, `capacity=1..8`, and `invincible=1`.

## Phone packaging

The game is responsive and installable as a Progressive Web App. It can also be wrapped for Android or iOS with Capacitor without changing the core game.

## License

MIT
