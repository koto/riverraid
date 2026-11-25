export const CFG = {
  DZ: 2, // river sample spacing
  SECTOR_LEN: 1100, // distance between bridges
  BRIDGE_HW: 15, // river half-width at bridges
  BOSS_EVERY: 3, // a boss guards every Nth bridge
  BOSS_OFFSET: 300, // boss sits this far before its bridge
  BOSS_LOCK: 82, // player can't get closer than this to a living boss
  CHUNK_LEN: 96,
  VIEW_AHEAD: 400,
  VIEW_BEHIND: 72,
  PLAYER_Y: 5,
  SPEED_MIN: 26,
  SPEED_BASE: 46,
  SPEED_MAX: 84,
  STRAFE: 40,
  FUEL_DRAIN: 2.4,
  FUEL_REFILL: 32,
  START_LIVES: 3,
  START_BOMBS: 2,
  MAX_BOMBS: 5,
  EXTRA_LIFE_EVERY: 15000,
};

export const isBossSector = (k) => k > 0 && k % CFG.BOSS_EVERY === 0;

export const WEAPON_ORDER = ['vulcan', 'spread', 'homing', 'laser'];

export const POWERUPS = {
  vulcan: { color: 0xffd23a, label: 'V', name: 'VULCAN CANNON', weapon: true },
  spread: { color: 0xff8a2a, label: 'S', name: 'SCATTER GUN', weapon: true },
  homing: { color: 0xff3ad8, label: 'H', name: 'SEEKER MISSILES', weapon: true },
  laser: { color: 0x2ae8ff, label: 'L', name: 'PHOTON LASER', weapon: true },
  shield: { color: 0x3a8cff, label: 'Ω', name: 'SHIELD' },
  fuel: { color: 0x3aff6a, label: 'F', name: 'FUEL CELL' },
  bomb: { color: 0xff3a3a, label: 'B', name: 'NOVA BOMB' },
  slowmo: { color: 0xa66bff, label: 'T', name: 'TIME WARP' },
  overdrive: { color: 0xfff27a, label: 'O', name: 'OVERDRIVE' },
  life: { color: 0xff6b9a, label: '+1', name: 'EXTRA LIFE' },
};

export const DROP_TABLE = [
  ['vulcan', 5], ['spread', 12], ['homing', 11], ['laser', 11],
  ['shield', 12], ['fuel', 14], ['bomb', 10], ['slowmo', 8], ['overdrive', 10], ['life', 3],
];

export function randomDrop(rng = Math.random) {
  const total = DROP_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of DROP_TABLE) {
    r -= w;
    if (r < 0) return k;
  }
  return 'fuel';
}

export const BOSS_NAMES = ['IRONCLAD DREADNOUGHT', 'LEVIATHAN MK-II', 'HYDRA FORTRESS', 'OBSIDIAN TITAN'];
