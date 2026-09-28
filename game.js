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
const colonyEl = document.querySelector('#colony-count');
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

  const TUNING = window.BEE_TUNING || {
    dev: { unlocked: false, startDay: 1, preset: 'standard' },
    features: { wasps: true, dragonflies: true, spiders: true, webs: true },
    balance: { flowers: 1, enemies: 1, nectarCapacity: 3, playerDamage: 1 }
  };
  const TAU = Math.PI * 2;
  const WORLD_RADIUS = 3100;
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
    flowers: [], webs: [], spiders: [], wasps: [], dragonflies: [], guards: [], guardRespawns: [], helperTiersSpawned: [], particles: [],
    camera: { x: 0, y: 0, vx: 0, vy: 0 },
    keys: { left: false, right: false, thrust: false, reverse: false, land: false },
    waspTimer: 7, dragonflyTimer: 16, hintTimer: 0, reverseSerial: 0,
    actionTarget: null, landingTarget: null, actionTime: 0,
    audio: null, wingOsc: null, wingOsc2: null, wingGain: null, wingFilter: null, wingActive: false
  };

  const random = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const worldToScreen = obj => ({ x: obj.x - state.camera.x, y: obj.y - state.camera.y });
  const onScreen = (obj, margin = 80) => {
    const p = worldToScreen(obj);
    return p.x > -margin && p.x < state.width + margin && p.y > -margin && p.y < state.height + margin;
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

  function makeGuard(id, tier = 0) {
    const angle = id * Math.PI;
    return {
      id, x: Math.cos(angle) * 92, y: Math.sin(angle) * 92, vx: 0, vy: 0, angle,
      radius: 14, health: 3, maxHealth: 3, attackCooldown: random(.2, .7),
      hit: 0, wing: random(0, TAU), target: null, tier, nectar: 0, forageTarget: null,
      actionTime: 0, landScale: 1, sheltered: false, role: 'alternate'
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

  function makeFlower(index = 0) {
    const pos = randomMeadowPoint(390, WORLD_RADIUS - 160);
    const type = FLOWER_TYPES[index % FLOWER_TYPES.length];
    return {
      ...pos, type, size: random(18, 29), rotation: random(0, TAU), sway: random(0, TAU),
      nectar: 1, spent: false, discovered: false
    };
  }

  function makeWeb(pos = randomMeadowPoint(650, WORLD_RADIUS - 300)) {
    return { ...pos, radius: random(74, 118), rotation: random(0, TAU), glint: random(0, TAU) };
  }

  function makeSpider(web) {
    return {
      x: web.x + random(-18, 18), y: web.y + random(-18, 18), homeX: web.x, homeY: web.y,
      vx: 0, vy: 0, radius: 19, health: 3, maxHealth: 3, cooldown: random(0, 2), angle: random(0, TAU), phase: random(0, TAU)
    };
  }

  function spawnWasp() {
    if (!TUNING.features.wasps || !state.bee) return null;
    const angle = random(0, TAU);
    const radius = random(520, 760);
    const wasp = {
      x: state.bee.x + Math.cos(angle) * radius, y: state.bee.y + Math.sin(angle) * radius,
      vx: 0, vy: 0, angle: angle + Math.PI, radius: 24, health: 2 + Math.floor(state.day / 6),
      maxHealth: 2 + Math.floor(state.day / 6), phase: random(0, TAU), hit: 0, lastSting: -1
    };
    state.wasps.push(wasp);
    showHint('⚠ WASP IN THE MEADOW', 2.4);
    soundAlert(240);
    return wasp;
  }

  function spawnDragonfly() {
    if (!TUNING.features.dragonflies || !state.bee) return null;
    const angle = random(0, TAU);
    const radius = random(700, 950);
    const dragonfly = {
      x: state.bee.x + Math.cos(angle) * radius, y: state.bee.y + Math.sin(angle) * radius,
      vx: -Math.cos(angle) * 220, vy: -Math.sin(angle) * 220, angle: angle + Math.PI,
      radius: 25, health: 4, maxHealth: 4, phase: random(0, TAU), swoop: random(1.8, 3.2), hit: 0, lastSting: -1
    };
    state.dragonflies.push(dragonfly);
    showHint('⚠ DRAGONFLY SWOOP', 2.4);
    soundAlert(130);
    return dragonfly;
  }

  function populateMeadow() {
    state.flowers = [];
    const flowerCount = Math.round(62 * TUNING.balance.flowers);
    for (let i = 0; i < flowerCount; i++) state.flowers.push(makeFlower(i));
    state.webs = [];
    state.spiders = [];
    if (TUNING.features.webs || TUNING.features.spiders) {
      const count = TUNING.features.webs ? 13 : 8;
      for (let i = 0; i < count; i++) {
        const web = makeWeb();
        if (TUNING.features.webs) state.webs.push(web);
        if (TUNING.features.spiders && (i % 2 === 0 || !TUNING.features.webs)) state.spiders.push(makeSpider(web));
      }
    }
  }

  function clearControls() {
    for (const key of Object.keys(state.keys)) state.keys[key] = false;
    for (const button of document.querySelectorAll('[data-control]')) button.classList.remove('active');
  }

  function resetSession(demo) {
    clearControls();
    state.demo = demo; state.running = !demo; state.paused = false; state.elapsed = 0;
    state.score = 0; state.totalNectar = 0; state.lives = 3;
    state.day = TUNING.dev.startDay; state.dayNectar = 0; state.dayGoal = 4 + state.day * 2;
    state.wasps = []; state.dragonflies = []; state.particles = [];
    state.guards = [makeGuard(0, 0), makeGuard(1, 0)]; state.guardRespawns = []; state.helperTiersSpawned = [];
    state.bee = makeBee(); state.actionTarget = null; state.landingTarget = null; state.actionTime = 0; state.reverseSerial = 0;
    state.waspTimer = random(7, 11) / TUNING.balance.enemies;
    state.dragonflyTimer = random(16, 23) / TUNING.balance.enemies;
    populateMeadow(); centerCamera();
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
    livesEl.textContent = '♥'.repeat(state.lives);
    livesEl.setAttribute('aria-label', `${state.lives} lives`);
    const availableHelpers = 2 + Math.floor(state.totalNectar / 5);
    dayEl.textContent = `DAY ${String(state.day).padStart(2, '0')} · GOAL ${state.dayNectar}/${state.dayGoal}`;
    if (colonyEl) colonyEl.textContent = `${state.guards.length + 1}/${availableHelpers + 1}`;
  }

  function spawnUnlockedHelpers() {
    const unlocked = Math.floor(state.totalNectar / 5);
    for (let tier = 1; tier <= unlocked; tier++) {
      if (state.helperTiersSpawned.includes(tier) || state.score < 1) continue;
      state.score--;
      state.helperTiersSpawned.push(tier);
      state.guards.push(makeGuard(tier + 1, tier));
      burst(0, 0, '#9de6e2', 20, 120);
      showHint(`NEW HELPER BEE · ${tier * 5} NECTAR MILESTONE`, 2.2);
      soundGuardReturn();
    }
  }

  function bankNectar(amount, announce = true) {
    if (amount <= 0) return;
    state.score += amount;
    state.totalNectar += amount;
    state.dayNectar += amount;
    spawnUnlockedHelpers();
    if (announce) showHint(`DELIVERED ${amount} NECTAR`, 1.5);
    if (state.dayNectar >= state.dayGoal) nextDay();
    updateHud();
  }

  function rewardKill(enemy) {
    if (enemy.rewarded) return;
    enemy.rewarded = true;
    bankNectar(2, false);
    burst(enemy.x, enemy.y, '#ffd83f', 14, 130);
    showHint('+2 NECTAR', .8);
  }

  function edgePressure(value, size, zone, inset) {
    const ramp = Math.max(1, zone - inset);
    if (value < zone) return -clamp((zone - value) / ramp, 0, 1);
    if (value > size - zone) return clamp((value - (size - zone)) / ramp, 0, 1);
    return 0;
  }

  function updateCamera(dt) {
    const bee = state.bee;
    const screenX = bee.x - state.camera.x;
    const screenY = bee.y - state.camera.y;
    const insetX = clamp(state.width * .14, 76, 142);
    const insetY = clamp(state.height * .15, 68, 118);
    const zoneX = clamp(state.width * .35, 130, 330);
    const zoneY = clamp(state.height * .34, 108, 250);
    const px = edgePressure(screenX, state.width, zoneX, insetX);
    const py = edgePressure(screenY, state.height, zoneY, insetY);
    const accelerating = (state.keys.thrust || state.keys.reverse) && !bee.landing;
    const targetX = accelerating && Math.sign(bee.vx) === Math.sign(px) ? bee.vx * Math.pow(Math.abs(px), 1.15) * 2.25 : 0;
    const targetY = accelerating && Math.sign(bee.vy) === Math.sign(py) ? bee.vy * Math.pow(Math.abs(py), 1.15) * 2.25 : 0;
    const response = 1 - Math.exp(-(accelerating ? 11 : 4.6) * dt);
    state.camera.vx += (targetX - state.camera.vx) * response;
    state.camera.vy += (targetY - state.camera.vy) * response;
    state.camera.x += state.camera.vx * dt;
    state.camera.y += state.camera.vy * dt;

    const sx = bee.x - state.camera.x;
    const sy = bee.y - state.camera.y;
    if (sx < insetX) state.camera.x = bee.x - insetX;
    if (sx > state.width - insetX) state.camera.x = bee.x - (state.width - insetX);
    if (sy < insetY) state.camera.y = bee.y - insetY;
    if (sy > state.height - insetY) state.camera.y = bee.y - (state.height - insetY);
  }

  function updateBee(dt) {
    const bee = state.bee;
    bee.invulnerable = Math.max(0, bee.invulnerable - dt);
    bee.reverseBurst = Math.max(0, bee.reverseBurst - dt);
    bee.wing += dt * (state.keys.thrust || state.keys.reverse ? 38 : 21);
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
    const turn = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
    const speed = Math.hypot(bee.vx, bee.vy);
    bee.angle += turn * (2.7 + Math.min(speed, 180) / 170) * dt;
    const reversePower = bee.reverseBurst > 0 ? 1.18 : .76;
    const drive = !bee.landing ? (state.keys.reverse ? -reversePower : state.keys.thrust ? 1 : 0) : 0;
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

    let webbed = false;
    for (const web of state.webs) {
      if (distance(bee, web) < web.radius * .75) { webbed = true; break; }
    }
    if (webbed) {
      bee.vx *= Math.pow(.14, dt); bee.vy *= Math.pow(.14, dt);
      if (Math.random() < dt * 2) showHint('TANGLED! KEEP FLYING TO BREAK FREE', 1.2);
    }

    bee.x += bee.vx * dt; bee.y += bee.vy * dt;
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
    if (enemy.health > 0) damageBee(enemy.x, enemy.y);
  }

  function updateEnemies(dt) {
    state.waspTimer -= dt;
    state.dragonflyTimer -= dt;
    const nectar = state.totalNectar;
    const maxWasps = Math.min(10, TUNING.balance.enemyBaseline + Math.floor(nectar / TUNING.balance.enemyNectarStep));
    if (state.waspTimer <= 0 && state.wasps.length < maxWasps) {
      spawnWasp();
      state.waspTimer = random(8, 13) / (TUNING.balance.enemies * (1 + nectar * .02));
    }
    const maxDragonflies = Math.min(4, Math.floor(nectar / TUNING.balance.dragonflyNectarStep));
    if (state.dragonflyTimer <= 0 && state.dragonflies.length < maxDragonflies) {
      spawnDragonfly();
      state.dragonflyTimer = random(18, 28) / (TUNING.balance.enemies * (1 + nectar * .02));
    }

    const chaseables = [];
    if (!state.bee.sheltered) chaseables.push(state.bee);
    for (const guard of state.guards) if (!guard.sheltered) chaseables.push(guard);
    const nearestChaseable = from => {
      let target = null, best = Infinity;
      for (const candidate of chaseables) { const d = distance(from, candidate); if (d < best) { best = d; target = candidate; } }
      return target;
    };

    for (const wasp of state.wasps) {
      wasp.hit = Math.max(0, wasp.hit - dt);
      wasp.phase += dt * 7;
      const waspTarget = nearestChaseable(wasp);
      if (waspTarget) {
        const desired = Math.atan2(waspTarget.y - wasp.y, waspTarget.x - wasp.x) + Math.sin(wasp.phase) * .28;
        wasp.angle += angleDelta(wasp.angle, desired) * Math.min(1, dt * 3.5);
        const speed = 105 + state.day * 3;
        wasp.vx += Math.cos(wasp.angle) * speed * dt * 2.2;
        wasp.vy += Math.sin(wasp.angle) * speed * dt * 2.2;
      }
      wasp.vx *= Math.pow(.14, dt); wasp.vy *= Math.pow(.14, dt);
      wasp.x += wasp.vx * dt; wasp.y += wasp.vy * dt;
      resolveEnemyContact(wasp, state.wasps, 2);
    }

    for (const dragon of state.dragonflies) {
      dragon.hit = Math.max(0, dragon.hit - dt);
      dragon.phase += dt * 18;
      dragon.swoop -= dt;
      const dragonTarget = nearestChaseable(dragon);
      if (dragon.swoop <= 0 && dragonTarget) {
        const aim = Math.atan2(dragonTarget.y - dragon.y, dragonTarget.x - dragon.x);
        dragon.vx = Math.cos(aim) * (360 + state.day * 4);
        dragon.vy = Math.sin(aim) * (360 + state.day * 4);
        dragon.swoop = random(2.5, 4.1);
        soundSwoop();
      } else {
        dragon.vx *= Math.pow(.84, dt); dragon.vy *= Math.pow(.84, dt);
      }
      dragon.angle = Math.atan2(dragon.vy, dragon.vx);
      dragon.x += dragon.vx * dt; dragon.y += dragon.vy * dt;
      resolveEnemyContact(dragon, state.dragonflies, 4);
      if (dragonTarget && distance(dragon, dragonTarget) > 1500) {
        const angle = random(0, TAU);
        dragon.x = dragonTarget.x + Math.cos(angle) * 820; dragon.y = dragonTarget.y + Math.sin(angle) * 820;
      }
    }

    for (const spider of state.spiders) {
      spider.cooldown -= dt; spider.phase += dt * 4;
      const spiderTarget = nearestChaseable(spider);
      if (spiderTarget && distance(spider, spiderTarget) < 260 && spider.cooldown <= 0) {
        const angle = Math.atan2(spiderTarget.y - spider.y, spiderTarget.x - spider.x);
        spider.vx += Math.cos(angle) * 290; spider.vy += Math.sin(angle) * 290; spider.cooldown = 2.4;
      }
      const homeAngle = Math.atan2(spider.homeY - spider.y, spider.homeX - spider.x);
      if (distance(spider, { x: spider.homeX, y: spider.homeY }) > 140) {
        spider.vx += Math.cos(homeAngle) * 100 * dt; spider.vy += Math.sin(homeAngle) * 100 * dt;
      }
      spider.vx *= Math.pow(.11, dt); spider.vy *= Math.pow(.11, dt);
      spider.x += spider.vx * dt; spider.y += spider.vy * dt;
      spider.angle = Math.atan2(spider.vy || Math.sin(spider.phase), spider.vx || Math.cos(spider.phase));
      resolveEnemyContact(spider, state.spiders, 3);
    }
    state.wasps = state.wasps.filter(enemy => enemy.health > 0);
    state.dragonflies = state.dragonflies.filter(enemy => enemy.health > 0);
    state.spiders = state.spiders.filter(enemy => enemy.health > 0);
  }

  function updateGuards(dt) {
    const enemies = [...state.wasps, ...state.dragonflies, ...state.spiders].filter(enemy => enemy.health > 0);
    let helperDeposits = 0;
    const guardsBefore = state.guards.length;
    const roster = [...state.guards].sort((a, b) => a.id - b.id);
    const foragerId = roster.length >= 2 ? roster[0].id : null;
    const hiveGuardId = roster.length >= 2 ? roster[1].id : null;
    for (const guard of state.guards) {
      guard.role = guard.id === foragerId ? 'forage' : guard.id === hiveGuardId ? 'guard' : 'alternate';
      guard.hit = Math.max(0, guard.hit - dt); guard.attackCooldown -= dt; guard.wing += dt * 32;
      let target = null, targetKind = 'patrol', best = Infinity;
      for (const enemy of enemies) {
        const hiveDistance = Math.hypot(enemy.x, enemy.y);
        const guardDistance = distance(guard, enemy);
        if ((hiveDistance < 520 || guardDistance < 235) && guardDistance < best) { best = guardDistance; target = enemy; targetKind = 'enemy'; }
      }
      let goalX, goalY, speed, arrival = 0;
      if (targetKind === 'enemy') {
        goalX = target.x; goalY = target.y; speed = 180;
      } else if (guard.nectar > 0) {
        target = { x: 0, y: 0 }; targetKind = 'hive'; goalX = 0; goalY = 0; speed = 150; arrival = 92;
      } else {
        const shouldForage = guard.role === 'forage' ? true
          : guard.role === 'guard' ? false
          : Boolean(guard.forageTarget) || Math.sin(state.elapsed * .32 + guard.id * 1.7) > -.15;
        if (guard.forageTarget && (guard.forageTarget.spent || guard.forageTarget.nectar <= 0)) guard.forageTarget = null;
        if (shouldForage && !guard.forageTarget) {
          const flowers = state.flowers.filter(flower => !flower.spent && flower.nectar > 0);
          guard.forageTarget = flowers.sort((a, b) => distance(guard, a) - distance(guard, b))[0] || null;
        }
        if (shouldForage && guard.forageTarget) {
          target = guard.forageTarget; targetKind = 'flower'; goalX = target.x; goalY = target.y; speed = 138; arrival = target.size + 24;
        } else {
          const patrol = state.elapsed * .62 + guard.id * Math.PI;
          goalX = Math.cos(patrol) * (112 + guard.tier * 9); goalY = Math.sin(patrol) * (82 + guard.tier * 7); speed = 115;
        }
      }
      guard.target = target;
      const desired = Math.atan2(goalY - guard.y, goalX - guard.x);
      guard.angle += angleDelta(guard.angle, desired) * Math.min(1, dt * 6);
      const goalDistance = Math.hypot(goalX - guard.x, goalY - guard.y);
      const landed = arrival > 0 && goalDistance < arrival && Math.hypot(guard.vx, guard.vy) < 70;
      guard.sheltered = landed;
      guard.landScale += ((landed ? .68 : 1) - guard.landScale) * (1 - Math.exp(-10 * dt));
      if (landed) {
        guard.vx *= Math.pow(.04, dt); guard.vy *= Math.pow(.04, dt);
        guard.actionTime += dt;
        if (targetKind === 'flower' && guard.actionTime >= 1.05) {
          target.spent = true; target.nectar = 0; guard.nectar = 1; guard.forageTarget = null; guard.actionTime = 0;
          burst(target.x, target.y, target.type.petal, 12, 70); soundCollect();
        } else if (targetKind === 'hive' && guard.actionTime >= .75) {
          guard.nectar = 0; helperDeposits++; guard.actionTime = 0; burst(0, 0, '#8ee6e9', 7, 70);
        }
      } else {
        guard.actionTime = 0;
        const ease = arrival > 0 ? Math.min(1, goalDistance / (arrival * 3)) : 1;
        guard.vx += Math.cos(guard.angle) * speed * ease * dt * 3;
        guard.vy += Math.sin(guard.angle) * speed * ease * dt * 3;
        guard.vx *= Math.pow(.05, dt); guard.vy *= Math.pow(.05, dt);
      }
      guard.x += guard.vx * dt; guard.y += guard.vy * dt;
      if (targetKind === 'enemy' && target && distance(guard, target) < guard.radius + target.radius + 3 && guard.attackCooldown <= 0) {
        target.health--; target.hit = .16; guard.health--; guard.hit = .22; guard.attackCooldown = .72;
        const impactX = (guard.x + target.x) / 2, impactY = (guard.y + target.y) / 2;
        burst(impactX, impactY, '#83d8e3', 10, 110); soundHit();
        if (target.health <= 0) { burst(target.x, target.y, '#e9ad24', 20, 160); soundEnemyDown(); rewardKill(target); }
        if (guard.health <= 0) {
          burst(guard.x, guard.y, '#78d1db', 22, 165);
          state.guardRespawns.push({ id: guard.id, tier: guard.tier, timer: 4.5, notified: false });
          soundGuardDown();
        }
      }
    }
    state.guards = state.guards.filter(guard => guard.health > 0);
    if (state.guards.length !== guardsBefore) updateHud();
    if (helperDeposits > 0) { bankNectar(helperDeposits, false); soundDeposit(); }
    for (const respawn of state.guardRespawns) {
      respawn.timer -= dt;
      if (respawn.timer <= 0) {
        const requirement = respawn.tier > 0 ? respawn.tier * 5 : 1;
        if (state.score >= requirement) {
          state.score--;
          state.guards.push(makeGuard(respawn.id, respawn.tier)); burst(0, 0, '#8ee6e9', 16, 105);
          showHint(`${respawn.tier > 0 ? 'HELPER' : 'HIVE GUARD'} RESPAWNED · 1 NECTAR`, 1.6); soundGuardReturn();
          respawn.done = true; updateHud();
        } else if (!respawn.notified) {
          const need = respawn.tier > 0 ? `${requirement} STORED NECTAR` : '1 STORED NECTAR';
          showHint(`BEE WAITING TO RESPAWN · NEED ${need}`, 2); respawn.notified = true;
        }
      }
    }
    state.guardRespawns = state.guardRespawns.filter(respawn => !respawn.done);
    state.wasps = state.wasps.filter(enemy => enemy.health > 0);
    state.dragonflies = state.dragonflies.filter(enemy => enemy.health > 0);
    state.spiders = state.spiders.filter(enemy => enemy.health > 0);
  }

  function updateFlowers(dt) {
    state.flowerTimer -= dt;
    if (state.flowerTimer <= 0) {
      state.flowerTimer = TUNING.balance.flowerSpawn;
      if (state.flowers.length < 110) state.flowers.push(makeFlower(state.flowers.length));
    }
    const bees = [state.bee, ...state.guards];
    state.flowers = state.flowers.filter(flower => {
      flower.sway += dt * .8;
      if (distance(flower, state.bee) < 170) flower.discovered = true;
      if (!flower.spent) return true;
      return bees.some(bee => bee && Math.hypot(bee.x - flower.x, bee.y - flower.y) < 70);
    });
  }

  function damageBee(fromX, fromY) {
    if (!TUNING.balance.playerDamage || state.bee.invulnerable > 0 || state.bee.sheltered) return;
    state.bee.invulnerable = 2;
    state.lives--;
    const angle = Math.atan2(state.bee.y - fromY, state.bee.x - fromX);
    state.bee.vx = Math.cos(angle) * 230; state.bee.vy = Math.sin(angle) * 230;
    state.bee.nectar = Math.max(0, state.bee.nectar - 1);
    state.shake = 14; state.flash = .3;
    burst(state.bee.x, state.bee.y, '#f5b51e', 28, 200); soundHurt(); updateHud();
    if (state.lives <= 0) {
      if (state.score >= 1) {
        state.score--;
        state.lives = 3; state.bee = makeBee(); state.landingTarget = null; state.actionTarget = null;
        centerCamera(); burst(0, 116, '#ffe56f', 24, 130);
        showHint('RESPAWNED FROM THE HIVE · 1 NECTAR', 2); soundGuardReturn(); updateHud();
      } else if (state.demo) beginDemo();
      else gameOver();
    }
    else showHint('OUCH! YOU DROPPED SOME NECTAR', 1.7);
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
    updateFlowers(dt); updateBee(dt); updateEnemies(dt); updateGuards(dt); updateParticles(dt);
  }

  function drawGround() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, '#67ad55'); gradient.addColorStop(1, '#4d9648');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, state.width, state.height);
    const cell = 74;
    const minX = Math.floor(state.camera.x / cell) - 1;
    const maxX = Math.ceil((state.camera.x + state.width) / cell) + 1;
    const minY = Math.floor(state.camera.y / cell) - 1;
    const maxY = Math.ceil((state.camera.y + state.height) / cell) + 1;
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

  function drawHive() {
    const p = worldToScreen({ x: 0, y: 0 });
    if (p.x < -160 || p.x > state.width + 160 || p.y < -160 || p.y > state.height + 160) return;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(38,70,28,.18)'; ctx.beginPath(); ctx.ellipse(0, 20, 112, 76, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#70500e'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0, -78); ctx.lineTo(0, -110); ctx.stroke();
    ctx.fillStyle = '#d89117'; ctx.strokeStyle = '#79510c'; ctx.lineWidth = 5;
    const tiers = [[-70, 70], [-55, 88], [-35, 100], [-12, 106], [13, 100], [35, 86], [55, 66]];
    for (const [y, width] of tiers) { ctx.beginPath(); ctx.roundRect(-width, y - 13, width * 2, 27, 13); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#39250d'; ctx.beginPath(); ctx.ellipse(0, 50, 26, 20, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#ffc927'; ctx.font = '800 13px "Nunito"'; ctx.textAlign = 'center'; ctx.fillText('HOME', 0, 91);
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

  function drawGuard(guard) {
    if (!onScreen(guard, 45)) return;
    const p = worldToScreen(guard);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(guard.angle + Math.PI / 2); ctx.scale(.82, .82);
    const flap = Math.sin(guard.wing) * .4;
    ctx.fillStyle = 'rgba(222,249,247,.76)'; ctx.strokeStyle = 'rgba(38,92,92,.5)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-.55 - flap); ctx.beginPath(); ctx.ellipse(-15, -1, 10, 20, -.4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(.55 + flap); ctx.beginPath(); ctx.ellipse(15, -1, 10, 20, .4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = guard.hit ? '#fff' : '#eeb51d'; ctx.strokeStyle = '#26332d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 5, 13, 21, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#247887'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-11, 1); ctx.lineTo(11, 1); ctx.moveTo(-11, 11); ctx.lineTo(11, 11); ctx.stroke();
    ctx.fillStyle = '#26332d'; ctx.beginPath(); ctx.arc(0, -13, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7fe3ea'; ctx.beginPath(); ctx.arc(0, -14, 4, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(p.x, p.y - 27); ctx.fillStyle = 'rgba(25,53,44,.35)'; ctx.fillRect(-14, 0, 28, 3);
    ctx.fillStyle = '#82e1e6'; ctx.fillRect(-14, 0, 28 * guard.health / guard.maxHealth, 3); ctx.restore();
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
    const p = worldToScreen(target), pad = 64;
    if (p.x > pad && p.x < state.width - pad && p.y > pad && p.y < state.height - pad) return;
    const cx = state.width / 2, cy = state.height / 2;
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const x = clamp(cx + Math.cos(angle) * state.width * .43, pad, state.width - pad);
    const y = clamp(cy + Math.sin(angle) * state.height * .39, pad + 30, state.height - pad);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color; ctx.strokeStyle = 'rgba(44,45,24,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.rotate(-angle); ctx.fillStyle = '#2c3824'; ctx.font = '800 10px "Nunito"'; ctx.textAlign = 'center'; ctx.fillText(symbol, 0, 25); ctx.restore();
  }

  function drawHomePointer() {
    const hive = { x: 0, y: 0 }, p = worldToScreen(hive), pad = 86;
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
    drawGround();
    for (const web of state.webs) drawWeb(web);
    for (const flower of state.flowers) drawFlower(flower);
    drawHive();
    for (const spider of state.spiders) drawSpider(spider);
    for (const wasp of state.wasps) drawWasp(wasp);
    for (const dragon of state.dragonflies) drawDragonfly(dragon);
    for (const guard of state.guards) drawGuard(guard);
    drawParticles();
    if (state.bee) drawBee(state.bee);
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
    if ((event.key === 'p' || event.key === 'P' || event.key === 'Escape') && !event.repeat) togglePause();
    if (event.key === 'Enter' && !state.running) beginGame();
  });
  addEventListener('keyup', event => { if (keyMap[event.key]) { state.keys[keyMap[event.key]] = false; event.preventDefault(); } });
  addEventListener('blur', () => { for (const key of Object.keys(state.keys)) if (key !== 'land') state.keys[key] = false; if (state.running && !state.paused) togglePause(); });

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
  window.__BEE_DEBUG__ = { state, beginGame, beginDemo, updateDemoAI, toggleLandingMode, bankNectar, spawnWasp, spawnDragonfly, nextDay, landingCandidate, update, TUNING };
  requestAnimationFrame(frame);
})();
