(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const unlocked = params.get('dev') === 'hivelab';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const flag = (name, fallback) => {
    if (!unlocked || !params.has(name)) return fallback;
    return !['0', 'false', 'off', 'no'].includes(String(params.get(name)).toLowerCase());
  };
  const number = (name, fallback, min, max) => {
    if (!unlocked || !params.has(name)) return fallback;
    const parsed = Number(params.get(name));
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  };
  const preset = unlocked ? params.get('preset') : null;
  const presets = {
    peaceful: { wasps: false, dragonflies: false, spiders: false, webs: false },
    forager: { wasps: true, dragonflies: false, spiders: true, webs: true },
    swarm: { wasps: true, dragonflies: true, spiders: true, webs: true },
    chaos: { wasps: true, dragonflies: true, spiders: true, webs: true }
  }[preset] || {};
  const enabled = (name, fallback = true) => flag(name, presets[name] ?? fallback);

  window.BEE_TUNING = {
    dev: { unlocked, code: 'hivelab', startDay: number('day', 1, 1, 30), preset: preset || 'standard' },
    features: { wasps: enabled('wasps'), dragonflies: enabled('dragonflies'), spiders: enabled('spiders'), webs: enabled('webs') },
    balance: {
      flowers: number('flowers', 1, .5, 3), enemies: number('enemies', 1, .25, 3),
      nectarCapacity: number('capacity', 3, 1, 8), playerDamage: flag('invincible', false) ? 0 : 1
    }
  };
})();
