const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ui = {
  mainMenu: document.getElementById('mainMenu'),
  charMenu: document.getElementById('charMenu'),
  pauseMenu: document.getElementById('pauseMenu'),
  gameOverMenu: document.getElementById('gameOverMenu'),
  touchHint: document.getElementById('touchHint'),
  jumpZone: document.getElementById('jumpZone'),
  startBtn: document.getElementById('startBtn'),
  speedModeBtn: document.getElementById('speedModeBtn'),
  hardModeBtn: document.getElementById('hardModeBtn'),
  charSelectBtn: document.getElementById('charSelectBtn'),
  backMenuBtn: document.getElementById('backMenuBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  restartBtn: document.getElementById('restartBtn'),
  toMainMenuBtn: document.getElementById('toMainMenuBtn'),
  dashBtn: document.getElementById('dashBtn'),
  smashBtn: document.getElementById('smashBtn'),
  hudScore: document.getElementById('hudScore'),
  hudHighScore: document.getElementById('hudHighScore'),
  comboBadge: document.getElementById('comboBadge'),
  achievementToast: document.getElementById('achievementToast'),
  gameOverScore: document.getElementById('gameOverScore'),
  gameOverHighScore: document.getElementById('gameOverHighScore'),
  charCards: document.querySelectorAll('.char-card'),
};
const State = { MENU: 'MENU', SELECT: 'SELECT', RUNNING: 'RUNNING', CRASHING: 'CRASHING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
const virtual = { width: 1080, height: 720, scale: 1 };
const pools = { obstacles: [], lasers: [], particles: [], ghosts: [] };
const active = { obstacles: [], lasers: [], particles: [], ghosts: [] };
const images = {};
const farStars = Array.from({ length: 74 }, () => ({
  x: Math.random(), y: Math.random() * 0.72, size: 0.6 + Math.random() * 1.8, alpha: 0.25 + Math.random() * 0.55,
}));
class Particle {
  constructor() { this.active = false; }
  reset(x, y, options = {}) {
    Object.assign(this, { active: true, x, y, dx: 0, dy: 0, size: 4, life: 0.5, maxLife: 0.5, alpha: 1, color: '#00ffff', gravity: 0, shrink: 0, grow: 0, round: false, ring: false, lineWidth: 2 }, options);
    this.maxLife = this.life;
    this.baseAlpha = this.alpha;
    return this;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.dx * dt;
    this.y += this.dy * dt;
    this.dy += this.gravity * dt;
    this.alpha = this.baseAlpha * Math.max(0, this.life / this.maxLife);
    if (this.shrink) this.size = Math.max(0, this.size - this.shrink * dt);
    if (this.grow) this.size += this.grow * dt;
    return this.life > 0;
  }
}
const characters = {
  runner: {
    id: 'runner',
    name: 'Neon Runner',
    imagePath: 'assets/graphics/characters/runner.svg',
    color: '#00ffff',
    jumpForce: -760,
    speedScale: 1.15,
    maxJumps: 2,
    ability: { name: 'Dash', key: 'KeyD', baseCooldown: 3800, duration: 0.2 },
  },
  techno_samurai: {
    id: 'techno_samurai',
    name: 'Techno-Samurai',
    imagePath: 'assets/graphics/characters/techno_samurai.svg',
    color: '#ff2ec4',
    jumpForce: -940,
    speedScale: 0.92,
    maxJumps: 2,
    ability: { name: 'Smash', key: 'KeyF', baseCooldown: 4200, duration: 0.32 },
  },
};
const player = {
  x: 180,
  y: 0,
  width: 64,
  height: 96,
  vy: 0,
  gravity: 2600,
  grounded: false,
  jumps: 0,
  isDashing: false,
  dashUntil: 0,
  invincibleUntil: 0,
  abilityLastUsed: 0,
  abilityCooldown: 3800,
  trailTimer: 0,
  runTime: 0,
  landingSquash: 0,
  jumpBufferUntil: 0,
  visible: true,
};
const state = {
  current: State.MENU,
  score: 0,
  highScore: Number.parseInt(localStorage.getItem('highScore') || '0', 10) || 0,
  speed: 360,
  lastTime: 0,
  selectedCharacter: 'runner',
  backgroundFactor: 0,
  isSpeedMode: false,
  isHardMode: false,
  combo: 1,
  bestCombo: 1,
  comboTimer: 0,
  toastTimer: 0,
  screenShake: { until: 0, duration: 0, intensity: 0 },
  farOffset: 0,
  nearOffset: 0,
  crashUntil: 0,
  achievements: [],
};
const ambient = { groundY: virtual.height - 128, lastSpawn: 0, lastLaser: 0 };
const audioContext = window.AudioContext ? new window.AudioContext() : null;
function getViewportMode() {
  return window.innerWidth <= window.innerHeight ? 'portrait' : 'landscape';
}
function loadImages() {
  Object.values(characters).forEach((character) => {
    const image = new Image();
    image.src = character.imagePath;
    image.onload = () => { images[character.id] = { image, loaded: true }; };
    image.onerror = () => { images[character.id] = { image: null, loaded: false }; };
  });
}
function setState(next) {
  state.current = next;
  ui.mainMenu.classList.toggle('hidden', next !== State.MENU);
  ui.charMenu.classList.toggle('hidden', next !== State.SELECT);
  ui.pauseMenu.classList.toggle('hidden', next !== State.PAUSED);
  ui.gameOverMenu.classList.toggle('hidden', next !== State.GAMEOVER);
}
function obtain(pool, factory) {
  return pool.length ? pool.pop() : factory();
}
function release(pool, item) {
  item.active = false;
  pool.push(item);
}
function resetPools() {
  Object.keys(active).forEach((key) => {
    active[key].forEach((item) => item.active = false);
    pools[key].length = 0;
    active[key].length = 0;
  });
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function triggerScreenShake(duration = 130, intensity = 4) {
  const now = performance.now();
  state.screenShake = {
    until: Math.max(state.screenShake.until, now + duration),
    duration: Math.max(state.screenShake.duration, duration),
    intensity: Math.max(state.screenShake.intensity, intensity),
  };
}
function updateSize() {
  const ratio = window.devicePixelRatio || 1;
  const mode = getViewportMode();
  virtual.width = mode === 'portrait' ? 720 : 1080;
  virtual.height = mode === 'portrait' ? 1280 : 720;
  ambient.groundY = virtual.height - 128;
  const scale = Math.min(window.innerWidth / virtual.width, window.innerHeight / virtual.height);
  virtual.scale = scale;
  const cssWidth = Math.floor(virtual.width * scale);
  const cssHeight = Math.floor(virtual.height * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
}
function setCharacter(characterId) {
  if (!characters[characterId]) return;
  state.selectedCharacter = characterId;
  ui.charCards.forEach((card) => card.classList.toggle('selected', card.dataset.char === characterId));
  player.abilityCooldown = characters[characterId].ability.baseCooldown;
}
function startGame() {
  state.current = State.RUNNING;
  state.score = 0;
  state.speed = 360;
  state.spawnAt = 0;
  state.laserAt = 0;
  state.backgroundFactor = 0;
  state.combo = 1;
  state.bestCombo = 1;
  state.comboTimer = 0;
  state.toastTimer = 0;
  state.screenShake = { until: 0, duration: 0, intensity: 0 };
  state.farOffset = 0;
  state.nearOffset = 0;
  state.crashUntil = 0;
  state.achievements = [];
  ui.comboBadge.textContent = 'COMBO x1';
  ui.achievementToast.classList.add('hidden');
  ambient.lastSpawn = performance.now();
  ambient.lastLaser = performance.now();
  setCharacter(state.selectedCharacter);
  resetPools();
  player.x = 180;
  player.y = ambient.groundY - player.height;
  player.vy = 0;
  player.grounded = true;
  player.jumps = 0;
  player.isDashing = false;
  player.dashUntil = 0;
  player.invincibleUntil = 0;
  player.abilityLastUsed = performance.now() - player.abilityCooldown;
  player.trailTimer = 0;
  player.runTime = 0;
  player.landingSquash = 0;
  player.jumpBufferUntil = 0;
  player.visible = true;
  const isPortrait = virtual.height > virtual.width;
  player.x = isPortrait ? (virtual.width - player.width) / 2 : 180;
  setState(State.RUNNING);
  state.lastTime = performance.now();
}
function endGame() {
  state.current = State.GAMEOVER;
  if (Math.floor(state.score) > state.highScore) {
    state.highScore = Math.floor(state.score);
    localStorage.setItem('highScore', String(state.highScore));
  }
  ui.gameOverScore.textContent = `Skor: ${Math.floor(state.score)}`;
  ui.gameOverHighScore.textContent = `Yüksek Skor: ${state.highScore}`;
  setState(State.GAMEOVER);
}
function pauseGame() {
  if (state.current !== State.RUNNING) return;
  setState(State.PAUSED);
}
function resumeGame() {
  if (state.current !== State.PAUSED) return;
  state.lastTime = performance.now();
  setState(State.RUNNING);
}
function playSound(type) {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const wave = type === 'dash' ? 'sine' : type === 'smash' ? 'square' : type === 'crash' ? 'sawtooth' : 'triangle';
  const freq = type === 'dash' ? 640 : type === 'smash' ? 430 : type === 'crash' ? 180 : type === 'score' ? 880 : 320;
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);
  if (type === 'dash') osc.frequency.exponentialRampToValueAtTime(980, now + 0.16);
  else if (type === 'smash') osc.frequency.exponentialRampToValueAtTime(620, now + 0.2);
  else if (type === 'crash') osc.frequency.linearRampToValueAtTime(120, now + 0.24);
  else if (type === 'score') osc.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
  else osc.frequency.linearRampToValueAtTime(420, now + 0.2);
  gain.gain.setValueAtTime(type === 'crash' ? 0.18 : 0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}
function showToast(message) {
  ui.achievementToast.textContent = message;
  ui.achievementToast.classList.remove('hidden');
  state.toastTimer = 1.8;
}
function updateToast(dt) {
  if (state.toastTimer <= 0) return;
  state.toastTimer -= dt;
  if (state.toastTimer <= 0) {
    ui.achievementToast.classList.add('hidden');
  }
}
function triggerCombo(delta) {
  state.combo = Math.max(1, state.combo + delta);
  state.comboTimer = 1.6;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  ui.comboBadge.textContent = `COMBO x${state.combo}`;
  if (state.combo >= 3 && state.combo % 3 === 0) {
    showToast(`COMBO x${state.combo}`);
  }
}
function unlockAchievement(id, label, message) {
  if (state.achievements.includes(id)) return;
  state.achievements.push(id);
  showToast(message);
  playSound('score');
}
function checkAchievements() {
  const score = Math.floor(state.score);
  if (score >= 80 && !state.achievements.includes('pulse')) unlockAchievement('pulse', 'First Pulse', 'FIRST PULSE');
  if (score >= 220 && !state.achievements.includes('neon')) unlockAchievement('neon', 'Neon Drift', 'NEON DRIFT');
  if (score >= 500 && !state.achievements.includes('cyber')) unlockAchievement('cyber', 'Cyber Rush', 'CYBER RUSH');
  if (state.bestCombo >= 5 && !state.achievements.includes('combo')) unlockAchievement('combo', 'Combo Breaker', 'COMBO BREAKER');
  if (state.isHardMode && score >= 300 && !state.achievements.includes('hardcore')) unlockAchievement('hardcore', 'Hardcore', 'HARDCORE');
}
function getPointerPosition(event) {
  const touch = event.touches && event.touches[0];
  const clientX = touch ? touch.clientX : event.clientX;
  const clientY = touch ? touch.clientY : event.clientY;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * virtual.width;
  const y = ((clientY - rect.top) / rect.height) * virtual.height;
  return { x, y };
}
function attemptJump() {
  if (state.current !== State.RUNNING) return;
  player.jumpBufferUntil = performance.now() + 120;
  consumeJump();
}
function consumeJump() {
  if (player.jumps >= characters[state.selectedCharacter].maxJumps) return;
  player.vy = characters[state.selectedCharacter].jumpForce;
  player.grounded = false;
  player.jumps += 1;
  player.jumpBufferUntil = 0;
  playSound('jump');
}
function performAbility() {
  if (state.current !== State.RUNNING) return;
  const now = performance.now();
  if (now - player.abilityLastUsed < player.abilityCooldown) return;
  player.abilityLastUsed = now;
  if (state.selectedCharacter === 'runner') {
    player.isDashing = true;
    player.dashUntil = now + characters.runner.ability.duration * 1000;
    player.invincibleUntil = player.dashUntil;
    player.trailTimer = 0;
    playSound('dash');
    spawnAbilityBurst('#00ffff', 1);
    triggerScreenShake(100, 3);
    triggerCombo(1);
    return;
  }
  triggerScreenShake(130, 4);
  playSound('smash');
  spawnAbilityBurst('#ff2ec4', 1.35);
  triggerCombo(1);
  eliminateNearest(2);
}
function eliminateNearest(count) {
  const obstacles = [...active.obstacles, ...active.lasers];
  obstacles.sort((a, b) => Math.abs((a.x + a.width / 2) - (player.x + player.width / 2)) - Math.abs((b.x + b.width / 2) - (player.x + player.width / 2)));
  obstacles.slice(0, count).forEach((item) => {
    if (item.type === 'LASER') {
      const index = active.lasers.indexOf(item);
      if (index >= 0) active.lasers.splice(index, 1);
      release(pools.lasers, item);
    } else {
      spawnParticles(item.x + item.width / 2, item.y + item.height / 2, item.color);
      const index = active.obstacles.indexOf(item);
      if (index >= 0) active.obstacles.splice(index, 1);
      release(pools.obstacles, item);
    }
    triggerCombo(1);
  });
}
function spawnObstacle() {
  const obstacle = obtain(pools.obstacles, () => ({
    active: true,
    type: 'SPIKE',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    color: '#0ef',
    phase: 0,
    fromCenter: false,
    spawned: 0,
    amplitude: 0,
    oscillating: false,
  }));
  const floor = ambient.groundY;
  const hard = state.isHardMode;
  const obstacleType = hard && Math.random() < 0.16 ? 'HBAR' : 'VERT';
  // Her engel, seçili karakterin gerçek sıçrama yüksekliğine göre üretilir.
  const jumpHeight = (characters[state.selectedCharacter].jumpForce ** 2) / (2 * player.gravity);
  const safeHeight = Math.min(player.height * 0.78, jumpHeight * 0.58);
  
  obstacle.active = true;
  obstacle.fromCenter = false;
  obstacle.spawned = performance.now();
  obstacle.oscillating = false;
  obstacle.amplitude = 0;
  obstacle.phase = 0;
  
  if (obstacleType === 'VERT') {
    obstacle.x = virtual.width + 100;
    
    const scoreLevel = Math.min(Math.floor(state.score / 30), 5);
    if (scoreLevel < 2) {
      obstacle.type = 'SPIKE';
      obstacle.width = hard ? 50 : 42;
      obstacle.height = Math.round(safeHeight * (hard ? 0.92 : 0.78));
      obstacle.y = floor - obstacle.height;
      obstacle.color = '#ff1e72';
    } else if (scoreLevel < 4) {
      obstacle.type = 'MACBOOK';
      obstacle.width = hard ? 88 : 76;
      obstacle.height = Math.round(safeHeight * (hard ? 0.9 : 0.76));
      obstacle.y = floor - obstacle.height;
      obstacle.color = '#8f3eff';
    } else {
      obstacle.type = 'ALGO';
      obstacle.width = hard ? 102 : 88;
      obstacle.height = Math.round(safeHeight * (hard ? 0.88 : 0.72));
      obstacle.y = floor - obstacle.height - 6;
      obstacle.color = '#ffba00';
    }
  } else if (obstacleType === 'HBAR') {
    obstacle.type = 'HBAR';
    obstacle.x = virtual.width + 110;
    obstacle.width = 88 + Math.random() * 18;
    obstacle.height = 20;
    obstacle.y = floor - obstacle.height;
    obstacle.color = '#00ff88';
  }
  
  active.obstacles.push(obstacle);
}
function spawnLaser() {
  const laser = obtain(pools.lasers, () => ({ active: true, type: 'LASER', x: 0, y: 0, width: 0, length: 0, phase: 0, color: '#ff0055' }));
  laser.active = true;
  laser.x = 80 + Math.random() * (virtual.width - 260);
  laser.width = state.isHardMode ? 104 + Math.random() * 80 : 80 + Math.random() * 120;
  laser.length = state.isHardMode ? 170 + Math.random() * 90 : 130 + Math.random() * 64;
  laser.y = 0;
  laser.phase = Math.random() * Math.PI * 2;
  active.lasers.push(laser);
}
function spawnParticles(x, y, color) {
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const particle = obtain(pools.particles, () => new Particle());
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 120;
    particle.reset(x, y, { dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed - 40, size: 4 + Math.random() * 4, life: 0.62 + Math.random() * 0.28, color, gravity: 400, shrink: 2 });
    active.particles.push(particle);
  }
}
function spawnLandingParticles() {
  for (let i = 0; i < 6; i += 1) {
    const direction = i < 3 ? -1 : 1;
    const particle = obtain(pools.particles, () => new Particle());
    particle.reset(player.x + player.width * (0.3 + Math.random() * 0.4), ambient.groundY - 4, {
      dx: direction * (75 + Math.random() * 100), dy: -(35 + Math.random() * 75), size: 3 + Math.random() * 3,
      life: 0.28 + Math.random() * 0.12, color: '#00eaff', gravity: 330, shrink: 7, round: true,
    });
    active.particles.push(particle);
  }
  spawnPulseWave(player.x + player.width / 2, ambient.groundY - 2, '#00eaff', 16, 145, 0.22);
}
function spawnPulseWave(x, y, color, size = 18, grow = 180, life = 0.3) {
  const wave = obtain(pools.particles, () => new Particle());
  wave.reset(x, y, { size, life, color, alpha: 0.8, grow, ring: true, lineWidth: 2 });
  active.particles.push(wave);
}
function spawnAbilityBurst(color, strength) {
  const x = player.x + player.width / 2;
  const y = player.y + player.height * 0.55;
  spawnPulseWave(x, y, color, 20, 260 * strength, 0.24);
  for (let i = 0; i < 9; i += 1) {
    const particle = obtain(pools.particles, () => new Particle());
    const angle = Math.random() * Math.PI * 2;
    const speed = (110 + Math.random() * 140) * strength;
    particle.reset(x, y, { dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, size: 3 + Math.random() * 3, life: 0.24 + Math.random() * 0.12, color, shrink: 8 });
    active.particles.push(particle);
  }
}
function spawnShatterParticles() {
  for (let i = 0; i < 20; i += 1) {
    const particle = obtain(pools.particles, () => new Particle());
    const angle = Math.random() * Math.PI * 2;
    const speed = 170 + Math.random() * 260;
    particle.reset(player.x + player.width / 2, player.y + player.height / 2, {
      dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, size: 5 + Math.random() * 5,
      life: 0.38 + Math.random() * 0.14, color: '#00f6ff', gravity: 90, shrink: 13,
    });
    active.particles.push(particle);
  }
}
function spawnAmbientParticles() {
  const count = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i += 1) {
    const particle = obtain(pools.particles, () => new Particle());
    particle.reset(40 + Math.random() * (virtual.width - 80), 40 + Math.random() * (virtual.height - 140), {
      dx: (Math.random() - 0.5) * 140, dy: (Math.random() - 0.5) * 140, size: 2 + Math.random() * 4,
      life: 0.9 + Math.random() * 0.8, alpha: 0.75, color: state.isHardMode ? '#ff2ec4' : '#00ffff',
    });
    active.particles.push(particle);
  }
}
function spawnGhost() {
  const ghost = obtain(pools.ghosts, () => ({ active: true, x: 0, y: 0, width: 0, height: 0, alpha: 1, life: 0.22 }));
  ghost.active = true;
  ghost.x = player.x;
  ghost.y = player.y;
  ghost.width = player.width;
  ghost.height = player.height;
  ghost.alpha = 0.78;
  ghost.life = 0.22;
  active.ghosts.push(ghost);
}
function updateEntities(dt) {
  const speedBoost = player.isDashing ? 240 : 0;
  const baseSpeed = state.speed * characters[state.selectedCharacter].speedScale + speedBoost;
  const shift = baseSpeed * dt;
  const now = performance.now();
  for (let i = active.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = active.obstacles[i];
    const elapsedMs = now - obstacle.spawned;
    
    if (obstacle.type === 'HBAR' || obstacle.type === 'HTOP') {
      if (obstacle.type === 'HBAR') {
        obstacle.x -= shift * 1.1;
      } else {
        obstacle.y += shift * 0.6;
      }
      if (obstacle.oscillating) {
        const osc = Math.sin(elapsedMs * 0.008) * obstacle.amplitude;
        if (obstacle.type === 'HBAR') {
          obstacle.y = obstacle.y + osc * dt * 0.4;
        } else {
          obstacle.x = obstacle.x + osc * dt * 0.3;
        }
      }
      if (obstacle.x + obstacle.width < -140 || obstacle.y > virtual.height + 100) {
        release(pools.obstacles, obstacle);
        active.obstacles.splice(i, 1);
      }
    } else {
      obstacle.x -= shift;
      if (obstacle.type === 'ALGO') {
        obstacle.y = ambient.groundY - obstacle.height - 6 + Math.sin(now * 0.004 + obstacle.phase) * 22;
      } else if (obstacle.oscillating) {
        const osc = Math.sin(elapsedMs * 0.007) * obstacle.amplitude;
        obstacle.y = (ambient.groundY - obstacle.height) + osc;
      }
      if (obstacle.x + obstacle.width < -120) {
        release(pools.obstacles, obstacle);
        active.obstacles.splice(i, 1);
      }
    }
  }
  for (let i = active.lasers.length - 1; i >= 0; i -= 1) {
    const laser = active.lasers[i];
    laser.x -= shift * 1.08;
    laser.phase += dt * 2;
    laser.length = 130 + Math.sin(laser.phase) * 36;
    if (laser.x + laser.width < -140) {
      release(pools.lasers, laser);
      active.lasers.splice(i, 1);
    }
  }
  const wasAirborne = !player.grounded;
  const landingVelocity = player.vy;
  if (!player.grounded) {
    player.vy += player.gravity * dt;
  }
  player.y += player.vy * dt;
  const ground = ambient.groundY - player.height;
  if (player.y >= ground) {
    player.y = ground;
    player.vy = 0;
    player.grounded = true;
    player.jumps = 0;
    if (wasAirborne && landingVelocity > 180) {
      spawnLandingParticles();
      player.landingSquash = 1;
    }
    if (now <= player.jumpBufferUntil) consumeJump();
  }
  if (player.isDashing && now >= player.dashUntil) { player.isDashing = false; }
  if (player.isDashing) {
    player.trailTimer -= dt;
    if (player.trailTimer <= 0) {
      player.trailTimer = 0.045;
      spawnGhost();
    }
  }
  for (let i = active.ghosts.length - 1; i >= 0; i -= 1) {
    const ghost = active.ghosts[i];
    ghost.life -= dt;
    ghost.alpha = Math.max(0, ghost.life / 0.22);
    if (ghost.life <= 0) {
      release(pools.ghosts, ghost);
      active.ghosts.splice(i, 1);
    }
  }
  for (let i = active.particles.length - 1; i >= 0; i -= 1) {
    const particle = active.particles[i];
    if (!particle.update(dt)) {
      release(pools.particles, particle);
      active.particles.splice(i, 1);
    }
  }
}
function spawnLogic(now) {
  const hard = state.isHardMode;
  const scoreFactor = Math.min(state.score / 900, 1.2);
  const timeSinceLastSpawn = (now - ambient.lastSpawn) / 1000;
  const emptyPressure = Math.min(0.42, Math.max(0, timeSinceLastSpawn - 1.3) / 2.4);
  const minimumGap = virtual.height > virtual.width ? 1.05 : 0.9;
  const interval = hard
    ? Math.max(minimumGap, 1.26 - scoreFactor * 0.24 - emptyPressure * 0.08)
    : Math.max(minimumGap + 0.14, 1.35 - Math.min(state.score / 1000, 0.35) - emptyPressure * 0.08);
  if (now - ambient.lastSpawn >= interval * 1000) {
    spawnObstacle();
    ambient.lastSpawn = now;
  }
  if (Math.random() < 0.09 + state.backgroundFactor * 0.05 + emptyPressure * 0.04) {
    spawnAmbientParticles();
  }
  if (state.score > 40) {
    const base = hard ? 0.82 : 1.8;
    const laserInterval = Math.max(0.35, base - Math.min((state.score - 40) / 500, 1.1) * 0.78);
    if (now - ambient.lastLaser >= laserInterval * 1000) {
      spawnLaser();
      if (hard && Math.random() < 0.6 + emptyPressure * 0.15) spawnLaser();
      ambient.lastLaser = now;
    } else if (Math.random() < 0.008 + emptyPressure * 0.02) {
      spawnLaser();
    }
  }
}
function intersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function getObstacleHitbox(obstacle) {
  if (obstacle.type === 'SPIKE') {
    // Üçgenin boş köşeleri vurmaz; hitbox görünür dolu çekirdeği takip eder.
    return {
      x: obstacle.x + obstacle.width * 0.23,
      y: obstacle.y + obstacle.height * 0.36,
      width: obstacle.width * 0.54,
      height: obstacle.height * 0.64,
    };
  }
  return { x: obstacle.x + 5, y: obstacle.y + 3, width: Math.max(1, obstacle.width - 10), height: Math.max(1, obstacle.height - 3) };
}
function checkCollision() {
  const now = performance.now();
  if (now < player.invincibleUntil) return;
  const playerBox = { x: player.x + 10, y: player.y + 6, width: player.width - 20, height: player.height - 12 };
  for (let i = 0; i < active.obstacles.length; i += 1) {
    if (intersect(playerBox, getObstacleHitbox(active.obstacles[i]))) { beginCrash(); return; }
  }
  for (let i = 0; i < active.lasers.length; i += 1) {
    const laser = active.lasers[i];
    const laserBox = { x: laser.x, y: laser.y, width: laser.width, height: laser.length };
    if (intersect(playerBox, laserBox)) { beginCrash(); return; }
  }
}
function beginCrash() {
  if (state.current !== State.RUNNING) return;
  player.visible = false;
  spawnShatterParticles();
  triggerScreenShake(150, 5);
  playSound('crash');
  state.crashUntil = performance.now() + 540;
  state.current = State.CRASHING;
}
function update(dt) {
  const scoreRate = state.isHardMode ? 24 : state.isSpeedMode ? 18 : 14;
  const difficultyBoost = state.isHardMode ? 140 : state.isSpeedMode ? 130 : 0;
  state.score += dt * scoreRate;
  state.score = Math.min(state.score, 999999);
  state.speed = 340 + Math.log1p(state.score) * 34 + difficultyBoost;
  state.backgroundFactor = Math.min(state.score / 650, 1);
  const flowSpeed = state.speed * characters[state.selectedCharacter].speedScale;
  state.farOffset = (state.farOffset + flowSpeed * 0.1 * dt) % virtual.width;
  state.nearOffset = (state.nearOffset + flowSpeed * 0.3 * dt) % 72;
  player.runTime += dt * (player.grounded ? 12 : 4);
  player.landingSquash = Math.max(0, player.landingSquash - dt * 8);
  player.abilityCooldown = Math.max(characters[state.selectedCharacter].ability.baseCooldown - Math.floor(state.score / 220) * 140, 1200);
  checkAchievements();
  spawnLogic(performance.now());
  updateEntities(dt);
  checkCollision();
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = Math.max(1, state.combo - 1);
      ui.comboBadge.textContent = `COMBO x${state.combo}`;
    }
  }
  updateToast(dt);
}
function updateCrash(dt) {
  updateEntities(dt);
  if (performance.now() >= state.crashUntil) endGame();
}
function drawBackground() {
  const danger = state.backgroundFactor;
  const r = Math.floor(4 + danger * 168);
  const g = Math.floor(12 + danger * 18);
  const b = Math.floor(48 - danger * 32);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, virtual.width, virtual.height);
  // Uzak yıldızlar ana akışın yalnızca %10'u hızında hareket eder.
  ctx.save();
  farStars.forEach((star) => {
    const x = (star.x * virtual.width - state.farOffset + virtual.width) % virtual.width;
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = '#bffcff';
    const streak = state.current === State.RUNNING ? 1 + state.speed / 170 : 1;
    ctx.fillRect(x, star.y * ambient.groundY, star.size * streak, star.size);
  });
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#050916';
  ctx.fillRect(0, ambient.groundY, virtual.width, virtual.height - ambient.groundY);
  ctx.restore();
  // Yakın katman: ufuk noktasına kaçan grid, %30 hızda akar.
  const horizon = ambient.groundY - 54;
  const vanishingX = virtual.width * 0.56;
  ctx.save();
  ctx.strokeStyle = state.isHardMode ? 'rgba(255,46,196,0.3)' : 'rgba(14,238,255,0.28)';
  ctx.lineWidth = 1;
  for (let i = -11; i <= 11; i += 1) {
    ctx.beginPath();
    ctx.moveTo(vanishingX, horizon);
    ctx.lineTo(vanishingX + i * virtual.width * 0.13, virtual.height);
    ctx.stroke();
  }
  const gridPhase = state.nearOffset / 72;
  for (let i = 0; i < 12; i += 1) {
    const progress = (i / 12 + gridPhase) % 1;
    const eased = progress * progress;
    const y = horizon + eased * (virtual.height - horizon);
    ctx.globalAlpha = 0.18 + eased * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(virtual.width, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(14,238,255,0.18)';
  ctx.fillRect(0, ambient.groundY, virtual.width, 12);
  ctx.restore();
  const pulse = 0.2 + Math.sin(performance.now() * 0.0018) * 0.08;
  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.12;
  ctx.fillStyle = state.isHardMode ? '#ff2ec4' : '#00ffff';
  ctx.beginPath();
  ctx.arc(virtual.width * 0.8, ambient.groundY * 0.55, 40 + pulse * 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.14 + pulse * 0.08;
  ctx.strokeStyle = state.isHardMode ? '#ff2ec4' : '#00ffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(virtual.width * 0.12, ambient.groundY * 0.65);
  ctx.quadraticCurveTo(virtual.width * 0.35, ambient.groundY * 0.5 - pulse * 60, virtual.width * 0.58, ambient.groundY * 0.55 + pulse * 40);
  ctx.quadraticCurveTo(virtual.width * 0.74, ambient.groundY * 0.6 + pulse * 20, virtual.width * 0.92, ambient.groundY * 0.7);
  ctx.stroke();
  ctx.restore();
  // Hafif vignette, arayüzü kirletmeden odağı oyun alanında tutar.
  const vignette = ctx.createRadialGradient(virtual.width * 0.52, virtual.height * 0.48, virtual.height * 0.12, virtual.width * 0.52, virtual.height * 0.48, virtual.width * 0.78);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, virtual.width, virtual.height);
}
function drawGhosts() {
  const img = images[state.selectedCharacter];
  active.ghosts.forEach((ghost) => {
    ctx.save();
    ctx.globalAlpha = ghost.alpha * 0.45;
    if (img && img.loaded) ctx.drawImage(img.image, ghost.x - 8, ghost.y - 4, ghost.width + 16, ghost.height + 16);
    else {
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
    }
    ctx.restore();
  });
}
function drawThreatIndicators() {
  const playerFront = player.x + player.width;
  active.obstacles.forEach((obstacle) => {
    const distance = obstacle.x - playerFront;
    if (distance <= 0 || distance > 330) return;
    const urgency = 1 - distance / 330;
    const pulse = 0.45 + Math.sin(performance.now() * 0.016) * 0.2;
    const x = obstacle.x + obstacle.width / 2;
    ctx.save();
    ctx.globalAlpha = urgency * pulse;
    ctx.strokeStyle = obstacle.color;
    ctx.shadowColor = obstacle.color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, obstacle.y - 20, 8 + urgency * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, obstacle.y - 8);
    ctx.lineTo(x, ambient.groundY - 10);
    ctx.stroke();
    ctx.restore();
  });
}
function drawObstacles() {
  active.obstacles.forEach((obstacle) => {
    ctx.save();
    ctx.fillStyle = obstacle.color;
    
    if (obstacle.type === 'SPIKE') {
      // Gölge maliyetini yalnızca kırmızı üçgen engel çizilirken ödüyoruz.
      ctx.shadowColor = '#ff1e72';
      ctx.shadowBlur = obstacle.fromCenter ? 28 : 16;
      ctx.beginPath();
      ctx.moveTo(obstacle.x, obstacle.y + obstacle.height);
      ctx.lineTo(obstacle.x + obstacle.width / 2, obstacle.y);
      ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height);
      ctx.closePath();
      ctx.fill();
    } else if (obstacle.type === 'MACBOOK') {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#081018';
      ctx.fillRect(obstacle.x + 10, obstacle.y + 10, obstacle.width - 20, obstacle.height - 24);
      ctx.fillStyle = '#0ef';
      ctx.fillRect(obstacle.x + 16, obstacle.y + 18, obstacle.width - 32, 10);
    } else if (obstacle.type === 'ALGO') {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#04080f';
      ctx.fillRect(obstacle.x + 12, obstacle.y + 18, obstacle.width - 24, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('ALGO', obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2 + 8);
    } else if (obstacle.type === 'HBAR') {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(obstacle.x + 8, obstacle.y + 4, obstacle.width - 16, obstacle.height - 8);
      ctx.globalAlpha = 1;
    } else if (obstacle.type === 'HTOP') {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(obstacle.x + 10, obstacle.y);
      ctx.lineTo(obstacle.x + obstacle.width - 10, obstacle.y);
      ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height / 2);
      ctx.lineTo(obstacle.x + obstacle.width - 10, obstacle.y + obstacle.height);
      ctx.lineTo(obstacle.x + 10, obstacle.y + obstacle.height);
      ctx.lineTo(obstacle.x, obstacle.y + obstacle.height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    if (obstacle.fromCenter && obstacle.type !== 'HBAR' && obstacle.type !== 'HTOP') {
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = obstacle.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(obstacle.x - 6, obstacle.y - 6, obstacle.width + 12, obstacle.height + 12);
    }
    ctx.restore();
  });
}
function drawLasers() {
  active.lasers.forEach((laser) => {
    ctx.save();
    const glow = 'rgba(255,15,85,0.24)';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 20;
    const gradient = ctx.createLinearGradient(laser.x, 0, laser.x + laser.width, 0);
    gradient.addColorStop(0, 'rgba(255,12,122,0.9)');
    gradient.addColorStop(0.5, 'rgba(255,80,120,0.95)');
    gradient.addColorStop(1, 'rgba(255,12,122,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(laser.x, laser.y, laser.width, laser.length);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(laser.x, laser.length - 10, laser.width, 12);
    ctx.restore();
  });
}
function drawPlayer() {
  if (!player.visible) return;
  ctx.save();
  const char = characters[state.selectedCharacter];
  const img = images[char.id];
  const runBob = player.grounded ? Math.sin(player.runTime) * 3 : 0;
  const stretch = clamp(-player.vy / 1800, -0.05, 0.12);
  const squash = player.landingSquash * 0.13;
  const scaleX = 1 + squash - stretch * 0.28;
  const scaleY = 1 + stretch - squash;
  const centerX = player.x + player.width / 2;
  const baseY = player.y + player.height;
  ctx.translate(centerX, baseY + runBob);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-centerX, -baseY);
  // SVG yüklenmese bile okunaklı iki karelik neon bacak ritmi korunur.
  const legSwing = player.grounded ? Math.sin(player.runTime) * 9 : 0;
  ctx.strokeStyle = char.color;
  ctx.shadowColor = char.color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(player.x + player.width * 0.38, player.y + player.height * 0.72);
  ctx.lineTo(player.x + player.width * 0.33 + legSwing, player.y + player.height + 2);
  ctx.moveTo(player.x + player.width * 0.62, player.y + player.height * 0.72);
  ctx.lineTo(player.x + player.width * 0.67 - legSwing, player.y + player.height + 2);
  ctx.stroke();
  if (img && img.loaded) {
    ctx.drawImage(img.image, player.x - 8, player.y - 4, player.width + 16, player.height + 16);
  } else {
    ctx.fillStyle = char.color;
    ctx.shadowColor = char.color;
    ctx.shadowBlur = 22;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
  if (player.isDashing) {
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const y = player.y + 16 + i * 18;
      ctx.beginPath();
      ctx.moveTo(player.x - 72 - i * 12, y);
      ctx.lineTo(player.x - 8, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(player.x - 6, player.y - 6, player.width + 12, player.height + 12);
  }
  ctx.restore();
}
function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  active.particles.forEach((particle) => {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = particle.ring ? 10 : 7;
    if (particle.ring) {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = particle.lineWidth;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (particle.round) {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  });
  ctx.restore();
}
function updateHud() {
  ui.hudScore.textContent = String(Math.max(0, Math.floor(state.score)));
  ui.hudHighScore.textContent = String(state.highScore);
  const now = performance.now();
  const cooldown = Math.max(0, player.abilityCooldown - (now - player.abilityLastUsed));
  const ready = Math.max(0, Math.min(1, 1 - cooldown / player.abilityCooldown));
  ui.dashBtn.style.setProperty('--ready', `${state.selectedCharacter === 'runner' ? ready * 100 : 0}`);
  ui.smashBtn.style.setProperty('--ready', `${state.selectedCharacter === 'techno_samurai' ? ready * 100 : 0}`);
  const abilityEnabled = state.current === State.RUNNING && cooldown <= 0;
  ui.dashBtn.disabled = !abilityEnabled || state.selectedCharacter !== 'runner';
  ui.smashBtn.disabled = !abilityEnabled || state.selectedCharacter !== 'techno_samurai';
  if (window.innerWidth <= 900) {
    ui.jumpZone.classList.toggle('hidden', state.current !== State.RUNNING);
    ui.touchHint.classList.toggle('hidden', state.current !== State.RUNNING);
  } else {
    ui.jumpZone.classList.add('hidden');
    ui.touchHint.classList.add('hidden');
  }
}
function renderCharacterStats() {
  document.querySelectorAll('.stat-bar[data-level]').forEach((bar) => {
    const level = clamp(Number.parseInt(bar.dataset.level, 10) || 0, 0, 5);
    bar.replaceChildren(...Array.from({ length: 5 }, (_, index) => {
      const cell = document.createElement('span');
      cell.className = `stat-cell${index < level ? ' active' : ''}`;
      cell.setAttribute('aria-hidden', 'true');
      return cell;
    }));
  });
}
function tick(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.033);
  state.lastTime = timestamp;
  if (state.current === State.RUNNING) {
    update(dt);
  } else if (state.current === State.CRASHING) {
    updateCrash(dt);
  }
  ctx.save();
  const shakeLeft = state.screenShake.until - timestamp;
  if (shakeLeft > 0) {
    const force = state.screenShake.intensity * clamp(shakeLeft / state.screenShake.duration, 0, 1);
    ctx.translate((Math.random() * 2 - 1) * force, (Math.random() * 2 - 1) * force);
  } else if (state.screenShake.until) {
    state.screenShake = { until: 0, duration: 0, intensity: 0 };
  }
  drawBackground();
  drawGhosts();
  drawLasers();
  drawThreatIndicators();
  drawObstacles();
  drawParticles();
  drawPlayer();
  ctx.restore();
  updateHud();
  requestAnimationFrame(tick);
}
function handlePointerDown(event) {
  if (state.current !== State.RUNNING) return;
  const point = getPointerPosition(event);
  if (point.x <= virtual.width * 0.48) {
    attemptJump();
  } else {
    performAbility();
  }
}
function handleKeyDown(event) {
  if (event.repeat) return;
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    if (state.current === State.RUNNING) attemptJump();
    else if (state.current === State.PAUSED) resumeGame();
    else if (state.current === State.MENU || state.current === State.GAMEOVER) startGame();
    return;
  }
  if (event.code === 'Escape') {
    event.preventDefault();
    if (state.current === State.RUNNING) pauseGame();
    else if (state.current === State.PAUSED) resumeGame();
    return;
  }
  if ((event.code === 'KeyD' && state.selectedCharacter === 'runner') || (event.code === 'KeyF' && state.selectedCharacter === 'techno_samurai')) {
    performAbility();
  }
  if (event.code === 'KeyP') { event.preventDefault(); state.current === State.RUNNING ? pauseGame() : resumeGame(); }
}
function initialize() {
  updateSize();
  renderCharacterStats();
  setCharacter(state.selectedCharacter);
  setState(State.MENU);
  loadImages();
  ui.startBtn.addEventListener('click', () => { state.isSpeedMode = false; state.isHardMode = false; startGame(); });
  ui.speedModeBtn.addEventListener('click', () => { state.isSpeedMode = true; state.isHardMode = false; startGame(); });
  ui.hardModeBtn.addEventListener('click', () => { state.isSpeedMode = false; state.isHardMode = true; startGame(); });
  ui.charSelectBtn.addEventListener('click', () => setState(State.SELECT));
  ui.backMenuBtn.addEventListener('click', () => setState(State.MENU));
  ui.resumeBtn.addEventListener('click', resumeGame);
  ui.restartBtn.addEventListener('click', startGame);
  ui.toMainMenuBtn.addEventListener('click', () => setState(State.MENU));
  ui.dashBtn.addEventListener('click', performAbility);
  ui.smashBtn.addEventListener('click', performAbility);
  ui.charCards.forEach((card) => { card.addEventListener('click', () => setCharacter(card.dataset.char)); });
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('blur', pauseGame);
  window.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', updateSize);
  requestAnimationFrame(tick);
}
initialize();
