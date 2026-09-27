# Bee

`Bee` is a mobile-ready, top-down foraging game forked from the movement and scrolling foundation of Star Drift. Fly out from a central hive, find flower patches, slow down and land to gather nectar, then carry it safely home. A landed bee settles visibly into a flower or the hive and is sheltered from predators until it takes off.

The meadow becomes more dangerous each day. Wasps pursue the player, dragonflies make fast attack runs, spiders guard slowing webs, and flowers deplete and regrow. Combat is deliberately simple: reverse into a predator and the bee automatically extends its rear stinger. Two friendly hive guards patrol home, fight nearby enemies, take damage, and respawn from the hive if defeated.

The compact procedural soundscape uses a filtered, low-volume wing flutter plus soft puffs and bell-like meadow cues. It remains fully offline and adds no downloaded audio assets.

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
- Land/gather/unload: Space (slow down and hold near a flower or the hive)
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
