# River Raid: Overdrive

A modern, 3D browser remake inspired by the 1982 Atari classic **River Raid**. Fly low over an endless,
procedurally generated river: blow up bridges, refuel at fuel depots, and fight your way past ships,
helicopters, jets, turrets, kamikaze drones and massive boss battleships, now with modern weapons,
power-ups and stylized low-poly graphics.

Built with [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No external assets: every model,
texture, sound effect and music track is generated in code.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

**Play online: https://koto.github.io/riverraid/**

Every push to `main` is built by `.github/workflows/deploy.yml` and published to the `gh-pages` branch
(served by GitHub Pages; if needed set *Settings → Pages → Source* to the `gh-pages` branch).

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Steer | ← → / A D | left stick / d-pad | drag left/right |
| Throttle | ↑ ↓ / W S | left stick / d-pad | drag up/down |
| Fire | Space / J / Z | A / RT | hold anywhere |
| Nova bomb | B / Shift / X | B / X | NOVA button |
| Switch weapon | Q E / Tab / 1–4 | LB / RB / Y | WPN button |
| Pause | P / Esc | Start | ⏸ button |
| Sound / music | M / N | | |

## Classic rules, modern twist

- **Fuel** drains constantly. Fly over red-and-white **FUEL** depots to refuel (or shoot them for points).
- **Bridges** block the river and must be destroyed. Each one is a checkpoint.
- Crashing into the banks, enemies or bridges costs a ship. Extra ships come every 15,000 points.
- **Combo multiplier**: chain kills within 2.5 s to raise your score multiplier up to ×8.
- **Boss fights**: a huge battleship guards every third bridge, with aimed bursts, bullet fans and homing missiles.
- **Day/night cycle**: each sector moves through day, golden hour, dusk, night and dawn.

### Weapons (collect again to level up to LV3)

| | Weapon | Notes |
| --- | --- | --- |
| **V** | Vulcan cannon | Rapid twin cannons; LV3 adds angled streams |
| **S** | Scatter gun | 3/5/7-way fan |
| **H** | Seeker missiles | Homing missiles plus a support cannon |
| **L** | Photon laser | Continuous piercing beam, wider and stronger per level |

### Power-ups

| | Power-up | Effect |
| --- | --- | --- |
| **Ω** | Shield | 10 s of invulnerability; bounce off banks and ram enemies |
| **F** | Fuel cell | Instantly fills the tank |
| **B** | Nova bomb | +1 screen-clearing bomb (shockwave also erases enemy bullets) |
| **T** | Time warp | Slows enemies and their bullets for 6 s |
| **O** | Overdrive | Double fire rate and extra damage for 8 s |
| **+1** | Extra life | One more ship |

Enemies sometimes drop power-ups, and longer combos make drops more likely.

## Under the hood

- `src/river.js`: deterministic procedural river (meanders, islands, narrow passages, bridge and boss zones)
- `src/terrain.js`: chunked low-poly terrain with flat-shaded vertex colours and instanced trees, rocks and villages
- `src/water.js`: custom water shader (waves, fresnel, sun glints, shoreline foam driven by a river data texture)
- `src/environment.js`: sky dome, lighting, fog and time-of-day palettes
- `src/effects.js`: GPU point-sprite particles, debris, shockwaves and flash lights
- `src/entities.js`: enemies, fuel depots, bridges, bosses and power-ups
- `src/weapons.js`: player weapons and nova bomb
- `src/audio.js`: fully synthesized WebAudio SFX and procedural music
- Post-processing: Unreal bloom + ACES tone mapping

Debug URL flags: `?god` (invulnerable), `?seed=123` (fixed river layout).

## License

MIT
