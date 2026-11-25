import * as THREE from 'three';
import { CFG, POWERUPS, WEAPON_ORDER } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      score: $('score'), hi: $('hiscore'), combo: $('combo'), lives: $('lives'), bombs: $('bombs'),
      fuelFill: $('fuel-fill'), fuel: $('fuel'), sector: $('sector'), tod: $('tod'), progress: $('progress-fill'),
      weapons: $('weapons'), effects: $('effects-list'), bossBar: $('boss-bar'), bossFill: $('boss-fill'),
      bossName: $('boss-name'), message: $('message'), popups: $('popups'), flash: $('flash'), speed: $('speed-fill'),
      refuel: $('refuel'),
    };
    this.cache = {};
    this.msgTimer = 0;
    this._v = new THREE.Vector3();
    // weapon slots
    this.el.weapons.innerHTML = WEAPON_ORDER.map((w, i) => {
      const def = POWERUPS[w];
      const col = '#' + new THREE.Color(def.color).getHexString();
      return `<div class="wslot" id="w-${w}" style="--c:${col}"><span class="key">${i + 1}</span><span class="wl">${def.label}</span><div class="pips"><i></i><i></i><i></i></div><span class="wn">${def.name.split(' ')[0]}</span></div>`;
    }).join('');
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  _set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(val);
  }

  update(dt) {
    const g = this.game, p = g.player, e = this.el;
    this._set('score', g.score, (v) => (e.score.textContent = v.toLocaleString('en-US')));
    this._set('hi', Math.max(g.hiscore, g.score), (v) => (e.hi.textContent = v.toLocaleString('en-US')));
    const comboTxt = g.mult > 1 && g.time - g.lastKill < 2.5 ? `x${g.mult} COMBO · ${g.combo}` : '';
    this._set('combo', comboTxt, (v) => {
      e.combo.textContent = v;
      e.combo.classList.toggle('on', !!v);
    });
    this._set('lives', g.lives, (v) => (e.lives.innerHTML = '<span class="ico jet"></span>'.repeat(Math.max(0, Math.min(v, 8)))));
    this._set('bombs', p.bombs, (v) => (e.bombs.innerHTML = '<span class="ico bomb"></span>'.repeat(v)));
    const fuel = Math.round(p.fuel);
    this._set('fuel', fuel, (v) => {
      e.fuelFill.style.width = v + '%';
      e.fuel.classList.toggle('low', v < 25);
    });
    this._set('refuel', g.refueling, (v) => e.refuel.classList.toggle('on', v));
    const spd = Math.round(((p.speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN)) * 100);
    this._set('speed', spd, (v) => (e.speed.style.width = v + '%'));
    this._set('sector', g.sector, (v) => (e.sector.textContent = `SECTOR ${v + 1}`));
    this._set('tod', g.env.name, (v) => (e.tod.textContent = v));
    const prog = Math.round((g.sectorFloat % 1) * 200) / 2;
    this._set('prog', prog, (v) => (e.progress.style.width = v + '%'));
    const wkey = WEAPON_ORDER.map((w) => (p.weapons[w] || 0) + (p.current === w ? 'a' : '')).join(',');
    this._set('weapons', wkey, () => {
      for (const w of WEAPON_ORDER) {
        const s = document.getElementById('w-' + w);
        const lv = p.weapons[w] || 0;
        s.classList.toggle('locked', !lv);
        s.classList.toggle('active', p.current === w);
        s.querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('on', i < lv));
      }
    });
    const fx = [];
    if (p.shield > 0) fx.push(['shield', p.shield, 10]);
    if (p.overdrive > 0) fx.push(['overdrive', p.overdrive, 8]);
    if (p.slowmo > 0) fx.push(['slowmo', p.slowmo, 6]);
    const fxKey = fx.map(([k, t]) => k + Math.ceil(t * 4)).join(',');
    this._set('fx', fxKey, () => {
      e.effects.innerHTML = fx
        .map(([k, t, max]) => {
          const def = POWERUPS[k];
          const col = '#' + new THREE.Color(def.color).getHexString();
          return `<div class="fx" style="--c:${col}"><span>${def.name}</span><div class="bar"><div style="width:${(t / max) * 100}%"></div></div></div>`;
        })
        .join('');
    });
    const boss = g.boss;
    const bossHp = boss && boss.alive ? Math.max(0, Math.round((boss.hp / boss.maxHp) * 1000) / 10) : -1;
    this._set('boss', bossHp, (v) => {
      e.bossBar.classList.toggle('hidden', v < 0);
      if (v >= 0) e.bossFill.style.width = v + '%';
    });
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) e.message.classList.remove('show');
    }
  }

  message(title, sub = '', dur = 2.2, cls = '') {
    const m = this.el.message;
    m.innerHTML = `<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
    m.className = 'show ' + cls;
    void m.offsetWidth;
    this.msgTimer = dur;
  }

  popup(text, x, y, z, color = '#fff', big = false) {
    const v = this._v.set(x, y, z).project(this.game.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'popup' + (big ? ' big' : '');
    el.textContent = text;
    el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
    el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
    el.style.color = color;
    this.el.popups.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  flash(color = '#fff', strength = 0.6) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = strength;
    void f.offsetWidth;
    f.style.transition = 'opacity 0.5s ease-out';
    f.style.opacity = 0;
  }

  showBoss(name) {
    this.el.bossName.textContent = name;
  }
}
