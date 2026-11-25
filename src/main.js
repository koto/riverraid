import './style.css';
import { Game } from './game.js';

const canvas = document.getElementById('game');
let game;
try {
  game = new Game(canvas);
} catch (err) {
  console.error(err);
  document.getElementById('menu').innerHTML =
    '<div class="panel"><h2>WebGL unavailable</h2><p>Your browser could not start the 3D renderer. Try a recent Chrome, Edge, Firefox or Safari.</p></div>';
  throw err;
}

const on = (id, fn) =>
  document.getElementById(id).addEventListener('click', (e) => {
    e.preventDefault();
    game.audio.init();
    fn();
  });

on('btn-start', () => game.startGame());
on('btn-resume', () => game.pause(false));
on('btn-quit', () => game.toMenu());
on('btn-restart', () => game.startGame());
on('btn-menu', () => game.toMenu());
on('btn-pause', () => game.pause(true));
on('opt-sound', () => {
  game.audio.init();
  document.getElementById('opt-sound').textContent = game.audio.toggleMute() ? 'SOUND: OFF' : 'SOUND: ON';
});
on('opt-music', () => {
  document.getElementById('opt-music').textContent = game.audio.toggleMusic() ? 'MUSIC: ON' : 'MUSIC: OFF';
});
document.getElementById('opt-sound').textContent = game.audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
document.getElementById('opt-music').textContent = game.audio.musicOn ? 'MUSIC: ON' : 'MUSIC: OFF';
document.getElementById('menu-hi').textContent = game.hiscore.toLocaleString('en-US');

// touch buttons
const tb = (id, fn) =>
  document.getElementById(id).addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
    { passive: false }
  );
tb('t-bomb', () => game.weapons.launchBomb());
tb('t-weapon', () => {
  const p = game.player;
  const owned = ['vulcan', 'spread', 'homing', 'laser'].filter((w) => p.weapons[w]);
  p.current = owned[(owned.indexOf(p.current) + 1) % owned.length];
});
if (game.input.isTouch) document.body.classList.add('touch');

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause(true);
});
