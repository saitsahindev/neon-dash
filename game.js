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
  gameOverScore: document.getElementById('gameOverScore'),
  gameOverHighScore: document.getElementById('gameOverHighScore'),
  charCards: document.querySelectorAll('.char-card'),
};
const State = { MENU: 'MENU', SELECT: 'SELECT', RUNNING: 'RUNNING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };
const virtual = { width: 1080, height: 720, scale: 1 };
const pools = { obstacles: [], lasers: [], particles: [], ghosts: [] };
const active = { obstacles: [], lasers: [], particles: [], ghosts: [] };
const images = {};
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
  shakeUntil: 0,
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
};
const ambient = { groundY: virtual.height - 128, lastSpawn: 0, lastLaser: 0 };
const audioContext = window.AudioContext ? new window.AudioContext() : null;
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
function updateSize() {
  const ratio = window.devicePixelRatio || 1;
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
  player.shakeUntil = 0;
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
  osc.type = type === 'dash' ? 'sine' : 'triangle';
  osc.frequency.setValueAtTime(type === 'dash' ? 560 : 180, now);
  if (type === 'dash') osc.frequency.exponentialRampToValueAtTime(920, now + 0.18);
  else osc.frequency.linearRampToValueAtTime(420, now + 0.22);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.22);
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
  player.vy = characters[state.selectedCharacter].jumpForce;
  player.grounded = false;
  player.jumps += 1;
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
    return;
  }
  player.shakeUntil = now + characters.techno_samurai.ability.duration * 1000;
  playSound('smash');
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
  });
}
function spawnObstacle() {
  const obstacle = obtain(pools.obstacles, () => ({ active: true, type: 'SPIKE', x: 0, y: 0, width: 0, height: 0, color: '#0ef', phase: 0 }));
  const floor = ambient.groundY;
  obstacle.active = true;
  obstacle.x = virtual.width + 100;
  const scoreLevel = Math.min(Math.floor(state.score / 40), 4);
  if (scoreLevel < 2) {
    obstacle.type = 'SPIKE';
    obstacle.width = 42;
    obstacle.height = 74;
    obstacle.y = floor - obstacle.height;
    obstacle.color = '#ff1e72';
  } else if (scoreLevel < 4) {
    obstacle.type = 'MACBOOK';
    obstacle.width = 92;
    obstacle.height = 168;
    obstacle.y = floor - obstacle.height;
    obstacle.color = '#8f3eff';
  } else {
    obstacle.type = 'ALGO';
    obstacle.width = 110;
    obstacle.height = 88;
    obstacle.y = floor - obstacle.height - 6;
    obstacle.phase = Math.random() * Math.PI * 2;
    obstacle.color = '#ffba00';
  }
  active.obstacles.push(obstacle);
}
function spawnLaser() {
  const laser = obtain(pools.lasers, () => ({ active: true, type: 'LASER', x: 0, y: 0, width: 0, length: 0, phase: 0, color: '#ff0055' }));
  laser.active = true;
  laser.x = 80 + Math.random() * (virtual.width - 260);
  laser.width = 80 + Math.random() * 120;
  laser.length = 130 + Math.random() * 64;
  laser.y = 0;
  laser.phase = Math.random() * Math.PI * 2;
  active.lasers.push(laser);
}
function spawnParticles(x, y, color) {
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const particle = obtain(pools.particles, () => ({ active: true, x: 0, y: 0, dx: 0, dy: 0, life: 0, alpha: 1, size: 0, color: '#0ef' }));
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 120;
    particle.active = true;
    particle.x = x;
    particle.y = y;
    particle.dx = Math.cos(angle) * speed;
    particle.dy = Math.sin(angle) * speed - 40;
    particle.size = 4 + Math.random() * 4;
    particle.life = 0.62 + Math.random() * 0.28;
    particle.alpha = 1;
    particle.color = color;
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
    obstacle.x -= shift;
    if (obstacle.type === 'ALGO') {
      obstacle.y = ambient.groundY - obstacle.height - 6 + Math.sin(now * 0.004 + obstacle.phase) * 22;
    }
    if (obstacle.x + obstacle.width < -120) {
      release(pools.obstacles, obstacle);
      active.obstacles.splice(i, 1);
    }
  }
  for (let i = active.lasers.length - 1; i >= 0; i -= 1) {
    const laser = active.lasers[i];
    laser.phase += dt * 2;
    laser.length = 130 + Math.sin(laser.phase) * 36;
    if (laser.x + laser.width < -140) {
      release(pools.lasers, laser);
      active.lasers.splice(i, 1);
    }
  }
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
    particle.life -= dt;
    particle.x += particle.dx * dt;
    particle.y += particle.dy * dt;
    particle.dy += 400 * dt;
    particle.alpha = Math.max(0, particle.life / 0.8);
    if (particle.life <= 0) {
      release(pools.particles, particle);
      active.particles.splice(i, 1);
    }
  }
}
function spawnLogic(now) {
  const interval = 1.45 - Math.min(state.score / 1200, 0.75);
  if (now - ambient.lastSpawn >= interval * 1000) {
    spawnObstacle();
    ambient.lastSpawn = now;
  }
  if (state.score > 50) {
    const base = state.isHardMode ? 1.35 : 2.1;
    const laserInterval = base - Math.min((state.score - 50) / 600, 1) * 0.95;
    if (now - ambient.lastLaser >= laserInterval * 1000) {
      spawnLaser();
      ambient.lastLaser = now;
    }
  }
}
function intersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function checkCollision() {
  const now = performance.now();
  if (now < player.invincibleUntil) return;
  const playerBox = { x: player.x + 10, y: player.y + 6, width: player.width - 20, height: player.height - 12 };
  for (let i = 0; i < active.obstacles.length; i += 1) {
    if (intersect(playerBox, active.obstacles[i])) { endGame(); return; }
  }
  for (let i = 0; i < active.lasers.length; i += 1) {
    const laser = active.lasers[i];
    const laserBox = { x: laser.x, y: laser.y, width: laser.width, height: laser.length };
    if (intersect(playerBox, laserBox)) { endGame(); return; }
  }
}
function update(dt) {
  const scoreRate = state.isHardMode ? 20 : state.isSpeedMode ? 18 : 14;
  const difficultyBoost = state.isHardMode ? 52 : state.isSpeedMode ? 130 : 0;
  state.score += dt * scoreRate;
  state.score = Math.min(state.score, 999999);
  state.speed = 340 + Math.log1p(state.score) * 34 + difficultyBoost;
  state.backgroundFactor = Math.min(state.score / 650, 1);
  player.abilityCooldown = Math.max(characters[state.selectedCharacter].ability.baseCooldown - Math.floor(state.score / 250) * 120, 1400);
  spawnLogic(performance.now());
  updateEntities(dt);
  checkCollision();
}
function drawBackground() {
  const danger = state.backgroundFactor;
  const r = Math.floor(4 + danger * 168);
  const g = Math.floor(12 + danger * 18);
  const b = Math.floor(48 - danger * 32);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, virtual.width, virtual.height);
  ctx.save();
  ctx.strokeStyle = 'rgba(14,238,255,0.12)';
  ctx.lineWidth = 1;
  const grid = 72;
  const offset = (performance.now() * 0.02) % grid;
  for (let x = -grid; x < virtual.width + grid; x += grid) { ctx.beginPath(); ctx.moveTo(x + offset, 0); ctx.lineTo(x + offset, virtual.height); ctx.stroke(); }
  for (let y = 0; y < virtual.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y + offset); ctx.lineTo(virtual.width, y + offset); ctx.stroke(); }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#050916';
  ctx.fillRect(0, ambient.groundY, virtual.width, virtual.height - ambient.groundY);
  ctx.fillStyle = 'rgba(14,238,255,0.18)';
  ctx.fillRect(0, ambient.groundY, virtual.width, 12);
  ctx.restore();
}
function drawGhosts() {
  active.ghosts.forEach((ghost) => {
    ctx.save();
    ctx.globalAlpha = ghost.alpha * 0.45;
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
    ctx.restore();
  });
}
function drawObstacles() {
  active.obstacles.forEach((obstacle) => {
    ctx.save();
    ctx.shadowColor = obstacle.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = obstacle.color;
    if (obstacle.type === 'SPIKE') {
      ctx.beginPath(); ctx.moveTo(obstacle.x, obstacle.y + obstacle.height); ctx.lineTo(obstacle.x + obstacle.width / 2, obstacle.y); ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height); ctx.closePath(); ctx.fill();
    } else if (obstacle.type === 'MACBOOK') {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#081018'; ctx.fillRect(obstacle.x + 10, obstacle.y + 10, obstacle.width - 20, obstacle.height - 24);
      ctx.fillStyle = '#0ef'; ctx.fillRect(obstacle.x + 16, obstacle.y + 18, obstacle.width - 32, 10);
    } else {
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.fillStyle = '#04080f'; ctx.fillRect(obstacle.x + 12, obstacle.y + 18, obstacle.width - 24, 14);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.fillText('ALGO', obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2 + 8);
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
  ctx.save();
  if (performance.now() < player.shakeUntil) {
    const shake = 6 * (Math.random() - 0.5);
    ctx.translate(shake, shake);
  }
  const char = characters[state.selectedCharacter];
  const img = images[char.id];
  if (img && img.loaded) {
    ctx.drawImage(img.image, player.x - 8, player.y - 4, player.width + 16, player.height + 16);
  } else {
    ctx.fillStyle = char.color;
    ctx.shadowColor = char.color;
    ctx.shadowBlur = 22;
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }
  if (player.isDashing) {
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(player.x - 6, player.y - 6, player.width + 12, player.height + 12);
  }
  ctx.restore();
}
function drawParticles() {
  active.particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 16;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    ctx.restore();
  });
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
function tick(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min((timestamp - state.lastTime) / 1000, 0.033);
  state.lastTime = timestamp;
  if (state.current === State.RUNNING) {
    update(dt);
  }
  drawBackground();
  drawGhosts();
  drawLasers();
  drawObstacles();
  drawParticles();
  drawPlayer();
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
  canvas.addEventListener('touchstart', (event) => { event.preventDefault(); handlePointerDown(event); }, { passive: false });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('blur', pauseGame);
  window.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', updateSize);
  requestAnimationFrame(tick);
}
initialize();