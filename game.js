(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const nectarEl = document.querySelector('#nectar');
const versionEl = document.querySelector('#version');
const BEE_VERSION = (typeof self !== 'undefined' && self.BEE_VERSION) || '0.1.0';
  const livesEl = document.querySelector('#lives');
  const dayEl = document.querySelector('#day');
const workerEl = document.querySelector('#worker-count');
  const hintEl = document.querySelector('#hint');
  const progressEl = document.querySelector('#action-progress');
  const progressFill = progressEl.querySelector('i');
  const progressText = progressEl.querySelector('span');
  const startPanel = document.querySelector('#start-panel');
  const overPanel = document.querySelector('#game-over-panel');
  const finalScoreEl = document.querySelector('#final-score');
  const newBestEl = document.querySelector('#new-best');
  const pauseButton = document.querySelector('#pause-button');
  const pauseLabel = document.querySelector('#pause-label');
  const devPanel = document.querySelector('#dev-panel');
  const devSummary = document.querySelector('#dev-summary');
  const landButton = document.querySelector('[data-control="land"]');
  const moveJoystick = document.querySelector('#move-joystick');
  const joystickRing = moveJoystick?.querySelector('.joystick-ring');
  const joystickKnob = moveJoystick?.querySelector('.joystick-knob');

  const TUNING = window.BEE_TUNING || {
    dev: { unlocked: false, startDay: 1, preset: 'standard' },
    features: { wasps: true, dragonflies: true, spiders: true, webs: true },
    balance: { flowers: 1, enemies: 1, nectarCapacity: 3, playerDamage: 1 }
  };
  const TAU = Math.PI * 2;
  const WORLD_RADIUS = 4800;
  const QUEEN_COST = 100;
  const HIVE_START_NECTAR = 3;
  const HIVE_HIT_RADIUS = 94;
  const FLOWER_TYPES = [
    { petal: '#fff6ef', core: '#f5b91d', petals: 7, name: 'daisy' },
    { petal: '#d780d4', core: '#ffd447', petals: 6, name: 'clover' },
    { petal: '#776ee6', core: '#ffe36e', petals: 5, name: 'bluebell' },
    { petal: '#ff8d7a', core: '#6d382c', petals: 8, name: 'poppy' },
    { petal: '#f2d355', core: '#a05a14', petals: 9, name: 'sun bloom' }
  ];

  const state = {
    width: 0, height: 0, dpr: 1, running: false, demo: false, paused: false, lastTime: 0, elapsed: 0,
    score: 0, totalNectar: 0, best: Number(localStorage.getItem('bee-best') || 0), lives: 3, day: 1,
    dayNectar: 0, dayGoal: 6, shake: 0, flash: 0, bee: null,
    flowers: [], flowerPatches: [], webs: [], spiders: [], wasps: [], dragonflies: [], workers: [], workerRespawns: [], workerTiersSpawned: [], particles: [],
    obstacles: [], worldMap: { cell: 500, cells: {} }, mapTimer: 0,
    colonies: [], hives: [], queens: [], nextColonyId: 1,
    camera: { x: 0, y: 0, vx: 0, vy: 0, zoom: 1, targetZoom: 1 },
    keys: { left: false, right: false, thrust: false, reverse: false, land: false },
    joystick: { active: false, pointerId: null, angle: 0, magnitude: 0 },
    waspTimer: 7, dragonflyTimer: 16, hintTimer: 0, reverseSerial: 0,
    actionTarget: null, landingTarget: null, actionTime: 0,
    audio: null, wingOsc: null, wingOsc2: null, wingGain: null, wingFilter: null, wingActive: false
  };

  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const worldToScreen = obj => ({ x: obj.x - state.camera.x, y: obj.y - state.camera.y });
  const worldToViewport = obj => {
    const p = worldToScreen(obj), zoom = state.camera.zoom;
    return { x: state.width / 2 + (p.x - state.width / 2) * zoom, y: state.height / 2 + (p.y - state.height / 2) * zoom };
  };
  const onScreen = (obj, margin = 80) => {
    const p = worldToScreen(obj);
    const zoom = state.camera.zoom, halfW = state.width / 2, halfH = state.height / 2;
    return p.x > halfW - (halfW + margin) / zoom && p.x < halfW + (halfW + margin) / zoom
      && p.y > halfH - (halfH + margin) / zoom && p.y < halfH + (halfH + margin) / zoom;
  };
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  if (TUNING.dev.unlocked) {
    const active = Object.entries(TUNING.features).filter(([, value]) => value).map(([key]) => key).join(' · ');
    devSummary.textContent = `DAY ${TUNING.dev.startDay} // ${TUNING.dev.preset.toUpperCase()} // ${active}`;
    devPanel.classList.add('visible');
  }

  function resize() {
    state.width = innerWidth;
    state.height = innerHeight;
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.bee && !state.running) centerCamera();
  }

  function makeBee() {
    return {
      x: 0, y: 116, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 17,
      nectar: 0, invulnerable: 2.2, wing: 0, bank: 0, landing: false, landed: false,
      sheltered: false, landScale: 1, reverseBurst: 0, wasReversing: false
    };
  }

  function colonyPalette(id) {
    if (id === 0) return { body: '#eeb51d', stripe: '#247887', accent: '#7fe3ea', dark: '#26332d', hive: '#d89117', hiveDark: '#79510c' };
    const hue = (38 + id * 79) % 360;
    return {
      body: `hsl(${hue} 70% 54%)`, stripe: `hsl(${(hue + 155) % 360} 55% 38%)`,
      accent: `hsl(${(hue + 155) % 360} 72% 68%)`, dark: `hsl(${hue} 32% 19%)`,
      hive: `hsl(${hue} 66% 46%)`, hiveDark: `hsl(${hue} 52% 27%)`
    };
  }

  function makeColony(id, x, y, parentId = null) {
    return {
      id, x, y, parentId, palette: colonyPalette(id), score: HIVE_START_NECTAR, totalNectar: 0,
      workerTiersSpawned: [], nextWorkerId: 2, foundedAt: state.elapsed, queensFounded: 0,
      alertTarget: null, alertTimer: 0, destroyed: false
    };
  }

  function colonyById(id) { return state.colonies.find(colony => colony.id === id) || state.colonies[0]; }
  function colonyBank(colony) { return colony.id === 0 ? state.score : colony.score; }
  function setColonyBank(colony, value) { if (colony.id === 0) state.score = value; else colony.score = value; }
  function colonyTotal(colony) { return colony.id === 0 ? state.totalNectar : colony.totalNectar; }
  function setColonyTotal(colony, value) { if (colony.id === 0) state.totalNectar = value; else colony.totalNectar = value; }
  function worldNectarTotal() { return state.colonies.reduce((sum, colony) => sum + colonyTotal(colony), 0); }
  function predatorHealth(base, step) { return base + Math.floor(worldNectarTotal() / step); }
  function raisePredatorHealth(enemy, target) {
    if (enemy.maxHealth >= target) return;
    enemy.health += target - enemy.maxHealth; enemy.maxHealth = target;
  }

  function makeWorker(id, tier = 0, colonyId = 0) {
    const colony = colonyById(colonyId);
    const angle = id * Math.PI;
    return {
      id, colonyId, x: colony.x + Math.cos(angle) * 92, y: colony.y + Math.sin(angle) * 92, vx: 0, vy: 0, angle,
      radius: 14, health: 3, maxHealth: 3, attackCooldown: random(.2, .7),
      hit: 0, wing: random(0, TAU), target: null, tier, nectar: 0, forageTarget: null,
      flowerMemory: [], exploreTarget: null, exploreStep: 0,
      actionTime: 0, landScale: 1, sheltered: false, role: 'alternate', stingAnim: 0, lastPlayerSting: -1
    };
  }

  function centerCamera() {
    if (!state.bee) return;
    state.camera.x = state.bee.x - state.width / 2;
    state.camera.y = state.bee.y - state.height / 2;
    state.camera.vx = 0;
    state.camera.vy = 0;
  }

  function randomMeadowPoint(minRadius = 360, maxRadius = WORLD_RADIUS - 180) {
    const angle = random(0, TAU);
    const radius = Math.sqrt(random(minRadius * minRadius, maxRadius * maxRadius));
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  function makeFlowerPatch(id) {
    let pos = randomMeadowPoint(470, WORLD_RADIUS - 420);
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidate = randomMeadowPoint(470, WORLD_RADIUS - 420);
      if (state.flowerPatches.every(patch => distance(candidate, patch) > patch.radius + 360)) { pos = candidate; break; }
    }
    return { id, ...pos, radius: random(175, 270), typeIndex: id % FLOWER_TYPES.length };
  }

  function makeFlower(index = 0, preferredPatch = null) {
    const patch = preferredPatch || state.flowerPatches[index % Math.max(1, state.flowerPatches.length)];
    if (!patch) {
      const pos = randomMeadowPoint(390, WORLD_RADIUS - 160);
      return { ...pos, patchId: null, type: FLOWER_TYPES[index % FLOWER_TYPES.length], size: random(18, 29), rotation: random(0, TAU), sway: random(0, TAU), nectar: 1, spent: false, discovered: false };
    }
    const angle = random(0, TAU), radius = Math.sqrt(Math.random()) * patch.radius;
    const pos = { x: patch.x + Math.cos(angle) * radius, y: patch.y + Math.sin(angle) * radius };
    const varied = Math.random() < .22 ? index % FLOWER_TYPES.length : patch.typeIndex;
    const type = FLOWER_TYPES[varied];
    return {
      ...pos, patchId: patch.id, type, size: random(18, 29), rotation: random(0, TAU), sway: random(0, TAU),
      nectar: 1, spent: false, discovered: false
    };
  }

  function rememberFlowerPatch(guard, patchId) {
    if (patchId == null || guard.flowerMemory.includes(patchId)) return false;
    guard.flowerMemory.push(patchId);
    return true;
  }

  function shareFlowerMemory(guard) {
    if (!guard?.flowerMemory?.length) return 0;
    let shared = 0;
    for (const worker of state.workers) {
      if (worker.health <= 0 || worker.colonyId !== guard.colonyId) continue;
      for (const patchId of guard.flowerMemory) if (rememberFlowerPatch(worker, patchId)) shared++;
    }
    return shared;
  }

  function exchangeFlowerMemory(first, second) {
    if (!first || !second || first.colonyId !== second.colonyId) return 0;
    const combined = [...new Set([...(first.flowerMemory || []), ...(second.flowerMemory || [])])];
    const learned = combined.length * 2 - (first.flowerMemory?.length || 0) - (second.flowerMemory?.length || 0);
    first.flowerMemory = [...combined]; second.flowerMemory = [...combined];
    return learned;
  }

  function chooseExploreTarget(guard, colony) {
    guard.exploreStep = (guard.exploreStep || 0) + 1;
    const unknown = state.flowerPatches.filter(patch => !guard.flowerMemory.includes(patch.id));
    if (unknown.length) {
      const patch = unknown[Math.abs(guard.id + guard.exploreStep * 3) % unknown.length];
      return { x: patch.x + random(-patch.radius * .45, patch.radius * .45), y: patch.y + random(-patch.radius * .45, patch.radius * .45) };
    }
    const angle = guard.id * 1.91 + guard.exploreStep * 2.17 + colony.id * .73;
    const radius = 520 + ((guard.id * 173 + guard.exploreStep * 337) % 2500);
    return {
      x: clamp(colony.x + Math.cos(angle) * radius, -WORLD_RADIUS + 180, WORLD_RADIUS - 180),
      y: clamp(colony.y + Math.sin(angle) * radius, -WORLD_RADIUS + 180, WORLD_RADIUS - 180)
    };
  }

  function makeWeb(pos = randomMeadowPoint(650, WORLD_RADIUS - 300)) {
    return { ...pos, radius: random(74, 118), rotation: random(0, TAU), glint: random(0, TAU), managed: true };
  }

  function makeSpider(web) {
    const health = predatorHealth(3, 35);
    return {
      x: web.x + random(-18, 18), y: web.y + random(-18, 18), homeX: web.x, homeY: web.y, webRadius: web.radius, web,
      species: 'spider', vx: 0, vy: 0, radius: 19, health, maxHealth: health, cooldown: random(0, 2), angle: random(0, TAU), phase: random(0, TAU)
    };
  }

  function tangledInWeb(point) {
    for (const web of state.webs) if (distance(point, web) < web.radius * .75) return web;
    return null;
  }

  function webWiggle(entity, web, dt, phase, damp) {
    const away = Math.atan2(entity.y - web.y, entity.x - web.x);
    const lateral = away + Math.PI / 2;
    const wobble = Math.sin(state.elapsed * 6 + phase) * .8;
    entity.vx += (Math.cos(away) + Math.cos(lateral) * wobble) * 22 * dt;
    entity.vy += (Math.sin(away) + Math.sin(lateral) * wobble) * 22 * dt;
    entity.vx *= Math.pow(damp, dt); entity.vy *= Math.pow(damp, dt);
  }

  function mapCell(x, y) {
    const size = state.worldMap.cell;
    const gx = Math.floor(x / size), gy = Math.floor(y / size);
    const key = gx + ':' + gy;
    let entry = state.worldMap.cells[key];
    if (!entry) { entry = { gx, gy, seen: false, features: [] }; state.worldMap.cells[key] = entry; }
    return entry;
  }

  function registerMapFeature(kind, x, y, radius) {
    mapCell(x, y).features.push({ kind, x, y, radius });
  }

  function updateWorldMap(dt) {
    state.mapTimer -= dt;
    if (state.mapTimer > 0) return;
    state.mapTimer = .25;
    mapCell(state.bee.x, state.bee.y).seen = true;
    for (const guard of state.workers) mapCell(guard.x, guard.y).seen = true;
    for (const queen of state.queens) mapCell(queen.x, queen.y).seen = true;
  }

  function growWeb(spider) {
    if (!spider.web) return;
    spider.web.kills = (spider.web.kills || 0) + 1;
    spider.web.radius = Math.min(240, spider.web.radius + 9);
    spider.webRadius = spider.web.radius;
  }

  function resolveObstacles(entity) {
    const body = entity.radius || 12;
    for (const obstacle of state.obstacles) {
      const dx = entity.x - obstacle.x, dy = entity.y - obstacle.y;
      const gap = Math.hypot(dx, dy);
      const min = obstacle.radius + body;
      if (gap >= min || gap < .001) continue;
      const nx = dx / gap, ny = dy / gap;
      entity.x = obstacle.x + nx * min;
      entity.y = obstacle.y + ny * min;
      const into = entity.vx * nx + entity.vy * ny;
      if (into < 0) { entity.vx -= into * nx; entity.vy -= into * ny; }
    }
  }

  function spawnWasp() {
    if (!TUNING.features.wasps || !state.bee) return null;
    const siegeHive = state.hives.length && Math.random() < .45 ? state.hives[Math.floor(Math.random() * state.hives.length)] : null;
    const anchor = siegeHive || state.bee;
    const angle = random(0, TAU);
    const radius = random(520, 760);
    const health = predatorHealth(4, 25);
    const wasp = {
      x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius,
      species: 'wasp', vx: 0, vy: 0, angle: angle + Math.PI, radius: 24, health,
      maxHealth: health, phase: random(0, TAU), hit: 0, lastSting: -1,
      siegeTargetId: siegeHive?.id ?? null, hiveAttackCooldown: random(.2, .8)
    };
    state.wasps.push(wasp);
    showHint('⚠ WASP IN THE MEADOW', 2.4);
    soundAlert(240);
    return wasp;
  }

  function spawnDragonfly() {
    if (!TUNING.features.dragonflies || !state.bee) return null;
    const angle = random(0, TAU);
    const radius = random(900, 1300);
    const health = predatorHealth(2, 50);
    const dragonfly = {
      x: state.bee.x + Math.cos(angle) * radius, y: state.bee.y + Math.sin(angle) * radius,
      vx: -Math.cos(angle) * 220, vy: -Math.sin(angle) * 220, angle: angle + Math.PI,
      species: 'dragonfly', radius: 25, health, maxHealth: health, phase: random(0, TAU), swoop: random(1.8, 3.2), hit: 0, lastSting: -1,
      sated: false, leaving: 0, gone: false
    };
    state.dragonflies.push(dragonfly);
    showHint('⚠ DRAGONFLY SWOOP', 2.4);
    soundAlert(130);
    return dragonfly;
  }

  function populateMeadow() {
    state.flowers = [];
    state.flowerPatches = [];
    const patchCount = Math.max(8, Math.round(11 * Math.sqrt(TUNING.balance.flowers)));
    for (let i = 0; i < patchCount; i++) state.flowerPatches.push(makeFlowerPatch(i));
    const flowerCount = Math.round(62 * TUNING.balance.flowers);
    for (let i = 0; i < flowerCount; i++) state.flowers.push(makeFlower(i));
    state.webs = [];
    state.spiders = [];
    state.obstacles = [];
    state.worldMap = { cell: 500, cells: {} };
    state.mapTimer = 0;
    if (TUNING.features.webs || TUNING.features.spiders) {
      const count = TUNING.features.webs ? 13 : 8;
      for (let i = 0; i < count; i++) {
        const web = makeWeb();
        if (TUNING.features.webs) state.webs.push(web);
        if (TUNING.features.spiders && (i % 2 === 0 || !TUNING.features.webs)) state.spiders.push(makeSpider(web));
      }
    }
    for (const web of state.webs) registerMapFeature('web', web.x, web.y, web.radius);
    for (const patch of state.flowerPatches) registerMapFeature('flowerbed', patch.x, patch.y, patch.radius);
    for (let i = 0; i < 14; i++) {
      const kind = Math.random() < .45 ? 'tree' : 'bush';
      const spot = randomMeadowPoint(520, WORLD_RADIUS - 220);
      const radius = kind === 'tree' ? random(30, 44) : random(24, 36);
      state.obstacles.push({ x: spot.x, y: spot.y, radius, kind, sway: random(0, TAU) });
      registerMapFeature(kind, spot.x, spot.y, radius);
    }
    for (const hive of state.hives) registerMapFeature('hive', hive.x, hive.y, 110);
  }

  function clearControls() {
    for (const key of Object.keys(state.keys)) state.keys[key] = false;
    for (const button of document.querySelectorAll('[data-control]')) button.classList.remove('active');
    resetJoystick();
  }

  function resetSession(demo) {
    clearControls();
    state.demo = demo; state.running = !demo; state.paused = false; state.elapsed = 0;
    state.score = HIVE_START_NECTAR; state.totalNectar = 0; state.lives = 3;
    state.day = TUNING.dev.startDay; state.dayNectar = 0; state.dayGoal = 4 + state.day * 2;
    state.wasps = []; state.dragonflies = []; state.particles = [];
    state.colonies = [makeColony(0, 0, 0)]; state.hives = [state.colonies[0]]; state.queens = []; state.nextColonyId = 1;
    state.workers = [makeWorker(0, 0, 0), makeWorker(1, 0, 0)]; state.workerRespawns = []; state.workerTiersSpawned = [];
    state.bee = makeBee(); state.actionTarget = null; state.landingTarget = null; state.actionTime = 0; state.reverseSerial = 0;
    state.camera.zoom = 1; state.camera.targetZoom = 1;
    state.waspTimer = random(7, 11) / TUNING.balance.enemies;
    state.dragonflyTimer = random(16, 23) / TUNING.balance.enemies;
    populateMeadow(); centerCamera();
    if (TUNING.dev.unlocked && TUNING.dev.startNectar > 0) bankNectar(TUNING.dev.startNectar, false);
    state.flowerTimer = TUNING.balance.flowerSpawn;
    startPanel.classList.toggle('visible', demo); overPanel.classList.remove('visible'); pauseLabel.classList.remove('visible');
    progressEl.classList.remove('visible'); hintEl.classList.remove('visible');
    if (!demo) { showHint('FOLLOW THE FLOWER MARKERS', 3.5); soundDay(); }
    updateHud(); state.lastTime = performance.now();
  }

  function beginGame() {
    unlockAudio();
    resetSession(false);
  }

  function beginDemo() {
    updateWingSound(false);
    resetSession(true);
  }

  function nextDay() {
    state.day++;
    state.dayNectar = 0;
    state.dayGoal = 4 + state.day * 2;
    for (let i = 0; i < Math.min(4, Math.ceil(state.day / 3)); i++) state.flowers.push(makeFlower(state.flowers.length + i));
    state.wasps.push(...[]);
    showHint(`DAY ${state.day} · THE MEADOW IS BUSIER`, 3.2);
    state.bee.invulnerable = Math.max(state.bee.invulnerable, 1.2);
    soundDay(); updateHud();
  }

  function showHint(text, duration = 2) {
    hintEl.textContent = text;
    hintEl.classList.add('visible');
    state.hintTimer = duration;
  }

  function updateHud() {
    scoreEl.textContent = String(state.score).padStart(3, '0');
    const capacity = TUNING.balance.nectarCapacity;
    nectarEl.textContent = Array.from({ length: capacity }, (_, i) => i < (state.bee?.nectar || 0) ? '●' : '○').join(' ');
  if (versionEl) versionEl.textContent = 'v' + BEE_VERSION;
    livesEl.textContent = '♥'.repeat(Math.max(0, state.lives));
    livesEl.setAttribute('aria-label', `${state.lives} lives`);
    const highestWorkerTier = state.workerTiersSpawned.length ? Math.max(...state.workerTiersSpawned) : 0;
    const availableWorkers = 2 + Math.max(highestWorkerTier, Math.floor(state.score / 5));
    dayEl.textContent = `DAY ${String(state.day).padStart(2, '0')} · GOAL ${state.dayNectar}/${state.dayGoal}`;
    const homeWorkers = state.workers.filter(guard => guard.colonyId === 0).length;
    if (workerEl) workerEl.textContent = `${homeWorkers}/${availableWorkers}`;
  }

  function spawnUnlockedWorkers(colony = state.colonies[0]) {
    const unlocked = Math.floor(colonyBank(colony) / 5);
    const spawned = colony.id === 0 ? state.workerTiersSpawned : colony.workerTiersSpawned;
    for (let tier = 1; tier <= unlocked; tier++) {
      if (spawned.includes(tier) || colonyBank(colony) <= 1) continue;
      setColonyBank(colony, colonyBank(colony) - 1);
      spawned.push(tier);
      const id = colony.id === 0 ? tier + 1 : colony.id * 10000 + colony.nextWorkerId++;
      state.workers.push(makeWorker(id, tier, colony.id));
      burst(colony.x, colony.y, colony.palette.accent, 20, 120);
      if (colony.id === 0) showHint(`NEW WORKER BEE · ${tier * 5} STORED NECTAR`, 2.2);
      soundGuardReturn();
    }
  }

  function bankColonyNectar(colony, amount, announce = false) {
    if (amount <= 0) return;
    setColonyBank(colony, colonyBank(colony) + amount);
    setColonyTotal(colony, colonyTotal(colony) + amount);
    if (colony.id === 0) state.dayNectar += amount;
    spawnUnlockedWorkers(colony);
    maybeLaunchQueen(colony);
    if (announce && colony.id === 0) showHint(`DELIVERED ${amount} NECTAR`, 1.5);
    if (colony.id === 0 && state.dayNectar >= state.dayGoal) nextDay();
    updateHud();
  }

  function bankNectar(amount, announce = true) { bankColonyNectar(state.colonies[0], amount, announce); }

  function rewardColony(colony, amount, announce = false) {
    setColonyBank(colony, colonyBank(colony) + amount);
    spawnUnlockedWorkers(colony);
    if (announce && colony.id === 0) showHint(`+${amount} NECTAR`, .8);
    maybeLaunchQueen(colony);
    updateHud();
  }

  function rewardKill(enemy, colonyId = 0) {
    if (enemy.rewarded) return;
    enemy.rewarded = true;
    const colony = colonyById(colonyId);
    rewardColony(colony, 2, colony.id === 0);
    burst(enemy.x, enemy.y, '#ffd83f', 14, 130);
  }

  function chooseQueenSite(colony) {
    let fallback = randomMeadowPoint(900, WORLD_RADIUS - 260);
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = random(0, TAU);
      const travel = random(1350, 2250);
      const candidate = { x: colony.x + Math.cos(angle) * travel, y: colony.y + Math.sin(angle) * travel };
      const radius = Math.hypot(candidate.x, candidate.y);
      if (radius > WORLD_RADIUS - 260) continue;
      if (state.hives.some(hive => distance(candidate, hive) < 1100)) continue;
      if (state.obstacles.some(obstacle => distance(candidate, obstacle) < obstacle.radius + 180)) continue;
      fallback = candidate;
      if (!mapCell(candidate.x, candidate.y).seen) return candidate;
    }
    return fallback;
  }

  function maybeLaunchQueen(colony) {
    if (!colony || colony.destroyed || colonyBank(colony) < QUEEN_COST + HIVE_START_NECTAR || state.queens.some(queen => queen.sourceColonyId === colony.id)) return null;
    setColonyBank(colony, colonyBank(colony) - QUEEN_COST);
    const destination = chooseQueenSite(colony);
    const futureId = state.nextColonyId++;
    const queen = {
      id: futureId, sourceColonyId: colony.id, x: colony.x, y: colony.y - 58, vx: 0, vy: 0,
      targetX: destination.x, targetY: destination.y, angle: -Math.PI / 2, radius: 22,
      wing: random(0, TAU), palette: colonyPalette(futureId), founded: false
    };
    state.queens.push(queen);
    colony.queensFounded++;
    burst(colony.x, colony.y, colony.palette.accent, 32, 155);
    if (colony.id === 0) showHint('QUEEN LAUNCHED · 100 NECTAR · NEW HIVE BOUND', 3);
    soundDay(); updateHud();
    return queen;
  }

  function foundColony(queen) {
    const colony = makeColony(queen.id, queen.targetX, queen.targetY, queen.sourceColonyId);
    state.colonies.push(colony); state.hives.push(colony);
    state.workers.push(makeWorker(colony.id * 10000, 0, colony.id), makeWorker(colony.id * 10000 + 1, 0, colony.id));
    registerMapFeature('hive', colony.x, colony.y, 110);
    burst(colony.x, colony.y, colony.palette.accent, 42, 180);
    showHint(`A NEW RIVAL HIVE HAS BEEN FOUNDED · COLONY ${colony.id + 1}`, 3.2);
    soundGuardReturn(); updateHud();
    queen.founded = true;
    return colony;
  }

  function destroyColony(colony) {
    if (!colony || colony.destroyed) return false;
    colony.destroyed = true; colony.alertTarget = null; colony.alertTimer = 0;
    burst(colony.x, colony.y, colony.palette.hive, 58, 230);
    for (const guard of state.workers) if (guard.colonyId === colony.id) guard.health = 0;
    state.workers = state.workers.filter(guard => guard.colonyId !== colony.id);
    state.workerRespawns = state.workerRespawns.filter(respawn => respawn.colonyId !== colony.id);
    state.queens = state.queens.filter(queen => queen.sourceColonyId !== colony.id);
    state.hives = state.hives.filter(hive => hive.id !== colony.id);
    for (const cell of Object.values(state.worldMap.cells)) {
      cell.features = cell.features.filter(feature => !(feature.kind === 'hive' && distance(feature, colony) < 2));
    }
    for (const wasp of state.wasps) if (wasp.siegeTargetId === colony.id) wasp.siegeTargetId = null;
    soundEnemyDown();
    if (colony.id === 0) {
      showHint('THE HOME HIVE HAS FALLEN', 3);
      if (state.demo) resetSession(true); else gameOver();
    } else {
      state.colonies = state.colonies.filter(candidate => candidate.id !== colony.id);
      showHint(`RIVAL HIVE ${colony.id + 1} HAS FALLEN`, 2.4);
    }
    updateHud();
    return true;
  }

  function attackHive(hive, attacker, stealingColony = null) {
    if (!hive || hive.destroyed || colonyBank(hive) <= 0) return false;
    setColonyBank(hive, Math.max(0, colonyBank(hive) - 1));
    hive.alertTarget = attacker; hive.alertTimer = 9;
    if (stealingColony && !stealingColony.destroyed && stealingColony.id !== hive.id) rewardColony(stealingColony, 1, stealingColony.id === 0);
    burst(hive.x, hive.y, hive.palette.accent, 18, 125); soundHit();
    if (hive.id === 0) {
      state.shake = Math.max(state.shake, 11);
      showHint(`HIVE UNDER ATTACK · ${colonyBank(hive)} NECTAR LEFT`, 1.5);
      soundAlert(170);
    }
    updateHud();
    if (colonyBank(hive) <= 0) destroyColony(hive);
    return true;
  }

  function chooseRaidHive(guard, colony) {
    const roster = state.workers.filter(worker => worker.health > 0 && worker.colonyId === colony.id);
    if (colony.destroyed || colonyBank(colony) < 8 || roster.length < 3 || guard.role === 'guard') return null;
    const remembered = new Set(roster.flatMap(worker => worker.flowerMemory || []));
    const safeFlowers = state.flowers.filter(flower => !flower.spent && remembered.has(flower.patchId) && !tangledInWeb(flower)).length;
    const forageScore = safeFlowers ? 2.5 + Math.min(4, safeFlowers * .3) : .8;
    let bestHive = null, bestScore = -Infinity;
    for (const target of state.hives) {
      if (target.id === colony.id || target.destroyed || colonyBank(target) <= 0) continue;
      const defenders = state.workers.filter(worker => worker.health > 0 && worker.colonyId === target.id).length;
      const travel = distance(guard, target) / 1100;
      const reserve = colonyBank(colony) - HIVE_START_NECTAR;
      const finishBonus = colonyBank(target) <= HIVE_START_NECTAR ? 4.5 : 0;
      const raidScore = colonyBank(target) * .55 + reserve * .22 + finishBonus - defenders * .8 - travel;
      if (raidScore > forageScore && raidScore > bestScore) { bestScore = raidScore; bestHive = target; }
    }
    return bestHive;
  }

  function updateQueens(dt) {
    for (const queen of state.queens) {
      queen.wing += dt * 38;
      const desired = Math.atan2(queen.targetY - queen.y, queen.targetX - queen.x);
      queen.angle += angleDelta(queen.angle, desired) * Math.min(1, dt * 3.8);
      queen.vx += Math.cos(queen.angle) * 185 * dt * 2.8;
      queen.vy += Math.sin(queen.angle) * 185 * dt * 2.8;
      queen.vx *= Math.pow(.12, dt); queen.vy *= Math.pow(.12, dt);
      queen.x += queen.vx * dt; queen.y += queen.vy * dt;
      resolveObstacles(queen);
      if (Math.hypot(queen.targetX - queen.x, queen.targetY - queen.y) < 42) foundColony(queen);
    }
    state.queens = state.queens.filter(queen => !queen.founded);
  }

  function killWorker(guard) {
    if (guard.dead) return;
    guard.dead = true;
    guard.flowerMemory = []; guard.forageTarget = null; guard.exploreTarget = null;
    burst(guard.x, guard.y, '#78d1db', 22, 165);
    state.workerRespawns.push({ id: guard.id, tier: guard.tier, colonyId: guard.colonyId, timer: 4.5, notified: false });
    soundGuardDown();
  }

  function dragonflyEat(dragon) {
    const canBitePlayer = state.bee.invulnerable <= 0 && !state.bee.sheltered && Boolean(TUNING.balance.playerDamage);
    resolveEnemyContact(dragon, state.dragonflies, 99);
    if (canBitePlayer && state.bee.invulnerable > 0) return true;
    const reach = dragon.radius + 4;
    for (const guard of state.workers) {
      if (guard.health > 0 && distance(dragon, guard) < reach + guard.radius) { guard.health = 0; killWorker(guard); return true; }
    }
    for (const enemy of [...state.wasps, ...state.spiders]) {
      if (enemy.health > 0 && distance(dragon, enemy) < reach + enemy.radius) { enemy.health = 0; return true; }
    }
    return false;
  }

  function waspAttackDamage(wasp, target) {
    const towardTargetX = target.x - wasp.x, towardTargetY = target.y - wasp.y;
    const forwardDot = towardTargetX * Math.cos(wasp.angle) + towardTargetY * Math.sin(wasp.angle);
    return forwardDot >= 0 ? 1 : 2;
  }

  function edgePressure(value, size, zone, inset) {
    const ramp = Math.max(1, zone - inset);
    if (value < zone) return -clamp((zone - value) / ramp, 0, 1);
    if (value > size - zone) return clamp((value - (size - zone)) / ramp, 0, 1);
    return 0;
  }

  function setZoom(value, announce = false) {
    state.camera.targetZoom = clamp(value, .68, 1.6);
    if (announce) showHint(`ZOOM ${Math.round(state.camera.targetZoom * 100)}%`, .8);
    return state.camera.targetZoom;
  }

  function updateCamera(dt) {
    const bee = state.bee;
    const oldZoom = state.camera.zoom;
    const nextZoom = oldZoom + (state.camera.targetZoom - oldZoom) * (1 - Math.exp(-11 * dt));
    if (Math.abs(nextZoom - oldZoom) > .00001) {
      const centerX = state.camera.x + state.width / 2, centerY = state.camera.y + state.height / 2;
      state.camera.x = bee.x - (bee.x - centerX) * oldZoom / nextZoom - state.width / 2;
      state.camera.y = bee.y - (bee.y - centerY) * oldZoom / nextZoom - state.height / 2;
      state.camera.zoom = nextZoom;
    }
    const viewport = worldToViewport(bee);
    const screenX = viewport.x, screenY = viewport.y;
    const insetX = clamp(state.width * .14, 76, 142);
    const insetY = clamp(state.height * .15, 68, 118);
    const zoneX = clamp(state.width * .35, 130, 330);
    const zoneY = clamp(state.height * .34, 108, 250);
    const px = edgePressure(screenX, state.width, zoneX, insetX);
    const py = edgePressure(screenY, state.height, zoneY, insetY);
    const accelerating = (state.keys.thrust || state.keys.reverse || state.joystick.magnitude > .08) && !bee.landing;
    const targetX = accelerating && Math.sign(bee.vx) === Math.sign(px) ? bee.vx * Math.pow(Math.abs(px), 1.15) * 2.25 : 0;
    const targetY = accelerating && Math.sign(bee.vy) === Math.sign(py) ? bee.vy * Math.pow(Math.abs(py), 1.15) * 2.25 : 0;
    const response = 1 - Math.exp(-(accelerating ? 11 : 4.6) * dt);
    state.camera.vx += (targetX - state.camera.vx) * response;
    state.camera.vy += (targetY - state.camera.vy) * response;
    state.camera.x += state.camera.vx * dt;
    state.camera.y += state.camera.vy * dt;

    const position = worldToViewport(bee), zoom = state.camera.zoom;
    if (position.x < insetX) state.camera.x += (position.x - insetX) / zoom;
    if (position.x > state.width - insetX) state.camera.x += (position.x - (state.width - insetX)) / zoom;
    if (position.y < insetY) state.camera.y += (position.y - insetY) / zoom;
    if (position.y > state.height - insetY) state.camera.y += (position.y - (state.height - insetY)) / zoom;
  }

  function updateBee(dt) {
    const bee = state.bee;
    bee.invulnerable = Math.max(0, bee.invulnerable - dt);
    bee.reverseBurst = Math.max(0, bee.reverseBurst - dt);
    bee.wing += dt * (state.keys.thrust || state.keys.reverse || state.joystick.magnitude > .08 ? 38 : 21);
    bee.landing = state.keys.land;
    if (state.keys.reverse && !bee.wasReversing && !bee.landing) {
      bee.reverseBurst = .48;
      state.reverseSerial++;
      const rearX = bee.x - Math.cos(bee.angle) * 27;
      const rearY = bee.y - Math.sin(bee.angle) * 27;
      burst(rearX, rearY, '#fff1a0', 6, 55);
      soundReverseBurst();
    }
    bee.wasReversing = state.keys.reverse;
    let turn = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
    if (state.joystick.active && state.joystick.magnitude > .08) {
      turn = clamp(angleDelta(bee.angle, state.joystick.angle) * 1.8, -1, 1);
    }
    const speed = Math.hypot(bee.vx, bee.vy);
    const beeWeb = tangledInWeb(bee);
    bee.tangled = Boolean(beeWeb);
    bee.angle += turn * (2.7 + Math.min(speed, 180) / 170) * dt * (beeWeb ? .28 : 1);
    const reversePower = bee.reverseBurst > 0 ? 1.18 : .76;
    const joystickDrive = state.joystick.active && state.joystick.magnitude > .08 ? state.joystick.magnitude : 0;
    const drive = !bee.landing ? (state.keys.reverse ? -reversePower : joystickDrive || (state.keys.thrust ? 1 : 0)) : 0;
    if (drive !== 0) {
      const thrust = 245 * drive;
      bee.vx += Math.cos(bee.angle) * thrust * dt;
      bee.vy += Math.sin(bee.angle) * thrust * dt;
      emitWingDust(bee);
    }
    const drag = Math.pow(bee.landing ? .08 : drive !== 0 ? .76 : .42, dt);
    bee.vx *= drag; bee.vy *= drag;
    const baseMaxSpeed = bee.nectar ? 245 - bee.nectar * 9 : 250;
    const maxSpeed = bee.reverseBurst > 0 ? baseMaxSpeed * 1.14 : baseMaxSpeed;
    const nowSpeed = Math.hypot(bee.vx, bee.vy);
    if (nowSpeed > maxSpeed) { bee.vx *= maxSpeed / nowSpeed; bee.vy *= maxSpeed / nowSpeed; }

    if (beeWeb) {
      webWiggle(bee, beeWeb, dt, 0, .14);
      if (Math.random() < dt * 2) showHint('TANGLED! KEEP MOVING TO BREAK FREE', 1.2);
    }

    bee.x += bee.vx * dt; bee.y += bee.vy * dt;
    resolveObstacles(bee);
    const fromCenter = Math.hypot(bee.x, bee.y);
    if (fromCenter > WORLD_RADIUS) {
      const nx = bee.x / fromCenter, ny = bee.y / fromCenter;
      bee.x = nx * WORLD_RADIUS; bee.y = ny * WORLD_RADIUS;
      bee.vx -= nx * 110; bee.vy -= ny * 110;
      showHint('THE HEDGE IS TOO THICK — TURN BACK', 1.6);
    }
    updateCamera(dt);
    updateLanding(dt);
    updateWingSound(drive !== 0 && !bee.landing);
  }

  function updateDemoAI() {
    if (!state.demo || !state.bee) return;
    const bee = state.bee;
    state.keys.left = false; state.keys.right = false; state.keys.thrust = false;
    state.keys.reverse = false; state.keys.land = false;
    const enemies = [...state.wasps, ...state.dragonflies, ...state.spiders].filter(enemy => enemy.health > 0);
    let threat = null, threatDistance = Infinity;
    for (const enemy of enemies) {
      const d = distance(bee, enemy);
      if (d < threatDistance) { threatDistance = d; threat = enemy; }
    }

    let target, targetKind;
    if (threat && threatDistance < 205) {
      target = threat; targetKind = 'enemy';
    } else if (bee.nectar >= TUNING.balance.nectarCapacity) {
      target = { x: 0, y: 0 }; targetKind = 'hive';
    } else {
      const flowers = state.flowers.filter(flower => !flower.spent);
      target = flowers.sort((a, b) => distance(bee, a) - distance(bee, b))[0] || { x: 0, y: 0 };
      targetKind = target.type ? 'flower' : 'hive';
    }

    const toTarget = Math.atan2(target.y - bee.y, target.x - bee.x);
    const desiredAngle = targetKind === 'enemy' ? toTarget + Math.PI : toTarget;
    const turnError = angleDelta(bee.angle, desiredAngle);
    state.keys.left = turnError < -.055;
    state.keys.right = turnError > .055;
    const d = distance(bee, target), speed = Math.hypot(bee.vx, bee.vy);

    if (targetKind === 'enemy') {
      state.keys.reverse = Math.abs(turnError) < .42 && d < 185;
      state.keys.thrust = !state.keys.reverse && d > 125 && Math.abs(turnError) < .7;
      return;
    }

    const landingRange = targetKind === 'hive' ? 108 : target.size + 36;
    if (d < landingRange + 75) {
      if (speed > 48) state.keys.reverse = Math.abs(turnError) < .58;
      else if (d < landingRange) state.keys.land = true;
      else state.keys.thrust = Math.abs(turnError) < .42;
    } else {
      state.keys.thrust = Math.abs(turnError) < .72;
    }
  }

  function landingCandidate() {
    const bee = state.bee;
    const speed = Math.hypot(bee.vx, bee.vy);
    if (speed > 68) return null;
    if (distance(bee, { x: 0, y: 0 }) < 120) return { kind: 'hive', x: 0, y: 0 };
    if (bee.nectar >= TUNING.balance.nectarCapacity) return null;
    let closest = null;
    for (const flower of state.flowers) {
      if (flower.spent) continue;
      const d = distance(bee, flower);
      if (d < flower.size + 42 && (!closest || d < closest.distance)) closest = { kind: 'flower', flower, distance: d, x: flower.x, y: flower.y };
    }
    return closest;
  }

  function nearbyLandingSite() {
    const bee = state.bee;
    if (distance(bee, { x: 0, y: 0 }) < 145) return { kind: 'hive', x: 0, y: 0 };
    let closest = null;
    for (const flower of state.flowers) {
      if (flower.spent) continue;
      const d = distance(bee, flower);
      if (d < flower.size + 54 && (!closest || d < closest.distance)) closest = { kind: 'flower', flower, distance: d, x: flower.x, y: flower.y };
    }
    return closest;
  }

  function toggleLandingMode() {
    if (!state.running) return;
    if (state.keys.land) {
      state.keys.land = false; state.landingTarget = null; state.actionTarget = null; state.actionTime = 0;
      progressEl.classList.remove('visible'); landButton?.classList.remove('active');
      showHint('AIRBORNE', .7); soundLand();
      return;
    }
    const site = nearbyLandingSite();
    if (!site) { showHint('MOVE CLOSER TO A FLOWER OR THE HIVE', 1.1); return; }
    state.keys.land = true; state.landingTarget = site; landButton?.classList.add('active');
    showHint(Math.hypot(state.bee.vx, state.bee.vy) > 68 ? 'SLOWING TO LAND' : 'LANDING', .8);
  }

  function updateLanding(dt) {
    if (!state.keys.land) state.landingTarget = null;
    const freshTarget = state.keys.land ? landingCandidate() : null;
    if (!state.landingTarget && freshTarget) state.landingTarget = freshTarget;
    const target = state.keys.land ? state.landingTarget : null;
    const settled = Boolean(target && Math.hypot(state.bee.vx, state.bee.vy) <= 68);
    state.bee.landed = settled;
    state.bee.sheltered = Boolean(settled && (target.kind === 'flower' || target.kind === 'hive'));
    const targetScale = settled ? .68 : 1;
    state.bee.landScale += (targetScale - state.bee.landScale) * (1 - Math.exp(-10 * dt));
    if (!target) {
      state.actionTarget = null; state.actionTime = 0; progressEl.classList.remove('visible');
      if (state.keys.land && Math.hypot(state.bee.vx, state.bee.vy) > 68) showHint('SLOW DOWN TO LAND', .7);
      else if (state.keys.land && state.bee.nectar >= TUNING.balance.nectarCapacity) showHint('NECTAR FULL — RETURN TO THE HIVE', 1);
      return;
    }
    if (!settled) {
      state.bee.vx *= Math.pow(.035, dt); state.bee.vy *= Math.pow(.035, dt);
      progressEl.classList.add('visible'); progressFill.style.width = '30%'; progressText.textContent = 'SLOWING TO LAND';
      return;
    }
    if (target.kind === 'flower' && target.flower.spent) {
      state.actionTarget = target; state.actionTime = 0;
      progressEl.classList.add('visible'); progressFill.style.width = '100%'; progressText.textContent = 'SAFE IN THE FLOWER · SPACE TO LAUNCH';
      return;
    }
    const same = state.actionTarget && state.actionTarget.kind === target.kind && (target.kind === 'hive' || state.actionTarget.flower === target.flower);
    if (!same) { state.actionTarget = target; state.actionTime = 0; soundLand(); }
    state.bee.vx *= Math.pow(.04, dt); state.bee.vy *= Math.pow(.04, dt);
    const needed = target.kind === 'hive' ? .75 : 1.05;
    if (target.kind === 'hive' && state.bee.nectar === 0) {
      state.actionTime = 0;
      progressEl.classList.add('visible'); progressFill.style.width = '100%'; progressText.textContent = 'SAFE AT THE HIVE · SPACE TO LAUNCH';
      return;
    }
    state.actionTime += dt;
    progressEl.classList.add('visible');
    progressFill.style.width = `${clamp(state.actionTime / needed, 0, 1) * 100}%`;
    progressText.textContent = target.kind === 'hive' ? 'UNLOADING NECTAR' : 'GATHERING NECTAR';
    if (state.actionTime < needed) return;

    if (target.kind === 'flower') {
      target.flower.spent = true;
      target.flower.nectar = 0;
      state.bee.nectar++;
      burst(target.flower.x, target.flower.y, target.flower.type.petal, 12, 70);
      showHint(state.bee.nectar >= TUNING.balance.nectarCapacity ? 'FULL! RETURN TO THE HIVE' : 'NECTAR COLLECTED', 1.3);
      soundCollect();
    } else {
      const delivered = state.bee.nectar;
      state.bee.nectar = 0;
      burst(0, 0, '#ffd62f', 22, 115);
      bankNectar(delivered);
      soundDeposit();
    }
    state.actionTarget = null; state.actionTime = 0; progressEl.classList.remove('visible'); updateHud();
  }

  function resolveEnemyContact(enemy, collection, points) {
    const bodyContact = distance(enemy, state.bee) < enemy.radius + state.bee.radius;
    const stinger = {
      x: state.bee.x - Math.cos(state.bee.angle) * 35,
      y: state.bee.y - Math.sin(state.bee.angle) * 35
    };
    const stingerContact = state.keys.reverse && !state.bee.landing && distance(enemy, stinger) < enemy.radius + 11;
    if (!bodyContact && !stingerContact) return;
    if (state.bee.sheltered) {
      const away = Math.atan2(enemy.y - state.bee.y, enemy.x - state.bee.x);
      enemy.vx = (enemy.vx || 0) + Math.cos(away) * 55;
      enemy.vy = (enemy.vy || 0) + Math.sin(away) * 55;
      return;
    }
    if (stingerContact && enemy.lastSting !== state.reverseSerial) {
      enemy.lastSting = state.reverseSerial;
      enemy.health--; enemy.hit = .18;
      const angle = Math.atan2(enemy.y - state.bee.y, enemy.x - state.bee.x);
      enemy.vx = (enemy.vx || 0) + Math.cos(angle) * 145;
      enemy.vy = (enemy.vy || 0) + Math.sin(angle) * 145;
      state.bee.vx -= Math.cos(angle) * 42; state.bee.vy -= Math.sin(angle) * 42;
      burst((enemy.x + state.bee.x) / 2, (enemy.y + state.bee.y) / 2, '#ffd83f', 10, 110);
      soundHit();
      if (enemy.health <= 0) {
        burst(enemy.x, enemy.y, collection === state.spiders ? '#5d4031' : '#e9ad24', 24, 180);
        soundEnemyDown();
        rewardKill(enemy);
      }
      return;
    }
    if (enemy.health > 0) damageBee(enemy.x, enemy.y, points);
  }

  function updateEnemies(dt) {
    for (const spider of state.spiders) if (spider.web) spider.web.owned = true;
    state.waspTimer -= dt;
    state.dragonflyTimer -= dt;
    const nectar = worldNectarTotal();
    for (const wasp of state.wasps) if (wasp.species === 'wasp') raisePredatorHealth(wasp, predatorHealth(4, 25));
    for (const spider of state.spiders) if (spider.species === 'spider') raisePredatorHealth(spider, predatorHealth(3, 35));
    for (const dragon of state.dragonflies) if (dragon.species === 'dragonfly') raisePredatorHealth(dragon, predatorHealth(2, 50));
    const maxWasps = Math.min(10, TUNING.balance.enemyBaseline + Math.floor(nectar / TUNING.balance.enemyNectarStep));
    if (state.waspTimer <= 0 && state.wasps.length < maxWasps) {
      spawnWasp();
      state.waspTimer = random(8, 13) / (TUNING.balance.enemies * (1 + nectar * .02));
    }
    const maxDragonflies = Math.min(4, Math.floor(nectar / TUNING.balance.dragonflyNectarStep));
    if (state.dragonflyTimer <= 0 && state.dragonflies.length < maxDragonflies) {
      spawnDragonfly();
      state.dragonflyTimer = random(12, 30) / (TUNING.balance.enemies * (1 + nectar * .04));
    }

    const chaseables = [];
    if (!state.bee.sheltered) chaseables.push(state.bee);
    for (const guard of state.workers) if (!guard.sheltered) chaseables.push(guard);
    const nearestChaseable = from => {
      let target = null, best = Infinity;
      for (const candidate of chaseables) { const d = distance(from, candidate); if (d < best) { best = d; target = candidate; } }
      return target;
    };

    for (const wasp of state.wasps) {
      wasp.hit = Math.max(0, wasp.hit - dt);
      wasp.hiveAttackCooldown = (wasp.hiveAttackCooldown ?? 0) - dt;
      wasp.phase += dt * 7;
      const waspWeb = tangledInWeb(wasp);
      wasp.tangled = Boolean(waspWeb);
      const hiveTarget = state.hives.find(hive => hive.id === wasp.siegeTargetId && !hive.destroyed) || null;
      const waspTarget = hiveTarget || nearestChaseable(wasp);
      if (waspTarget && !waspWeb) {
        const desired = Math.atan2(waspTarget.y - wasp.y, waspTarget.x - wasp.x) + Math.sin(wasp.phase) * .28;
        wasp.angle += angleDelta(wasp.angle, desired) * Math.min(1, dt * 3.5);
        const speed = 105 + state.day * 3;
        wasp.vx += Math.cos(wasp.angle) * speed * dt * 2.2;
        wasp.vy += Math.sin(wasp.angle) * speed * dt * 2.2;
      }
      if (waspWeb) webWiggle(wasp, waspWeb, dt, wasp.phase, .06);
      else { wasp.vx *= Math.pow(.14, dt); wasp.vy *= Math.pow(.14, dt); }
      wasp.x += wasp.vx * dt; wasp.y += wasp.vy * dt;
      resolveObstacles(wasp);
      if (hiveTarget && !waspWeb && distance(wasp, hiveTarget) < HIVE_HIT_RADIUS + wasp.radius) {
        if (wasp.hiveAttackCooldown <= 0) {
          wasp.hiveAttackCooldown = 1.15;
          const hitHive = attackHive(hiveTarget, wasp);
          const away = Math.atan2(wasp.y - hiveTarget.y, wasp.x - hiveTarget.x);
          wasp.vx += Math.cos(away) * 115; wasp.vy += Math.sin(away) * 115;
          if (hitHive && hiveTarget.destroyed && hiveTarget.id === 0) return;
        }
      }
      resolveEnemyContact(wasp, state.wasps, waspAttackDamage(wasp, state.bee));
    }

    for (const dragon of state.dragonflies) {
      dragon.hit = Math.max(0, dragon.hit - dt);
      dragon.phase += dt * 18;
      const dragonWeb = tangledInWeb(dragon);
      dragon.tangled = Boolean(dragonWeb);
      const preyPool = [];
      if (!state.bee.sheltered) preyPool.push(state.bee);
      for (const guard of state.workers) if (guard.health > 0 && !guard.sheltered) preyPool.push(guard);
      for (const enemy of [...state.wasps, ...state.spiders]) if (enemy.health > 0) preyPool.push(enemy);
      let dragonTarget = null, dragonTargetDistance = Infinity;
      for (const candidate of preyPool) {
        const d = distance(dragon, candidate);
        if (d < dragonTargetDistance) { dragonTargetDistance = d; dragonTarget = candidate; }
      }
      dragonTarget = dragonTarget || { x: 0, y: 0 };

      if (dragon.sated) {
        const away = Math.atan2(dragon.y - dragonTarget.y, dragon.x - dragonTarget.x);
        dragon.vx += Math.cos(away) * 520 * dt;
        dragon.vy += Math.sin(away) * 520 * dt;
        dragon.vx *= Math.pow(.5, dt); dragon.vy *= Math.pow(.5, dt);
        dragon.angle = Math.atan2(dragon.vy, dragon.vx);
        dragon.x += dragon.vx * dt; dragon.y += dragon.vy * dt;
        resolveObstacles(dragon);
        dragon.leaving += dt;
        if (distance(dragon, dragonTarget) > 1400 || dragon.leaving > 6) dragon.gone = true;
        continue;
      }

      dragon.swoop -= dt;
      if (dragon.swoop <= 0 && !dragonWeb) {
        const aim = Math.atan2(dragonTarget.y - dragon.y, dragonTarget.x - dragon.x);
        dragon.vx = Math.cos(aim) * (400 + state.day * 4);
        dragon.vy = Math.sin(aim) * (400 + state.day * 4);
        dragon.swoop = random(2.2, 3.6);
        soundSwoop();
      } else if (dragonWeb) {
        webWiggle(dragon, dragonWeb, dt, dragon.phase, .06);
      } else {
        dragon.vx *= Math.pow(.84, dt); dragon.vy *= Math.pow(.84, dt);
      }
      const dragonFacing = Math.atan2(dragon.vy, dragon.vx);
      dragon.angle = dragonWeb
        ? dragon.angle + angleDelta(dragon.angle, dragonFacing) * Math.min(1, dt * 1.6)
        : dragonFacing;
      dragon.x += dragon.vx * dt; dragon.y += dragon.vy * dt;
      resolveObstacles(dragon);

      const ate = !dragonWeb && dragonflyEat(dragon);
      if (ate) {
        dragon.sated = true;
        burst(dragon.x, dragon.y, '#d94b31', 24, 170); soundEnemyDown();
      } else if (!dragonWeb && distance(dragon, dragonTarget) > 1500) {
        const angle = random(0, TAU);
        dragon.x = dragonTarget.x + Math.cos(angle) * 820; dragon.y = dragonTarget.y + Math.sin(angle) * 820;
      }
    }

    for (const spider of state.spiders) {
      spider.cooldown -= dt; spider.phase += dt * 4;
      const catchRadius = (spider.webRadius || 90) * .8;
      const home = { x: spider.homeX, y: spider.homeY };
      const caught = [];
      for (const enemy of [...state.wasps, ...state.dragonflies]) {
        if (enemy.health > 0 && enemy.tangled) caught.push(enemy);
      }
      for (const guard of state.workers) {
        if (guard.health > 0 && guard.tangled) caught.push(guard);
      }
      if (state.bee.tangled && !state.bee.sheltered) caught.push(state.bee);
      let prey = null, preyDistance = Infinity;
      for (const target of caught) {
        if (distance(target, home) >= catchRadius) continue;
        const spiderDistance = distance(spider, target);
        if (spiderDistance < preyDistance) { preyDistance = spiderDistance; prey = target; }
      }
      if (prey) {
        const angle = Math.atan2(prey.y - spider.y, prey.x - spider.x);
        spider.vx += Math.cos(angle) * 150 * dt * 3; spider.vy += Math.sin(angle) * 150 * dt * 3;
        if (distance(spider, prey) < spider.radius + prey.radius + 4 && spider.cooldown <= 0) {
          spider.cooldown = .9;
          burst(prey.x, prey.y, '#7ad0c0', 9, 80);
          if (prey === state.bee) {
            if (damageBee(spider.x, spider.y, 1)) growWeb(spider);
          } else {
            prey.health--; prey.hit = .2;
            if (prey.health <= 0) {
              growWeb(spider);
              if (state.workers.includes(prey)) killWorker(prey);
              else { burst(prey.x, prey.y, '#5d4031', 18, 140); soundEnemyDown(); }
            }
          }
        }
      } else {
        const spiderTarget = nearestChaseable(spider);
        if (spiderTarget && distance(spider, spiderTarget) < 260 && spider.cooldown <= 0) {
          const angle = Math.atan2(spiderTarget.y - spider.y, spiderTarget.x - spider.x);
          spider.vx += Math.cos(angle) * 290; spider.vy += Math.sin(angle) * 290; spider.cooldown = 2.4;
        }
      }
      const homeAngle = Math.atan2(spider.homeY - spider.y, spider.homeX - spider.x);
      if (distance(spider, { x: spider.homeX, y: spider.homeY }) > 140) {
        spider.vx += Math.cos(homeAngle) * 100 * dt; spider.vy += Math.sin(homeAngle) * 100 * dt;
      }
      spider.vx *= Math.pow(.11, dt); spider.vy *= Math.pow(.11, dt);
      spider.x += spider.vx * dt; spider.y += spider.vy * dt;
      resolveObstacles(spider);
      spider.angle = Math.atan2(spider.vy || Math.sin(spider.phase), spider.vx || Math.cos(spider.phase));
      resolveEnemyContact(spider, state.spiders, 1);
    }
    state.wasps = state.wasps.filter(enemy => enemy.health > 0);
    state.dragonflies = state.dragonflies.filter(enemy => enemy.health > 0 && !enemy.gone);
    state.spiders = state.spiders.filter(enemy => enemy.health > 0);
    state.webs = state.webs.filter(web => state.spiders.some(spider => spider.web === web && spider.health > 0) || (!web.managed && !web.owned));
  }

  function updateWorkers(dt) {
    const enemies = [...state.wasps, ...state.dragonflies, ...state.spiders].filter(enemy => enemy.health > 0);
    const deposits = new Map();
    const workersBefore = state.workers.length;
    const roles = new Map();
    for (const colony of state.colonies) {
      colony.alertTimer = Math.max(0, (colony.alertTimer || 0) - dt);
      if (!colony.alertTarget || colony.alertTarget.health <= 0 || colony.alertTimer <= 0) colony.alertTarget = null;
      const roster = state.workers.filter(guard => guard.health > 0 && guard.colonyId === colony.id).sort((a, b) => a.id - b.id);
      if (roster[0]) roles.set(roster[0], 'forage');
      if (roster[1]) roles.set(roster[1], 'guard');
      for (const guard of roster.slice(2)) roles.set(guard, 'alternate');
    }
    for (let i = 0; i < state.workers.length; i++) {
      const first = state.workers[i];
      if (first.health <= 0) continue;
      for (let j = i + 1; j < state.workers.length; j++) {
        const second = state.workers[j];
        if (second.health <= 0 || first.colonyId !== second.colonyId) continue;
        if (distance(first, second) > first.radius + second.radius + 7) continue;
        if (exchangeFlowerMemory(first, second) > 0) {
          const colony = colonyById(first.colonyId);
          burst((first.x + second.x) / 2, (first.y + second.y) / 2, colony.palette.accent, 5, 42);
        }
      }
    }
    for (const guard of [...state.workers]) {
      if (guard.health <= 0) continue;
      const colony = colonyById(guard.colonyId), hive = colony;
      guard.role = roles.get(guard) || 'alternate';
      guard.hit = Math.max(0, guard.hit - dt); guard.attackCooldown -= dt; guard.wing += dt * 32;
      for (const flower of state.flowers) {
        if (!flower.spent && flower.nectar > 0 && distance(guard, flower) < 220) rememberFlowerPatch(guard, flower.patchId);
      }
      if (distance(guard, hive) < 128) shareFlowerMemory(guard);
      const alerted = colony.alertTarget && colony.alertTimer > 0 ? colony.alertTarget : null;
      let target = alerted, targetKind = alerted ? (state.workers.includes(alerted) ? 'rival' : 'enemy') : 'patrol', best = alerted ? 0 : Infinity;
      for (const enemy of enemies) {
        const hiveDistance = distance(enemy, hive), guardDistance = distance(guard, enemy);
        if ((hiveDistance < 520 || guardDistance < 235) && guardDistance < best) { best = guardDistance; target = enemy; targetKind = 'enemy'; }
      }
      const rivalBees = state.workers.filter(other => other !== guard && other.health > 0 && other.colonyId !== guard.colonyId && !other.sheltered);
      if (guard.colonyId !== 0 && !state.bee.sheltered) rivalBees.push(state.bee);
      for (const rival of rivalBees) {
        const hiveDistance = distance(rival, hive), guardDistance = distance(guard, rival);
        if ((hiveDistance < 620 || guardDistance < 285) && guardDistance < best) { best = guardDistance; target = rival; targetKind = 'rival'; }
      }
      let goalX, goalY, speed, arrival = 0;
      if (targetKind === 'enemy' || targetKind === 'rival') {
        goalX = target.x; goalY = target.y; speed = 180;
      } else if (guard.nectar > 0) {
        target = hive; targetKind = 'hive'; goalX = hive.x; goalY = hive.y; speed = 150; arrival = 92;
      } else {
        const raidHive = chooseRaidHive(guard, colony);
        const shouldForage = guard.role === 'forage' ? true
          : guard.role === 'guard' ? false
          : Boolean(guard.forageTarget) || Math.sin(state.elapsed * .32 + guard.id * 1.7) > -.15;
        if (guard.forageTarget && (guard.forageTarget.spent || guard.forageTarget.nectar <= 0)) guard.forageTarget = null;
        if (raidHive) {
          target = raidHive; targetKind = 'hiveRaid'; goalX = target.x; goalY = target.y; speed = 172; arrival = 0;
        } else if (shouldForage && !guard.forageTarget) {
          const flowers = state.flowers.filter(flower => !flower.spent && flower.nectar > 0 && !tangledInWeb(flower)
            && (guard.flowerMemory.includes(flower.patchId) || distance(guard, flower) < 240));
          guard.forageTarget = flowers.sort((a, b) => distance(guard, a) - distance(guard, b))[0] || null;
        }
        if (raidHive) {
          // Raid movement was selected above.
        } else if (shouldForage && guard.forageTarget) {
          target = guard.forageTarget; targetKind = 'flower'; goalX = target.x; goalY = target.y; speed = 138; arrival = target.size + 24;
        } else if (shouldForage) {
          if (!guard.exploreTarget || distance(guard, guard.exploreTarget) < 105) guard.exploreTarget = chooseExploreTarget(guard, colony);
          target = guard.exploreTarget; targetKind = 'explore'; goalX = target.x; goalY = target.y; speed = 132; arrival = 0;
        } else {
          const patrol = state.elapsed * .62 + guard.id * Math.PI;
          goalX = hive.x + Math.cos(patrol) * (112 + guard.tier * 9);
          goalY = hive.y + Math.sin(patrol) * (82 + guard.tier * 7); speed = 115;
        }
      }
      guard.target = target;
      const retro = targetKind === 'enemy' || targetKind === 'rival' || targetKind === 'hiveRaid';
      const desired = retro ? Math.atan2(guard.y - target.y, guard.x - target.x) : Math.atan2(goalY - guard.y, goalX - guard.x);
      const goalDistance = Math.hypot(goalX - guard.x, goalY - guard.y);
      const landed = arrival > 0 && goalDistance < arrival && Math.hypot(guard.vx, guard.vy) < 70;
      const guardWeb = landed ? null : tangledInWeb(guard);
      guard.tangled = Boolean(guardWeb);
      guard.angle += angleDelta(guard.angle, desired) * Math.min(1, dt * (guardWeb ? 3 : 6));
      guard.sheltered = landed;
      guard.stingAnim += ((retro && !landed ? 1 : 0) - guard.stingAnim) * (1 - Math.exp(-14 * dt));
      guard.landScale += ((landed ? .68 : 1) - guard.landScale) * (1 - Math.exp(-10 * dt));
      if (landed) {
        guard.vx *= Math.pow(.04, dt); guard.vy *= Math.pow(.04, dt); guard.actionTime += dt;
        if (targetKind === 'flower' && guard.actionTime >= 1.05) {
          rememberFlowerPatch(guard, target.patchId);
          target.spent = true; target.nectar = 0; guard.nectar = 1; guard.forageTarget = null; guard.actionTime = 0;
          burst(target.x, target.y, target.type.petal, 12, 70); soundCollect();
        } else if (targetKind === 'hive' && guard.actionTime >= .75) {
          guard.nectar = 0; deposits.set(colony.id, (deposits.get(colony.id) || 0) + 1); guard.actionTime = 0;
          shareFlowerMemory(guard);
          burst(hive.x, hive.y, colony.palette.accent, 7, 70);
        }
      } else if (guardWeb) {
        guard.actionTime = 0; webWiggle(guard, guardWeb, dt, guard.id, .06);
      } else {
        guard.actionTime = 0;
        const ease = retro ? Math.max(0, Math.min(1, (goalDistance - 66) / 44)) : (arrival > 0 ? Math.min(1, goalDistance / (arrival * 3)) : 1);
        guard.vx += Math.cos(guard.angle) * speed * ease * dt * 3 * (retro ? -1 : 1);
        guard.vy += Math.sin(guard.angle) * speed * ease * dt * 3 * (retro ? -1 : 1);
        guard.vx *= Math.pow(.05, dt); guard.vy *= Math.pow(.05, dt);
      }
      guard.x += guard.vx * dt; guard.y += guard.vy * dt; resolveObstacles(guard);
      if (retro && target && guard.attackCooldown <= 0 && guard.health > 0) {
        const stinger = { x: guard.x - Math.cos(guard.angle) * 35, y: guard.y - Math.sin(guard.angle) * 35 };
        if (targetKind === 'hiveRaid' && distance(stinger, target) < HIVE_HIT_RADIUS + 11) {
          guard.attackCooldown = .9; guard.stingAnim = 1;
          const struck = attackHive(target, guard, colony);
          const away = Math.atan2(guard.y - target.y, guard.x - target.x);
          guard.vx += Math.cos(away) * 95; guard.vy += Math.sin(away) * 95;
          if (struck && target.destroyed && target.id === 0) return;
        } else if (targetKind !== 'hiveRaid' && distance(stinger, target) < target.radius + 11) {
          guard.attackCooldown = .72; guard.stingAnim = 1;
          const angle = Math.atan2(target.y - guard.y, target.x - guard.x);
          if (target === state.bee) {
            if (damageBee(guard.x, guard.y, 1)) rewardColony(colony, 1);
          } else {
            target.health--; target.hit = .16;
            target.vx = (target.vx || 0) + Math.cos(angle) * 145; target.vy = (target.vy || 0) + Math.sin(angle) * 145;
            if (target.health <= 0) {
              if (targetKind === 'rival') { killWorker(target); rewardColony(colony, 1); }
              else { burst(target.x, target.y, '#e9ad24', 20, 160); soundEnemyDown(); rewardKill(target, colony.id); }
            }
          }
          burst((guard.x + target.x) / 2, (guard.y + target.y) / 2, colony.palette.accent, 10, 110); soundHit();
        } else if (target !== state.bee && distance(guard, target) < guard.radius + target.radius + 3) {
          const contactDamage = target.species === 'wasp' ? waspAttackDamage(target, guard) : 1;
          guard.attackCooldown = .72; guard.health -= contactDamage; guard.hit = .22;
          burst(guard.x, guard.y, colony.palette.accent, 10, 110); soundHit();
          if (guard.health <= 0) killWorker(guard);
        }
      }
    }

    if (state.keys.reverse && !state.bee.landing && !state.bee.sheltered) {
      const stinger = { x: state.bee.x - Math.cos(state.bee.angle) * 35, y: state.bee.y - Math.sin(state.bee.angle) * 35 };
      for (const rival of state.workers) {
        if (rival.colonyId === 0 || rival.health <= 0 || rival.sheltered || rival.lastPlayerSting === state.reverseSerial) continue;
        if (distance(stinger, rival) >= rival.radius + 11) continue;
        rival.lastPlayerSting = state.reverseSerial; rival.health--; rival.hit = .18;
        burst((rival.x + state.bee.x) / 2, (rival.y + state.bee.y) / 2, '#ffd83f', 10, 110); soundHit();
        if (rival.health <= 0) { killWorker(rival); rewardColony(state.colonies[0], 1, true); }
      }
    }

    state.workers = state.workers.filter(guard => guard.health > 0);
    if (state.workers.length !== workersBefore) updateHud();
    for (const [colonyId, amount] of deposits) bankColonyNectar(colonyById(colonyId), amount, false);
    if (deposits.size) soundDeposit();
    for (const respawn of state.workerRespawns) {
      respawn.timer -= dt;
      if (respawn.timer <= 0) {
        const colony = colonyById(respawn.colonyId ?? 0);
        const requirement = respawn.tier > 0 ? respawn.tier * 5 : 1;
        if (colonyBank(colony) >= requirement && colonyBank(colony) > 1) {
          setColonyBank(colony, colonyBank(colony) - 1);
          state.workers.push(makeWorker(respawn.id, respawn.tier, colony.id)); burst(colony.x, colony.y, colony.palette.accent, 16, 105);
          if (colony.id === 0) showHint(`${respawn.tier > 0 ? 'WORKER' : 'HIVE GUARD'} RESPAWNED · 1 NECTAR`, 1.6);
          soundGuardReturn(); respawn.done = true; updateHud();
        } else if (!respawn.notified && colony.id === 0) {
          const need = respawn.tier > 0 ? `${requirement} STORED NECTAR` : '1 STORED NECTAR';
          showHint(`BEE WAITING TO RESPAWN · NEED ${need}`, 2); respawn.notified = true;
        }
      }
    }
    state.workerRespawns = state.workerRespawns.filter(respawn => !respawn.done);
    state.wasps = state.wasps.filter(enemy => enemy.health > 0);
    state.dragonflies = state.dragonflies.filter(enemy => enemy.health > 0);
    state.spiders = state.spiders.filter(enemy => enemy.health > 0);
  }

  function updateFlowers(dt) {
    state.flowerTimer -= dt;
    if (state.flowerTimer <= 0) {
      state.flowerTimer = TUNING.balance.flowerSpawn;
      if (state.flowers.length < 110) {
        const activeCounts = new Map(state.flowerPatches.map(patch => [patch.id, 0]));
        for (const flower of state.flowers) if (!flower.spent && activeCounts.has(flower.patchId)) activeCounts.set(flower.patchId, activeCounts.get(flower.patchId) + 1);
        const sparsePatches = [...state.flowerPatches].sort((a, b) => activeCounts.get(a.id) - activeCounts.get(b.id)).slice(0, 3);
        const patch = sparsePatches[Math.floor(Math.random() * sparsePatches.length)] || null;
        state.flowers.push(makeFlower(state.flowers.length, patch));
      }
    }
    const bees = [state.bee, ...state.workers];
    state.flowers = state.flowers.filter(flower => {
      flower.sway += dt * .8;
      if (distance(flower, state.bee) < 170) flower.discovered = true;
      if (!flower.spent) return true;
      return bees.some(bee => bee && Math.hypot(bee.x - flower.x, bee.y - flower.y) < 70);
    });
  }

  function damageBee(fromX, fromY, points = 1) {
    if (!TUNING.balance.playerDamage || state.bee.invulnerable > 0 || state.bee.sheltered) return false;
    state.bee.invulnerable = 2;
    state.lives = Math.max(0, state.lives - points);
    const angle = Math.atan2(state.bee.y - fromY, state.bee.x - fromX);
    state.bee.vx = Math.cos(angle) * 230; state.bee.vy = Math.sin(angle) * 230;
    state.bee.nectar = Math.max(0, state.bee.nectar - 1);
    state.shake = 14; state.flash = .3;
    burst(state.bee.x, state.bee.y, '#f5b51e', 28, 200); soundHurt(); updateHud();
    const killed = state.lives <= 0;
    if (killed) {
      if (state.score > 1) {
        state.score--;
        state.lives = 3; state.bee = makeBee(); state.landingTarget = null; state.actionTarget = null;
        centerCamera(); burst(0, 116, '#ffe56f', 24, 130);
        showHint('RESPAWNED FROM THE HIVE · 1 NECTAR', 2); soundGuardReturn(); updateHud();
      } else if (state.demo) beginDemo();
      else gameOver();
    }
    else showHint('OUCH! YOU DROPPED SOME NECTAR', 1.7);
    return killed;
  }

  function gameOver() {
    state.running = false; updateWingSound(false);
    finalScoreEl.textContent = state.totalNectar;
    const record = state.totalNectar > state.best;
    if (record) { state.best = state.totalNectar; localStorage.setItem('bee-best', String(state.best)); }
    newBestEl.classList.toggle('visible', record);
    overPanel.classList.add('visible'); progressEl.classList.remove('visible');
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU), velocity = random(speed * .2, speed);
      state.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: random(.35, .9), maxLife: .9, size: random(2, 6), color });
    }
  }

  function emitWingDust(bee) {
    if (Math.random() > .36) return;
    state.particles.push({ x: bee.x - Math.cos(bee.angle) * 13 + random(-6, 6), y: bee.y - Math.sin(bee.angle) * 13 + random(-6, 6), vx: -Math.cos(bee.angle) * 25 + random(-12, 12), vy: -Math.sin(bee.angle) * 25 + random(-12, 12), life: .3, maxLife: .3, size: random(1, 3), color: '#f8e898' });
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.12, dt); particle.vy *= Math.pow(.12, dt); particle.life -= dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
  }

  function update(dt) {
    state.elapsed += dt;
    state.hintTimer -= dt;
    if (state.hintTimer <= 0) hintEl.classList.remove('visible');
    state.flash = Math.max(0, state.flash - dt); state.shake *= Math.pow(.035, dt);
    updateFlowers(dt); updateBee(dt); updateQueens(dt); updateEnemies(dt); updateWorkers(dt); updateParticles(dt); updateWorldMap(dt);
  }

  function drawGroundBase() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, '#67ad55'); gradient.addColorStop(1, '#4d9648');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawGround() {
    const cell = 74;
    const halfWorldWidth = state.width / (2 * state.camera.zoom), halfWorldHeight = state.height / (2 * state.camera.zoom);
    const centerX = state.camera.x + state.width / 2, centerY = state.camera.y + state.height / 2;
    const minX = Math.floor((centerX - halfWorldWidth) / cell) - 1;
    const maxX = Math.ceil((centerX + halfWorldWidth) / cell) + 1;
    const minY = Math.floor((centerY - halfWorldHeight) / cell) - 1;
    const maxY = Math.ceil((centerY + halfWorldHeight) / cell) + 1;
    ctx.lineCap = 'round';
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gy = minY; gy <= maxY; gy++) {
        const h = hash(gx, gy);
        const x = gx * cell + h * 54 - state.camera.x;
        const y = gy * cell + hash(gy, gx) * 54 - state.camera.y;
        ctx.strokeStyle = h > .5 ? 'rgba(37,104,48,.32)' : 'rgba(121,188,80,.32)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.quadraticCurveTo(x - 2, y + 1, x + (h - .5) * 8, y - 6); ctx.stroke();
        if (h > .82) {
          ctx.fillStyle = 'rgba(249,238,156,.48)';
          ctx.beginPath(); ctx.arc(x + 10, y + 7, 2.2, 0, TAU); ctx.fill();
        }
      }
    }
    const center = worldToScreen({ x: 0, y: 0 });
    const edge = WORLD_RADIUS;
    ctx.save(); ctx.translate(center.x, center.y); ctx.strokeStyle = '#285b31'; ctx.lineWidth = 90;
    ctx.setLineDash([38, 14]); ctx.beginPath(); ctx.arc(0, 0, edge + 40, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function drawHive(hive) {
    const p = worldToScreen(hive);
    if (p.x < -160 || p.x > state.width + 160 || p.y < -160 || p.y > state.height + 160) return;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(38,70,28,.18)'; ctx.beginPath(); ctx.ellipse(0, 20, 112, 76, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#70500e'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0, -78); ctx.lineTo(0, -110); ctx.stroke();
    ctx.fillStyle = hive.palette.hive; ctx.strokeStyle = hive.palette.hiveDark; ctx.lineWidth = 5;
    const tiers = [[-70, 70], [-55, 88], [-35, 100], [-12, 106], [13, 100], [35, 86], [55, 66]];
    for (const [y, width] of tiers) { ctx.beginPath(); ctx.roundRect(-width, y - 13, width * 2, 27, 13); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#39250d'; ctx.beginPath(); ctx.ellipse(0, 50, 26, 20, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = hive.palette.accent; ctx.font = '800 13px "Nunito"'; ctx.textAlign = 'center';
    ctx.fillText(hive.id === 0 ? 'HOME' : `HIVE ${hive.id + 1}`, 0, 91);
    ctx.fillStyle = 'rgba(39,48,28,.72)'; ctx.beginPath(); ctx.roundRect(-37, 98, 74, 18, 8); ctx.fill();
    ctx.fillStyle = '#fff3a5'; ctx.font = '800 9px "Nunito"'; ctx.fillText(`${colonyBank(hive)} NECTAR`, 0, 110);
    if (hive.alertTimer > 0) {
      ctx.strokeStyle = `rgba(255,93,55,${.45 + Math.sin(state.elapsed * 12) * .25})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 5, 126 + Math.sin(state.elapsed * 8) * 6, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacle(obstacle) {
    if (!onScreen(obstacle, obstacle.radius + 40)) return;
    const p = worldToScreen(obstacle);
    ctx.save(); ctx.translate(p.x, p.y);
    const r = obstacle.radius;
    const shadow = ctx.createRadialGradient(r * .18, r * .38, 2, r * .18, r * .38, r * 1.15);
    shadow.addColorStop(0, 'rgba(24,53,22,.34)'); shadow.addColorStop(1, 'rgba(24,53,22,0)');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(r * .16, r * .38, r * 1.15, r * .53, 0, 0, TAU); ctx.fill();
    if (obstacle.kind === 'tree') {
      const trunk = ctx.createLinearGradient(-r * .15, 0, r * .18, 0);
      trunk.addColorStop(0, '#3d2815'); trunk.addColorStop(.42, '#8a5b2b'); trunk.addColorStop(.68, '#a77438'); trunk.addColorStop(1, '#422a16');
      ctx.fillStyle = trunk; ctx.strokeStyle = '#3b2817'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-r * .15, -r * .2, r * .3, r * .92, 5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(49,29,13,.38)'; ctx.lineWidth = 1.4;
      for (let y = -.08; y < .58; y += .18) { ctx.beginPath(); ctx.moveTo(-r * .1, r * y); ctx.lineTo(r * .1, r * (y + .07)); ctx.stroke(); }
    }
    const sway = Math.sin(state.elapsed * .7 + obstacle.sway) * 3;
    const lobes = obstacle.kind === 'tree'
      ? [[0,-.78,.68],[-.48,-.61,.48],[.5,-.58,.48],[-.2,-1.08,.45],[.28,-1.03,.42]]
      : [[0,-.35,.67],[-.5,-.22,.48],[.5,-.2,.5],[-.25,-.62,.44],[.28,-.58,.46]];
    for (let i = 0; i < lobes.length; i++) {
      const [lx, ly, lr] = lobes[i], x = sway + lx * r, y = ly * r, radius = lr * r;
      const leaf = ctx.createRadialGradient(x - radius * .34, y - radius * .42, radius * .08, x, y, radius);
      if (obstacle.kind === 'tree') {
        leaf.addColorStop(0, i % 2 ? '#83c766' : '#9bd675'); leaf.addColorStop(.44, '#3d9147'); leaf.addColorStop(1, '#195c31');
      } else {
        leaf.addColorStop(0, i % 2 ? '#b2df7c' : '#d0eb93'); leaf.addColorStop(.46, '#63ad52'); leaf.addColorStop(1, '#2d753d');
      }
      ctx.fillStyle = leaf; ctx.strokeStyle = 'rgba(26,69,32,.48)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,210,.2)'; ctx.beginPath(); ctx.ellipse(x - radius * .28, y - radius * .34, radius * .2, radius * .09, -.55, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(15,65,31,.34)';
    for (let i = 0; i < 7; i++) {
      const a = obstacle.sway * 2.3 + i * 2.399, rr = r * (.18 + (i % 3) * .12);
      ctx.beginPath(); ctx.arc(sway + Math.cos(a) * rr, -r * .54 + Math.sin(a) * rr * .72, 1.5 + i % 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawFlower(flower) {
    if (!onScreen(flower, 50)) return;
    const p = worldToScreen(flower), wilt = flower.spent;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(flower.rotation + Math.sin(flower.sway) * .06); ctx.globalAlpha = wilt ? .42 : 1;
    ctx.strokeStyle = '#29663a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(8, 15, 4, 25); ctx.stroke();
    for (let i = 0; i < flower.type.petals; i++) {
      const angle = i / flower.type.petals * TAU;
      ctx.save(); ctx.rotate(angle); ctx.fillStyle = flower.type.petal; ctx.strokeStyle = 'rgba(90,60,44,.22)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(0, -flower.size * .62, flower.size * .29, flower.size * .57, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = wilt ? '#866d3b' : flower.type.core; ctx.beginPath(); ctx.arc(0, 0, flower.size * .3, 0, TAU); ctx.fill();
    if (!wilt) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(-flower.size * .09, -flower.size * .1, 2.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function drawWeb(web) {
    if (!onScreen(web, web.radius + 20)) return;
    const p = worldToScreen(web);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(web.rotation); ctx.strokeStyle = 'rgba(238,247,224,.56)'; ctx.lineWidth = 1.4;
    for (let ring = .25; ring <= 1; ring += .25) { ctx.beginPath(); ctx.arc(0, 0, web.radius * ring, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * web.radius, Math.sin(a) * web.radius); ctx.stroke(); }
    ctx.fillStyle = `rgba(255,255,255,${.35 + Math.sin(state.elapsed * 3 + web.glint) * .18})`; ctx.beginPath(); ctx.arc(-web.radius * .3, -web.radius * .25, 3, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawBee(bee) {
    const p = worldToScreen(bee);
    if (bee.invulnerable > 0 && Math.floor(bee.invulnerable * 10) % 2 === 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(bee.angle + Math.PI / 2); ctx.scale(bee.landScale, bee.landScale);
    const flap = Math.sin(bee.wing) * .35;
    ctx.fillStyle = 'rgba(224,248,247,.66)'; ctx.strokeStyle = 'rgba(83,117,105,.45)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-.5 - flap); ctx.beginPath(); ctx.ellipse(-15, -2, 11, 21, -.4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(.5 + flap); ctx.beginPath(); ctx.ellipse(15, -2, 11, 21, .4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#efb51d'; ctx.strokeStyle = '#302519'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 5, 13, 21, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#302519'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-11, 1); ctx.lineTo(11, 1); ctx.moveTo(-11, 11); ctx.lineTo(11, 11); ctx.stroke();
    ctx.fillStyle = '#3a2a1b'; ctx.beginPath(); ctx.arc(0, -13, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#302519'; ctx.beginPath(); ctx.moveTo(-4, 25); ctx.lineTo(0, state.keys.reverse && !bee.landing ? 43 : 31); ctx.lineTo(4, 25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#302519'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -20); ctx.quadraticCurveTo(-10, -29, -14, -27); ctx.moveTo(5, -20); ctx.quadraticCurveTo(10, -29, 14, -27); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4, -15, 2, 0, TAU); ctx.arc(4, -15, 2, 0, TAU); ctx.fill();
    if (bee.nectar) {
      for (let i = 0; i < bee.nectar; i++) { ctx.fillStyle = '#ffe560'; ctx.beginPath(); ctx.arc((i - (bee.nectar - 1) / 2) * 7, 23, 3, 0, TAU); ctx.fill(); }
    }
    if (state.keys.reverse && !bee.landing) { ctx.strokeStyle = 'rgba(255,238,101,.72)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 5, 29 + Math.sin(state.elapsed * 35) * 3, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  function drawWorker(guard) {
    if (!onScreen(guard, 45)) return;
    const p = worldToScreen(guard), palette = colonyById(guard.colonyId).palette;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(guard.angle + Math.PI / 2); ctx.scale(.82 * guard.landScale, .82 * guard.landScale);
    const flap = Math.sin(guard.wing) * .4;
    ctx.fillStyle = 'rgba(222,249,247,.76)'; ctx.strokeStyle = 'rgba(38,92,92,.5)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-.55 - flap); ctx.beginPath(); ctx.ellipse(-15, -1, 10, 20, -.4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(.55 + flap); ctx.beginPath(); ctx.ellipse(15, -1, 10, 20, .4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = guard.hit ? '#fff' : palette.body; ctx.strokeStyle = palette.dark; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 5, 13, 21, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = palette.stripe; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-11, 1); ctx.lineTo(11, 1); ctx.moveTo(-11, 11); ctx.lineTo(11, 11); ctx.stroke();
    ctx.fillStyle = palette.dark; ctx.beginPath(); ctx.arc(0, -13, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.arc(0, -14, 4, 0, TAU); ctx.fill();
    const stingLength = 31 + guard.stingAnim * (13 + Math.sin(state.elapsed * 28 + guard.id) * 2);
    ctx.fillStyle = palette.dark; ctx.beginPath(); ctx.moveTo(-4, 25); ctx.lineTo(0, stingLength); ctx.lineTo(4, 25); ctx.closePath(); ctx.fill();
    if (guard.stingAnim > .2) {
      ctx.globalAlpha = guard.stingAnim * .7; ctx.strokeStyle = palette.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 5, 28 + Math.sin(state.elapsed * 30 + guard.id) * 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.save(); ctx.translate(p.x, p.y - 27); ctx.fillStyle = 'rgba(25,53,44,.35)'; ctx.fillRect(-14, 0, 28, 3);
    ctx.fillStyle = palette.accent; ctx.fillRect(-14, 0, 28 * guard.health / guard.maxHealth, 3); ctx.restore();
  }

  function drawQueen(queen) {
    if (!onScreen(queen, 70)) return;
    const p = worldToScreen(queen), palette = queen.palette;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(queen.angle + Math.PI / 2); ctx.scale(1.15, 1.15);
    const flap = Math.sin(queen.wing) * .38;
    ctx.fillStyle = 'rgba(237,252,250,.76)'; ctx.strokeStyle = 'rgba(57,91,78,.5)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-.55 - flap); ctx.beginPath(); ctx.ellipse(-18, 0, 13, 27, -.45, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(.55 + flap); ctx.beginPath(); ctx.ellipse(18, 0, 13, 27, .45, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = palette.body; ctx.strokeStyle = palette.dark; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 9, 15, 29, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = palette.stripe; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-13, 3); ctx.lineTo(13, 3); ctx.moveTo(-12, 16); ctx.lineTo(12, 16); ctx.stroke();
    ctx.fillStyle = palette.dark; ctx.beginPath(); ctx.arc(0, -16, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe56b'; ctx.strokeStyle = '#8b6513'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-9, -25); ctx.lineTo(-6, -36); ctx.lineTo(0, -28); ctx.lineTo(6, -36); ctx.lineTo(9, -25); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(p.x, p.y - 42); ctx.fillStyle = 'rgba(37,45,28,.72)'; ctx.beginPath(); ctx.roundRect(-28, -9, 56, 18, 8); ctx.fill();
    ctx.fillStyle = '#fff4a6'; ctx.font = '800 9px "Nunito"'; ctx.textAlign = 'center'; ctx.fillText('QUEEN', 0, 3); ctx.restore();
  }

  function drawWasp(wasp) {
    if (!onScreen(wasp, 50)) return;
    const p = worldToScreen(wasp); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(wasp.angle + Math.PI / 2); ctx.scale(1.12, 1.12);
    const flash = wasp.hit ? '#fff' : '#f2ad18';
    ctx.fillStyle = 'rgba(222,239,222,.62)'; ctx.strokeStyle = 'rgba(50,68,52,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-41, -13); ctx.quadraticCurveTo(-34, 4, -7, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(41, -13); ctx.quadraticCurveTo(34, 4, 7, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#29201a'; ctx.beginPath(); ctx.ellipse(0, -15, 9, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = flash; ctx.strokeStyle = '#29201a'; ctx.lineWidth = 2.7;
    ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(-12, 1, -5, 7); ctx.lineTo(-9, 34); ctx.quadraticCurveTo(0, 51, 9, 34); ctx.lineTo(5, 7); ctx.quadraticCurveTo(12, 1, 7, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#29201a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.moveTo(-8, 23); ctx.lineTo(8, 23); ctx.moveTo(-7, 35); ctx.lineTo(7, 35); ctx.stroke();
    ctx.fillStyle = '#29201a'; ctx.beginPath(); ctx.moveTo(0, 68); ctx.lineTo(-4, 44); ctx.lineTo(4, 44); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#29201a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -21); ctx.lineTo(-14, -30); ctx.moveTo(5, -21); ctx.lineTo(14, -30); ctx.stroke();
    ctx.fillStyle = '#d94731'; ctx.beginPath(); ctx.ellipse(-4, -17, 2.8, 4, 0, 0, TAU); ctx.ellipse(4, -17, 2.8, 4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#29201a'; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(-5, -22); ctx.quadraticCurveTo(-12, -27, -8, -33);
    ctx.moveTo(5, -22); ctx.quadraticCurveTo(12, -27, 8, -33); ctx.stroke();
    ctx.restore();
  }

  function drawDragonfly(dragon) {
    if (!onScreen(dragon, 70)) return;
    const p = worldToScreen(dragon); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(dragon.angle + Math.PI / 2);
    const flap = Math.sin(dragon.phase) * .18;
    ctx.fillStyle = 'rgba(222,247,239,.63)'; ctx.strokeStyle = 'rgba(40,94,91,.55)'; ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) { ctx.save(); ctx.scale(side, 1); ctx.rotate(flap); ctx.beginPath(); ctx.ellipse(25, -4, 25, 7, -.25, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(22, 11, 22, 6, .25, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = dragon.hit ? '#fff' : '#2c8e83'; ctx.strokeStyle = '#153d3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 6, 8, 31, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#79c5bd'; ctx.beginPath(); ctx.arc(0, -22, 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9b3033'; ctx.beginPath(); ctx.arc(-5, -24, 3, 0, TAU); ctx.arc(5, -24, 3, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawSpider(spider) {
    if (!onScreen(spider, 55)) return;
    const p = worldToScreen(spider); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(spider.angle + Math.PI / 2); ctx.strokeStyle = '#3c2d28'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const y = -11 + i * 8; ctx.beginPath(); ctx.moveTo(side * 6, y); ctx.lineTo(side * (17 + i % 2 * 4), y + (i - 1.5) * 5); ctx.lineTo(side * 24, y + (i - 1.5) * 9); ctx.stroke(); }
    ctx.fillStyle = '#49332d'; ctx.beginPath(); ctx.ellipse(0, 8, 13, 17, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -8, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d94b31'; ctx.beginPath(); ctx.arc(-4, -11, 2, 0, TAU); ctx.arc(4, -11, 2, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      if (!onScreen(particle, 20)) continue;
      const p = worldToScreen(particle); ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(p.x, p.y, particle.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCompassMarker(target, color, symbol) {
    const p = worldToViewport(target), pad = 64;
    if (p.x > pad && p.x < state.width - pad && p.y > pad && p.y < state.height - pad) return;
    const cx = state.width / 2, cy = state.height / 2;
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const x = clamp(cx + Math.cos(angle) * state.width * .43, pad, state.width - pad);
    const y = clamp(cy + Math.sin(angle) * state.height * .39, pad + 30, state.height - pad);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color; ctx.strokeStyle = 'rgba(44,45,24,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.rotate(-angle); ctx.fillStyle = '#2c3824'; ctx.font = '800 10px "Nunito"'; ctx.textAlign = 'center'; ctx.fillText(symbol, 0, 25); ctx.restore();
  }

  function drawHomePointer() {
    const hive = { x: 0, y: 0 }, p = worldToViewport(hive), pad = 86;
    if (p.x > 80 && p.x < state.width - 80 && p.y > 110 && p.y < state.height - 80) return;
    const cx = state.width / 2, cy = state.height / 2;
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const x = clamp(cx + Math.cos(angle) * state.width * .43, pad, state.width - pad);
    const y = clamp(cy + Math.sin(angle) * state.height * .38, 128, state.height - pad);
    const metres = Math.max(10, Math.round(distance(state.bee, hive) / 10) * 10);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(50,48,22,.82)'; ctx.strokeStyle = '#ffe15b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-48, -22, 96, 44, 20); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(angle); ctx.fillStyle = '#ffe15b'; ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(12, -9); ctx.lineTo(15, 0); ctx.lineTo(12, 9); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff5b8'; ctx.font = '800 10px "Nunito"'; ctx.textAlign = 'center'; ctx.fillText('⌂ HOME', -8, -3);
    ctx.fillStyle = '#f1d56a'; ctx.font = '800 8px "Nunito"'; ctx.fillText(`${metres}m`, -8, 10); ctx.restore();
  }

  function drawMarkers() {
    drawHomePointer();
    for (const hive of state.hives) if (hive.id !== 0) drawCompassMarker(hive, hive.palette.accent, `RIVAL ${hive.id + 1}`);
    if (state.bee.nectar < TUNING.balance.nectarCapacity) {
      const flowers = state.flowers.filter(f => !f.spent).sort((a, b) => distance(state.bee, a) - distance(state.bee, b));
      for (const flower of flowers.slice(0, 2)) drawCompassMarker(flower, flower.type.petal, 'FLOWER');
    }
    for (const dragon of state.dragonflies) drawCompassMarker(dragon, '#d94b31', 'DANGER');
  }

  function render() {
    ctx.save();
    const shakeX = state.shake ? random(-state.shake, state.shake) : 0;
    const shakeY = state.shake ? random(-state.shake, state.shake) : 0;
    ctx.translate(shakeX, shakeY);
    drawGroundBase();
    ctx.save();
    ctx.translate(state.width / 2, state.height / 2);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.width / 2, -state.height / 2);
    drawGround();
    for (const web of state.webs) drawWeb(web);
    for (const flower of state.flowers) drawFlower(flower);
    for (const obstacle of state.obstacles) drawObstacle(obstacle);
    for (const hive of state.hives) drawHive(hive);
    for (const spider of state.spiders) drawSpider(spider);
    for (const wasp of state.wasps) drawWasp(wasp);
    for (const dragon of state.dragonflies) drawDragonfly(dragon);
    for (const queen of state.queens) drawQueen(queen);
    for (const guard of state.workers) drawWorker(guard);
    drawParticles();
    if (state.bee) drawBee(state.bee);
    ctx.restore();
    if (state.running || state.demo) drawMarkers();
    ctx.restore();
    if (state.flash > 0) { ctx.fillStyle = `rgba(255,244,198,${state.flash})`; ctx.fillRect(0, 0, state.width, state.height); }
  }

  function frame(time) {
    const dt = Math.min(.033, Math.max(0, (time - state.lastTime) / 1000 || 0));
    state.lastTime = time;
    if ((state.running || state.demo) && !state.paused) {
      if (state.demo) updateDemoAI();
      update(dt);
    }
    render(); requestAnimationFrame(frame);
  }

  function unlockAudio() {
    if (state.audio) { if (state.audio.state === 'suspended') state.audio.resume(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audio = new AudioContext();
    state.wingOsc = state.audio.createOscillator(); state.wingOsc2 = state.audio.createOscillator();
    state.wingGain = state.audio.createGain(); state.wingFilter = state.audio.createBiquadFilter();
    state.wingOsc.type = 'triangle'; state.wingOsc.frequency.value = 86;
    state.wingOsc2.type = 'sine'; state.wingOsc2.frequency.value = 129;
    state.wingOsc2.detune.value = 7;
    state.wingGain.gain.value = .0001;
    state.wingFilter.type = 'lowpass'; state.wingFilter.frequency.value = 360; state.wingFilter.Q.value = .7;
    state.wingOsc.connect(state.wingGain); state.wingOsc2.connect(state.wingGain);
    state.wingGain.connect(state.wingFilter).connect(state.audio.destination);
    state.wingOsc.start(); state.wingOsc2.start();
  }

  function tone(freq, duration, type = 'sine', volume = .025, slide = 1, delay = 0) {
    if (!state.audio) return;
    const now = state.audio.currentTime + delay, oscillator = state.audio.createOscillator(), gain = state.audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(.018, duration * .16));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(state.audio.destination); oscillator.start(now); oscillator.stop(now + duration + .02);
  }

  function bell(freq, duration = .34, volume = .025, delay = 0) {
    tone(freq, duration, 'sine', volume, .997, delay);
    tone(freq * 2.01, duration * .62, 'sine', volume * .26, 1, delay);
    tone(freq * 3.02, duration * .38, 'sine', volume * .09, 1, delay);
  }

  function puff(duration = .12, volume = .012, cutoff = 620) {
    if (!state.audio?.createBuffer || !state.audio?.createBufferSource || !state.audio?.createBiquadFilter) return;
    const length = Math.max(1, Math.floor(state.audio.sampleRate * duration));
    const buffer = state.audio.createBuffer(1, length, state.audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.2);
    const source = state.audio.createBufferSource(), filter = state.audio.createBiquadFilter(), gain = state.audio.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .5; gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(state.audio.destination); source.start();
  }

  function updateWingSound(active) {
    if (!state.audio || !state.wingGain || state.wingActive === active) return;
    state.wingActive = active;
    const now = state.audio.currentTime;
    state.wingGain.gain.cancelScheduledValues(now);
    state.wingGain.gain.setValueAtTime(Math.max(.0001, state.wingGain.gain.value), now);
    state.wingGain.gain.linearRampToValueAtTime(active ? .0075 : .0001, now + (active ? .16 : .24));
    state.wingOsc.frequency.linearRampToValueAtTime(active ? 104 : 86, now + .2);
    state.wingOsc2.frequency.linearRampToValueAtTime(active ? 156 : 129, now + .2);
  }
  const soundReverseBurst = () => { puff(.1, .009, 760); tone(310, .14, 'triangle', .014, 1.18); bell(620, .13, .009, .035); };
  const soundHit = () => { puff(.09, .014, 480); tone(185, .11, 'sine', .02, .62); bell(510, .09, .009, .015); };
  const soundEnemyDown = () => { puff(.18, .015, 520); bell(430, .22, .019); bell(645, .26, .016, .08); };
  const soundCollect = () => { bell(659, .28, .027); bell(988, .32, .022, .075); };
  const soundDeposit = () => { bell(392, .35, .025); bell(523, .38, .025, .085); bell(784, .42, .021, .17); };
  const soundLand = () => { puff(.16, .009, 410); tone(210, .14, 'sine', .012, .82); };
  const soundAlert = freq => { bell(Math.max(320, freq * 1.6), .2, .017); bell(Math.max(280, freq * 1.35), .22, .014, .13); };
  const soundSwoop = () => { puff(.28, .012, 900); tone(460, .32, 'triangle', .015, .42); };
  const soundHurt = () => { puff(.2, .016, 350); tone(245, .3, 'sine', .027, .58); tone(370, .18, 'triangle', .012, .7, .04); };
  const soundDay = () => { bell(392, .38, .022); bell(523, .4, .022, .1); bell(659, .44, .022, .2); bell(784, .48, .019, .31); };
  const soundGuardDown = () => { bell(392, .3, .018); bell(294, .4, .017, .1); puff(.18, .008, 360); };
  const soundGuardReturn = () => { bell(523, .3, .02); bell(659, .34, .019, .08); bell(880, .4, .016, .16); };

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused; pauseLabel.classList.toggle('visible', state.paused); updateWingSound(false);
  }

  const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'thrust', w: 'thrust', W: 'thrust', ArrowDown: 'reverse', s: 'reverse', S: 'reverse' };
  addEventListener('keydown', event => {
    if (keyMap[event.key]) { state.keys[keyMap[event.key]] = true; event.preventDefault(); unlockAudio(); }
    if (event.key === ' ' && !event.repeat) { event.preventDefault(); unlockAudio(); toggleLandingMode(); }
    if (!event.repeat && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) { event.preventDefault(); setZoom(state.camera.targetZoom + .12, true); }
    if (!event.repeat && (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract')) { event.preventDefault(); setZoom(state.camera.targetZoom - .12, true); }
    if ((event.key === 'p' || event.key === 'P' || event.key === 'Escape') && !event.repeat) togglePause();
    if (event.key === 'Enter' && !state.running) beginGame();
  });
  addEventListener('keyup', event => { if (keyMap[event.key]) { state.keys[keyMap[event.key]] = false; event.preventDefault(); } });
  addEventListener('blur', () => { for (const key of Object.keys(state.keys)) if (key !== 'land') state.keys[key] = false; resetJoystick(); if (state.running && !state.paused) togglePause(); });

  function resetJoystick(pointerId = null) {
    if (pointerId !== null && state.joystick.pointerId !== pointerId) return;
    state.joystick.active = false; state.joystick.pointerId = null; state.joystick.magnitude = 0;
    moveJoystick?.classList.remove('active');
    if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
  }

  function updateJoystick(event) {
    if (!joystickRing || event.pointerId !== state.joystick.pointerId) return;
    const rect = joystickRing.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const travel = rect.width * .31;
    const length = Math.hypot(dx, dy);
    const scale = length > travel ? travel / length : 1;
    const knobX = dx * scale, knobY = dy * scale;
    state.joystick.angle = Math.atan2(dy, dx);
    state.joystick.magnitude = clamp(length / travel, 0, 1);
    joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  }

  if (moveJoystick && joystickRing && joystickKnob) {
    moveJoystick.addEventListener('pointerdown', event => {
      if (!state.running || state.paused) return;
      event.preventDefault(); unlockAudio();
      state.joystick.active = true; state.joystick.pointerId = event.pointerId;
      moveJoystick.classList.add('active'); moveJoystick.setPointerCapture(event.pointerId); updateJoystick(event);
    });
    moveJoystick.addEventListener('pointermove', event => { if (state.joystick.active) { event.preventDefault(); updateJoystick(event); } });
    moveJoystick.addEventListener('pointerup', event => { event.preventDefault(); resetJoystick(event.pointerId); });
    moveJoystick.addEventListener('pointercancel', event => resetJoystick(event.pointerId));
    moveJoystick.addEventListener('lostpointercapture', event => resetJoystick(event.pointerId));
  }

  const pinchPointers = new Map();
  let pinchStartDistance = 0, pinchStartZoom = 1;
  const pinchDistance = () => {
    const points = [...pinchPointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !state.running || state.paused) return;
    pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pinchPointers.size === 2) { pinchStartDistance = pinchDistance(); pinchStartZoom = state.camera.targetZoom; }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pinchPointers.has(event.pointerId)) return;
    pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPointers.size === 2 && pinchStartDistance > 10) {
      event.preventDefault(); setZoom(pinchStartZoom * pinchDistance() / pinchStartDistance);
    }
  });
  const endPinch = event => {
    if (!pinchPointers.has(event.pointerId)) return;
    pinchPointers.delete(event.pointerId);
    if (pinchStartDistance > 0) showHint(`ZOOM ${Math.round(state.camera.targetZoom * 100)}%`, .7);
    pinchStartDistance = 0;
  };
  canvas.addEventListener('pointerup', endPinch);
  canvas.addEventListener('pointercancel', endPinch);
  canvas.addEventListener('lostpointercapture', endPinch);

  for (const button of document.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    const set = active => { state.keys[control] = active; button.classList.toggle('active', active); if (active) unlockAudio(); };
    if (control === 'land') {
      button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); unlockAudio(); toggleLandingMode(); });
    } else {
      button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); set(true); });
      button.addEventListener('pointerup', event => { event.preventDefault(); set(false); });
      button.addEventListener('pointercancel', () => set(false));
      button.addEventListener('lostpointercapture', () => set(false));
    }
  }

  document.querySelector('#start-button').addEventListener('click', beginGame);
  document.querySelector('#restart-button').addEventListener('click', beginGame);
  pauseButton.addEventListener('click', togglePause);
  addEventListener('resize', resize);
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  resize(); beginDemo();
  window.__BEE_DEBUG__ = {
    state, beginGame, beginDemo, updateDemoAI, toggleLandingMode, bankNectar, bankColonyNectar,
    rewardColony, maybeLaunchQueen, foundColony, spawnWasp, spawnDragonfly, waspAttackDamage, setZoom, nextDay,
    makeWorker, spawnUnlockedWorkers, rememberFlowerPatch, shareFlowerMemory, exchangeFlowerMemory,
    killWorker, attackHive, destroyColony, chooseRaidHive,
    landingCandidate, update, TUNING
  };
  requestAnimationFrame(frame);
})();
