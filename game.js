const canvas = document.getElementById('game-canvas');
const context = canvas.getContext('2d');
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContextClass ? new AudioContextClass() : null;
const mainMenu = document.getElementById('mainMenu');
const charMenu = document.getElementById('charMenu');
const pauseMenu = document.getElementById('pauseMenu');
const startBtn = document.getElementById('startBtn');
const speedModeBtn = document.getElementById('speedModeBtn');
const resumeBtn = document.getElementById('resumeBtn');
const hardModeBtn = document.getElementById('hardModeBtn');
const charSelectBtn = document.getElementById('charSelectBtn');
const backMenuBtn = document.getElementById('backMenuBtn');
const characterCards = document.querySelectorAll('.character-card');
const charInfoDisplay = document.getElementById('characterInfo');
const abilityStatusDisplay = document.getElementById('abilityStatus');
const jumpForce = -11.5;

// Character images
const characterImages = {};
let selectedCharacter = 'runner';

// Character definitions
const characters = {
  runner: {
    name: 'NEON RUNNER',
    speedMultiplier: 1.15,
    jumpForceMultiplier: 1,
    color: '#00ffff',
    abilityName: 'DASH',
    abilityKey: 'KeyD',
    baseCooldown: 4000,
  },
  techno_samurai: {
    name: 'TECHNO-SAMURAI',
    speedMultiplier: 0.9,
    jumpForceMultiplier: 1.25,
    color: '#ff00ff',
    abilityName: 'SMASH ATTACK',
    abilityKey: 'KeyF',
    baseCooldown: 5000,
  },
};

// Load character images
function loadCharacterImages() {
  characters.runner.imagePath = 'assets/graphics/characters/runner.svg';
  characters.techno_samurai.imagePath = 'assets/graphics/characters/techno_samurai.svg';
  
  Object.entries(characters).forEach(([key, char]) => {
    const img = new Image();
    img.src = char.imagePath;
    img.onerror = () => console.warn(`Could not load image for ${key}`);
    characterImages[key] = img;
  });
}

const player = {
  x: 72,
  y: 0,
  width: 40,
  height: 40,
  velocityY: 0,
  gravity: 0.55,
  color: '#00ffff',
  dashActive: false,
  dashEndTime: 0,
  dashDirection: 1,
  abilityLastUsed: 0,
  abilityCooldown: 4000,
};

const obstacles = [];
const topObstacles = [];
const particles = [];
const initialGameSpeed = 5;
const baseSpawnInterval = 2000;
let gameMode = 'BASIC';
let difficultyMultiplier = 1;
let gameState = 'START';
let score = 0;
let highScore = Number.parseInt(localStorage.getItem('highScore') || '0', 10) || 0;
let gameSpeed = initialGameSpeed;
let isSpeedMode = false;
let speedModeColor = '#00aaff';
let spawnInterval = baseSpawnInterval;
let spawnTimer = 0;
let scoreTimer = 0;
let difficultyTimer = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let groundY = 0;
let gridOffset = 0;
let screenFlipped = false;
let flipLevel = 0;
let flipWarningUntil = 0;
let pauseStartedAt = 0;
let stageAlert = '';
let stageAlertUntil = 0;
let lastTrollSpawnAt = 0;
let fakeErrorUntil = 0;

function playJumpSound() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(330, now);
  oscillator.frequency.exponentialRampToValueAtTime(720, now + 0.09);
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

function playAbilitySound(type) {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type === 'dash' ? 'sine' : 'triangle';
  
  if (type === 'dash') {
    oscillator.frequency.setValueAtTime(600, now);
    oscillator.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } else {
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.linearRampToValueAtTime(400, now + 0.2);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }
}

function getEffectiveGameSpeed() {
  return gameSpeed * (isSpeedMode ? 2 : 1);
}

function setSpeedMode(active) {
  isSpeedMode = active;
  speedModeColor = Math.random() < 0.5 ? '#ff0055' : '#00aaff';
}

function playGameOverSound() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(160, now);
  oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.32);
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.35);
}

function resizeCanvas() {
  const previousGroundY = groundY;
  const wasGrounded = player.y >= previousGroundY;
  const distanceFromGround = Math.max(0, previousGroundY - player.y);
  const pixelRatio = window.devicePixelRatio || 1;
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  groundY = viewportHeight - player.height;

  canvas.width = viewportWidth * pixelRatio;
  canvas.height = viewportHeight * pixelRatio;
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  player.y = wasGrounded ? groundY : Math.max(0, groundY - distanceFromGround);
  if (wasGrounded) {
    player.velocityY = 0;
  }
}

function jump() {
  const charData = characters[selectedCharacter];
  player.velocityY = jumpForce * charData.jumpForceMultiplier;
  playJumpSound();

  if (gameState === 'RUNNING' && Math.random() < 0.18) {
    spawnTrollObstacle();
  }
}

function activateDash() {
  if (selectedCharacter !== 'runner') return;
  if (gameState !== 'RUNNING') return;
  
  const now = performance.now();
  if (now - player.abilityLastUsed < player.abilityCooldown) return;

  player.dashActive = true;
  player.dashEndTime = now + 400;
  player.abilityLastUsed = now;
  playAbilitySound('dash');
  
  const burstX = player.x + player.width / 2;
  const burstY = player.y + player.height / 2;
  createBurst(burstX, burstY);
}

function activateSmashAttack() {
  if (selectedCharacter !== 'techno_samurai') return;
  if (gameState !== 'RUNNING') return;

  const now = performance.now();
  if (now - player.abilityLastUsed < player.abilityCooldown) return;

  const nearestObstacle = getNearestObstacle();
  if (!nearestObstacle) return;

  player.abilityLastUsed = now;
  playAbilitySound('smash');
  
  const obstacleIndex = obstacles.indexOf(nearestObstacle);
  if (obstacleIndex > -1) {
    obstacles.splice(obstacleIndex, 1);
    createBurst(
      nearestObstacle.x + nearestObstacle.width / 2,
      nearestObstacle.y + nearestObstacle.height / 2
    );
    score += 50;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('highScore', highScore.toString());
    }
  }
}

function getNearestObstacle() {
  if (obstacles.length === 0) return null;

  const playerCenterX = player.x + player.width / 2;
  let nearest = obstacles[0];
  let nearestDistance = Math.abs(nearest.x + nearest.width / 2 - playerCenterX);

  for (let i = 1; i < obstacles.length; i += 1) {
    const obstacle = obstacles[i];
    const distance = Math.abs(obstacle.x + obstacle.width / 2 - playerCenterX);
    if (distance < nearestDistance) {
      nearest = obstacle;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function updateCharacterAbilityCooldown() {
  const charData = characters[selectedCharacter];
  const cooldownReduction = Math.floor(score / 500) * 200;
  player.abilityCooldown = Math.max(1000, charData.baseCooldown - cooldownReduction);
}

function startGame() {
  gameState = 'RUNNING';
  score = 0;
  obstacles.length = 0;
  topObstacles.length = 0;
  gameSpeed = initialGameSpeed;
  difficultyMultiplier = 1;
  spawnInterval = baseSpawnInterval;
  spawnTimer = performance.now();
  scoreTimer = performance.now();
  difficultyTimer = performance.now();
  lastTrollSpawnAt = 0;
  flipLevel = 0;
  setScreenFlip(false);
  player.y = groundY;
  player.velocityY = 0;
  player.dashActive = false;
  player.abilityLastUsed = 0;
  updateCharacterAbilityCooldown();
  
  const charData = characters[selectedCharacter];
  player.color = charData.color;
}

function setScreenFlip(shouldFlip) {
  screenFlipped = shouldFlip;
  canvas.style.transformOrigin = 'center center';
  canvas.style.transition = 'transform 180ms ease';
  canvas.style.transform = screenFlipped ? 'rotate(180deg)' : 'rotate(0deg)';
}

function handleJumpInput() {
  if (gameState === 'START' || gameState === 'GAMEOVER') {
    startFromMenu();
  }

  if (gameState !== 'RUNNING') return;

  jump();
}

function update() {
  if (player.dashActive && performance.now() < player.dashEndTime) {
    player.x += 18;
  } else {
    player.dashActive = false;
  }

  player.velocityY += player.gravity;
  player.y += player.velocityY;
  player.y = Math.max(0, player.y);

  if (player.y === 0 && player.velocityY < 0) {
    player.velocityY = 0;
  }

  if (player.y >= groundY) {
    player.y = groundY;
    player.velocityY = 0;
  }
}

function drawPlayer() {
  context.save();
  const charData = characters[selectedCharacter];
  const playerImage = characterImages[selectedCharacter];

  if (playerImage && playerImage.complete) {
    context.shadowColor = player.color;
    context.shadowBlur = 15;
    context.drawImage(playerImage, player.x - 5, player.y - 5, player.width + 10, player.height + 10);
  } else {
    context.fillStyle = player.color;
    context.shadowColor = player.color;
    context.shadowBlur = 22;
    context.fillRect(player.x, player.y, player.width, player.height);
  }

  if (player.dashActive) {
    context.strokeStyle = charData.color;
    context.shadowColor = charData.color;
    context.shadowBlur = 25;
    context.lineWidth = 3;
    context.globalAlpha = 0.6;
    context.strokeRect(player.x - 3, player.y - 3, player.width + 6, player.height + 6);
  }

  context.restore();
}

function drawCyberGrid() {
  const gridSize = 50;
  if (gameState === 'RUNNING') {
    gridOffset = (gridOffset + getEffectiveGameSpeed()) % gridSize;
  }

  context.save();
  if (gameMode === 'BASIC' && score > 75) {
    context.strokeStyle = '#331111';
  } else if (gameMode === 'BASIC' && score > 30) {
    context.strokeStyle = '#221118';
  } else {
    context.strokeStyle = '#111122';
  }
  context.lineWidth = 1;
  context.translate(-gridOffset, 0);
  context.beginPath();

  for (let x = -gridSize; x <= viewportWidth + gridSize * 2; x += gridSize) {
    context.moveTo(x, 0);
    context.lineTo(x, viewportHeight);
  }

  for (let y = 0; y <= viewportHeight; y += gridSize) {
    context.moveTo(-gridSize, y);
    context.lineTo(viewportWidth + gridSize * 2, y);
  }

  context.stroke();
  context.restore();
}

function createSingleObstacle(x = viewportWidth) {
  const floorY = viewportHeight;
  let obstacle;

  if (score <= 20) {
    obstacle = {
      type: 'BASIC_SPIKE',
      x,
      y: floorY - 50,
      width: 32,
      height: 50,
      color: '#ff0055',
    };
    stageAlert = 'BAŞLANGIÇ SEVİYESİ';
  } else if (score <= 50) {
    const height = 190;
    const tunnelHeight = 54;
    obstacle = {
      type: 'MACBOOK',
      x,
      y: floorY - height,
      width: 88,
      height,
      tunnelY: floorY - 126,
      tunnelHeight,
      color: '#a855f7',
    };
    stageAlert = 'DİKKAT: Kod çöküyor!';
  } else if (score <= 100) {
    const height = 104;
    const baseY = Math.max(72, floorY - 215);
    obstacle = {
      type: 'ALGORITHM',
      x,
      y: baseY,
      baseY,
      width: 106,
      height,
      phase: Math.random() * Math.PI * 2,
      color: '#ff0055',
    };
    stageAlert = 'ALGORİTMA SENİ YAKALIYOR!';
  } else {
    const isRevision = Math.random() < 0.5;
    const height = isRevision ? 105 : 160;
    obstacle = {
      type: isRevision ? 'REVISION' : 'EXCLAMATION',
      x,
      y: isRevision ? Math.max(55, floorY - 260 + Math.random() * 100) : floorY - height,
      width: isRevision ? 150 : 64,
      height,
      rotation: 0,
      rotationSpeed: 0.1 + Math.random() * 0.12,
      color: isRevision ? '#00ffff' : '#ff8c00',
    };
    stageAlert = isRevision ? 'CLIENT REVİZYONU GELDİ!' : 'SONSUZ KAOS BAŞLADI!';
  }

  stageAlertUntil = performance.now() + 1100;
  obstacles.push(obstacle);
  return obstacle;
}

function createObstacle() {
  const firstObstacle = createSingleObstacle();

  if (Math.random() < 0.35) {
    createTopObstacle();
  }

  if (gameMode === 'HARD' && Math.random() < 0.4) {
    const doubleGap = 40;
    createSingleObstacle(viewportWidth + firstObstacle.width + doubleGap);
  }
}

function getCeilingHeight() {
  if (score >= 1000) return 135;
  if (score >= 500) return 90;
  if (score >= 100) return 48;
  return 8;
}

function createTopObstacle() {
  topObstacles.push({
    x: viewportWidth,
    y: 0,
    width: 54,
    extraHeight: 46 + Math.random() * 42,
    height: 0,
    color: '#ff0055',
  });
}

function spawnTrollObstacle() {
  const now = performance.now();
  if (now - lastTrollSpawnAt < 4500) return;

  const width = 58;
  const height = 96;
  obstacles.push({
    type: 'TROLL',
    x: Math.max(player.x + 190, viewportWidth * 0.32),
    y: viewportHeight + height,
    targetY: viewportHeight - height,
    width,
    height,
    riseSpeed: 13,
    color: '#39ff14',
  });
  lastTrollSpawnAt = now;
  fakeErrorUntil = now + 950;
}

function hasEnoughObstacleSpacing() {
  const lastObstacle = obstacles[obstacles.length - 1];
  if (!lastObstacle) return true;

  const minimumDistance = Math.max(180, getEffectiveGameSpeed() * 45) + lastObstacle.width;
  return lastObstacle.x + lastObstacle.width <= viewportWidth - minimumDistance;
}

function updateObstacles() {
  for (let index = obstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = obstacles[index];
    obstacle.x -= getEffectiveGameSpeed();

    if (obstacle.type === 'TROLL' && obstacle.y > obstacle.targetY) {
      obstacle.y = Math.max(obstacle.targetY, obstacle.y - obstacle.riseSpeed);
    }

    if (obstacle.type === 'ALGORITHM') {
      obstacle.y = obstacle.baseY + Math.sin(performance.now() * 0.007 + obstacle.phase) * 72;
    }

    if (obstacle.type === 'EXCLAMATION' || obstacle.type === 'REVISION') {
      obstacle.rotation += obstacle.rotationSpeed;
    }

    if (obstacle.x + obstacle.width < 0) {
      obstacles.splice(index, 1);
    }
  }
}

function updateTopObstacles() {
  const ceilingHeight = getCeilingHeight();

  for (let index = topObstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = topObstacles[index];
    obstacle.x -= getEffectiveGameSpeed();
    obstacle.height = ceilingHeight + obstacle.extraHeight;

    if (obstacle.x + obstacle.width < 0) {
      topObstacles.splice(index, 1);
    }
  }
}

function createBurst(x, y) {
  const particleCount = 130;
  const colors = ['#00ffff', '#ff0055'];

  for (let index = 0; index < particleCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 7;

    particles.push({
      x,
      y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      life: 35 + Math.random() * 30,
      size: 2 + Math.random() * 4,
    });
  }
}

function updateParticles() {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.dx;
    particle.y += particle.dy;
    particle.dy += 0.12;
    particle.life -= 1;
    particle.alpha = Math.max(0, particle.life / 65);

    if (particle.life <= 0) {
      particles.splice(index, 1);
    }
  }
}

function drawParticles() {
  context.save();
  context.globalCompositeOperation = 'lighter';

  particles.forEach((particle) => {
    context.globalAlpha = particle.alpha;
    context.fillStyle = particle.color;
    context.shadowColor = particle.color;
    context.shadowBlur = 14;
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  });

  context.restore();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    context.save();
    const renderColor = isSpeedMode ? speedModeColor : obstacle.color;
    context.fillStyle = renderColor;
    context.strokeStyle = renderColor;
    context.shadowColor = renderColor;
    context.shadowBlur = 18;
    context.lineWidth = 3;

    if (obstacle.type === 'BASIC_SPIKE') {
      context.beginPath();
      context.moveTo(obstacle.x, obstacle.y + obstacle.height);
      context.lineTo(obstacle.x + obstacle.width / 2, obstacle.y);
      context.lineTo(obstacle.x + obstacle.width, obstacle.y + obstacle.height);
      context.closePath();
      context.fill();
    } else if (obstacle.type === 'MACBOOK') {
      const tunnelBottom = obstacle.tunnelY + obstacle.tunnelHeight;
      context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.tunnelY - obstacle.y);
      context.fillRect(obstacle.x, tunnelBottom, obstacle.width, obstacle.y + obstacle.height - tunnelBottom);
      context.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      context.font = 'bold 10px monospace';
      context.textAlign = 'center';
      context.fillText('Syntax Error', obstacle.x + obstacle.width / 2, obstacle.tunnelY + 33);
      context.font = '9px monospace';
      context.fillText('<div>', obstacle.x + obstacle.width / 2, obstacle.y + 18);
      context.fillText('</div>', obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height - 10);
    } else if (obstacle.type === 'ALGORITHM') {
      const centerX = obstacle.x + obstacle.width / 2;
      const centerY = obstacle.y + obstacle.height / 2;
      context.beginPath();
      context.arc(centerX, centerY, 38, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#000';
      context.shadowBlur = 0;
      context.fillRect(centerX - 17, centerY - 10, 9, 8);
      context.fillRect(centerX + 8, centerY - 10, 9, 8);
      context.fillRect(centerX - 14, centerY + 13, 28, 5);
      context.strokeStyle = renderColor;
      context.shadowColor = renderColor;
      context.shadowBlur = 18;
      for (let leg = 0; leg < 4; leg += 1) {
        context.beginPath();
        context.moveTo(centerX - 28 + leg * 18, centerY + 28);
        context.lineTo(centerX - 42 + leg * 27, centerY + 48);
        context.stroke();
      }
      context.font = 'bold 10px Arial, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = renderColor;
      context.fillText('YouTube', centerX, obstacle.y - 8);
    } else if (obstacle.type === 'TROLL') {
      context.fillRect(obstacle.x, obstacle.y + 18, obstacle.width, obstacle.height - 18);
      context.beginPath();
      context.arc(obstacle.x + obstacle.width / 2, obstacle.y + 22, 28, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#000';
      context.shadowBlur = 0;
      context.fillRect(obstacle.x + 14, obstacle.y + 17, 9, 7);
      context.fillRect(obstacle.x + 35, obstacle.y + 17, 9, 7);
      context.fillRect(obstacle.x + 16, obstacle.y + 35, 28, 5);
      context.fillStyle = renderColor;
      context.shadowColor = renderColor;
      context.shadowBlur = 18;
      context.font = 'bold 10px monospace';
      context.textAlign = 'center';
      context.fillText('404', obstacle.x + obstacle.width / 2, obstacle.y + 77);
    } else {
      const centerX = obstacle.x + obstacle.width / 2;
      const centerY = obstacle.y + obstacle.height / 2;
      context.translate(centerX, centerY);
      context.rotate(obstacle.rotation);
      context.translate(-centerX, -centerY);
      if (obstacle.type === 'EXCLAMATION') {
        context.fillRect(centerX - 10, obstacle.y, 20, obstacle.height - 35);
        context.beginPath();
        context.arc(centerX, obstacle.y + obstacle.height - 14, 12, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        context.fillStyle = '#000';
        context.shadowBlur = 0;
        context.font = 'bold 17px Arial, sans-serif';
        context.textAlign = 'center';
        context.fillText('CLIENT', centerX, centerY - 9);
        context.fillText('REVİZYONU', centerX, centerY + 14);
      }
    }

    context.restore();
  });
}

function drawTopObstacles() {
  const ceilingHeight = getCeilingHeight();
  const laserColor = isSpeedMode ? speedModeColor : '#ff0055';

  context.save();
  context.strokeStyle = laserColor;
  context.shadowColor = laserColor;
  context.shadowBlur = 16;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, ceilingHeight);
  context.lineTo(viewportWidth, ceilingHeight);
  context.stroke();

  topObstacles.forEach((obstacle) => {
    const color = isSpeedMode ? speedModeColor : obstacle.color;
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 18;
    context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    context.fillStyle = '#000';
    context.shadowBlur = 0;
    context.font = 'bold 9px monospace';
    context.textAlign = 'center';
    context.fillText('CEILING', obstacle.x + obstacle.width / 2, obstacle.height - 10);
  });

  context.restore();
}

function updateCharacterInfoDisplay() {
  if (gameState !== 'RUNNING') {
    charInfoDisplay.textContent = '';
    return;
  }

  const charData = characters[selectedCharacter];
  const now = performance.now();
  const cooldownRemaining = Math.max(0, player.abilityCooldown - (now - player.abilityLastUsed));
  const cooldownPercent = Math.floor((cooldownRemaining / player.abilityCooldown) * 100);
  
  charInfoDisplay.innerHTML = `
    <div style="font-weight: bold; font-size: 16px; color: ${charData.color}; text-shadow: 0 0 10px ${charData.color};">
      ► ${charData.name}
    </div>
    <div style="font-size: 12px; margin-top: 4px; color: #ffff00;">
      Yetenek: ${charData.abilityName}
    </div>
  `;
}

function updateAbilityStatusDisplay() {
  if (gameState !== 'RUNNING') {
    abilityStatusDisplay.textContent = '';
    return;
  }

  const charData = characters[selectedCharacter];
  const now = performance.now();
  const cooldownRemaining = Math.max(0, player.abilityCooldown - (now - player.abilityLastUsed));
  const cooldownPercent = Math.floor((cooldownRemaining / player.abilityCooldown) * 100);
  const isReady = cooldownRemaining <= 0;

  let statusText = '';
  let statusColor = '#ffff00';
  
  if (selectedCharacter === 'runner') {
    statusText = `[D] DASH: `;
  } else {
    statusText = `[F] SMASH: `;
  }

  if (isReady) {
    statusText += `✓ HAZIR`;
    statusColor = '#00ff00';
  } else {
    statusText += `${cooldownPercent}%`;
    statusColor = '#ff6600';
  }

  abilityStatusDisplay.innerHTML = `<div style="color: ${statusColor}; text-shadow: 0 0 8px ${statusColor};">${statusText}</div>`;
}

function drawScore() {
  context.save();
  const hudColor = isSpeedMode ? speedModeColor : '#ffffff';
  context.fillStyle = hudColor;
  context.shadowColor = hudColor;
  context.shadowBlur = 12;
  context.font = 'bold 24px Arial, sans-serif';
  context.textBaseline = 'top';

  context.textAlign = 'left';
  context.fillText(`High Score: ${highScore}`, 24, 24);

  context.textAlign = 'right';
  context.fillText(`Score: ${score}`, viewportWidth - 24, 24);

  const modeColor = isSpeedMode ? speedModeColor : gameMode === 'HARD' ? '#ff8c00' : '#39ff14';
  context.fillStyle = modeColor;
  context.shadowColor = modeColor;
  context.shadowBlur = 10;
  context.font = 'bold 17px Arial, sans-serif';
  context.fillText(gameMode === 'HARD' ? 'MODE: HARD DEVRİMİ' : 'MODE: BASIC', viewportWidth - 24, 56);
  context.fillText(`LVL: ${difficultyMultiplier}`, viewportWidth - 24, 78);
  if (isSpeedMode) {
    context.font = 'bold 16px Arial, sans-serif';
    context.fillText('SPEED MODE ACTIVE', viewportWidth - 24, 100);
  }
  context.restore();
}

function drawFlipWarning(timestamp) {
  if (timestamp >= flipWarningUntil || Math.floor(timestamp / 120) % 2 === 0) return;

  context.save();
  context.fillStyle = '#ff8c00';
  context.shadowColor = '#ff8c00';
  context.shadowBlur = 18;
  context.font = 'bold 28px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('EKRAN TERS DÖNDÜ!', viewportWidth / 2, 70);
  context.restore();
}

function drawStageAlert(timestamp) {
  if (timestamp >= stageAlertUntil || Math.floor(timestamp / 120) % 2 === 0) return;

  context.save();
  context.fillStyle = '#ffff00';
  context.shadowColor = '#ffff00';
  context.shadowBlur = 16;
  context.font = 'bold 22px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(stageAlert, viewportWidth / 2, 34);
  context.restore();
}

function drawFakeError(timestamp) {
  if (timestamp >= fakeErrorUntil || Math.floor(timestamp / 90) % 2 === 0) return;

  context.save();
  context.fillStyle = '#ff0055';
  context.shadowColor = '#ff0055';
  context.shadowBlur = 20;
  context.font = 'bold 30px monospace';
  context.textAlign = 'center';
  context.fillText('ERROR 404: TROLL ALGILANDI!', viewportWidth / 2, viewportHeight / 2 - 70);
  context.restore();
}

function getObstaclePoints(obstacle) {
  if (obstacle.type === 'BASIC_SPIKE') {
    return [
      { x: obstacle.x, y: obstacle.y + obstacle.height },
      { x: obstacle.x + obstacle.width / 2, y: obstacle.y },
      { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height },
    ];
  }

  return [
    { x: obstacle.x, y: obstacle.y },
    { x: obstacle.x + obstacle.width, y: obstacle.y },
    { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height },
    { x: obstacle.x, y: obstacle.y + obstacle.height },
  ];
}

function getPlayerPoints() {
  return [
    { x: player.x, y: player.y },
    { x: player.x + player.width, y: player.y },
    { x: player.x + player.width, y: player.y + player.height },
    { x: player.x, y: player.y + player.height },
  ];
}

function polygonsCollide(firstPolygon, secondPolygon) {
  const polygons = [firstPolygon, secondPolygon];

  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const axis = { x: -(next.y - current.y), y: next.x - current.x };

      const firstProjection = firstPolygon.map((point) => point.x * axis.x + point.y * axis.y);
      const secondProjection = secondPolygon.map((point) => point.x * axis.x + point.y * axis.y);
      const firstMin = Math.min(...firstProjection);
      const firstMax = Math.max(...firstProjection);
      const secondMin = Math.min(...secondProjection);
      const secondMax = Math.max(...secondProjection);

      if (firstMax < secondMin || secondMax < firstMin) {
        return false;
      }
    }
  }

  return true;
}

function getCollidingObstacle() {
  const playerPoints = getPlayerPoints();
  const bottomObstacle = obstacles.find((obstacle) => {
    if (!polygonsCollide(playerPoints, getObstaclePoints(obstacle))) {
      return false;
    }

    if (obstacle.type !== 'MACBOOK') return true;

    const playerTop = player.y;
    const playerBottom = player.y + player.height;
    const isInsideTunnel = playerTop >= obstacle.tunnelY
      && playerBottom <= obstacle.tunnelY + obstacle.tunnelHeight;
    return !isInsideTunnel;
  });

  if (bottomObstacle) return bottomObstacle;

  const ceilingLaser = {
    x: 0,
    y: 0,
    width: viewportWidth,
    height: getCeilingHeight(),
  };
  if (polygonsCollide(playerPoints, getObstaclePoints(ceilingLaser))) {
    return ceilingLaser;
  }

  return topObstacles.find((obstacle) => polygonsCollide(playerPoints, getObstaclePoints(obstacle)));
}

function getCollisionPoint(obstacle) {
  const left = Math.max(player.x, obstacle.x);
  const right = Math.min(player.x + player.width, obstacle.x + obstacle.width);
  const top = Math.max(player.y, obstacle.y);
  const bottom = Math.min(player.y + player.height, obstacle.y + obstacle.height);

  return {
    x: left + (right - left) / 2,
    y: top + (bottom - top) / 2,
  };
}

function drawGameOver() {
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 52px Arial, sans-serif';
  context.fillStyle = '#ff0055';
  context.shadowColor = '#ff0055';
  context.shadowBlur = 20;
  context.fillText('GAME OVER', centerX, centerY - 22);

  context.font = 'bold 20px Arial, sans-serif';
  context.fillStyle = '#ffffff';
  context.shadowColor = '#ffffff';
  context.shadowBlur = 12;
  context.fillText('YENİDEN BAŞLAMAK İÇİN TIKLA', centerX, centerY + 30);
  context.restore();
}

function startFromMenu() {
  mainMenu.classList.add('hidden');
  charMenu.classList.add('hidden');
  startGame();
}

function endGame() {
  gameState = 'GAMEOVER';
  gameSpeed = initialGameSpeed;
  setSpeedMode(false);
  playGameOverSound();
  mainMenu.classList.remove('hidden');
  charMenu.classList.add('hidden');
  startBtn.textContent = 'YENİDEN BAŞLA';
}

function pauseGame() {
  if (gameState !== 'RUNNING') return;

  gameState = 'PAUSED';
  pauseStartedAt = performance.now();
  pauseMenu.classList.remove('hidden');
  if (audioContext && audioContext.state === 'running') audioContext.suspend();
}

function resumeGame() {
  if (gameState !== 'PAUSED') return;

  const pausedDuration = performance.now() - pauseStartedAt;
  spawnTimer += pausedDuration;
  scoreTimer += pausedDuration;
  difficultyTimer += pausedDuration;
  stageAlertUntil += pausedDuration;
  fakeErrorUntil += pausedDuration;
  flipWarningUntil += pausedDuration;
  gameState = 'RUNNING';
  pauseMenu.classList.add('hidden');
  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
}

function keepGamePaused() {
  if (gameState === 'PAUSED') {
    pauseMenu.classList.remove('hidden');
  }
}

function getCanvasPointerPosition(pointer) {
  if (!pointer) return null;

  const rect = canvas.getBoundingClientRect();
  let x = ((pointer.clientX - rect.left) / rect.width) * viewportWidth;
  let y = ((pointer.clientY - rect.top) / rect.height) * viewportHeight;

  if (screenFlipped) {
    x = viewportWidth - x;
    y = viewportHeight - y;
  }

  return { x, y };
}

function handlePointerInput(event) {
  const pointer = event.touches ? event.touches[0] : event;
  const canvasPosition = getCanvasPointerPosition(pointer);
  if (!canvasPosition) return;

  handleJumpInput();
}

function gameLoop(timestamp) {
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  drawCyberGrid();

  if (gameState === 'RUNNING') {
    if (timestamp - spawnTimer >= spawnInterval && hasEnoughObstacleSpacing()) {
      createObstacle();
      spawnTimer = timestamp;
    }

    if (timestamp - scoreTimer >= 1000) {
      const survivedSeconds = Math.floor((timestamp - scoreTimer) / 1000);
      score += survivedSeconds * (isSpeedMode ? 2 : 1);
      scoreTimer += survivedSeconds * 1000;

      if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore.toString());
      }

      updateCharacterAbilityCooldown();

      if (gameMode === 'BASIC') {
        const nextDifficultyMultiplier = score > 75 ? 3 : score > 30 ? 2 : 1;
        if (nextDifficultyMultiplier > difficultyMultiplier) {
          gameSpeed += nextDifficultyMultiplier - difficultyMultiplier;
          difficultyMultiplier = nextDifficultyMultiplier;
          spawnInterval = Math.max(750, baseSpawnInterval - (difficultyMultiplier - 1) * 150);
        }
      }

      if (gameMode === 'HARD') {
        const nextFlipLevel = Math.floor(score / 300);
        if (nextFlipLevel > flipLevel) {
          if ((nextFlipLevel - flipLevel) % 2 === 1) {
            setScreenFlip(!screenFlipped);
          }
          flipLevel = nextFlipLevel;
          flipWarningUntil = timestamp + 900;
        }
      }
    }

    if (gameMode === 'BASIC' && timestamp - difficultyTimer >= 10000) {
      const difficultySteps = Math.floor((timestamp - difficultyTimer) / 10000);
      gameSpeed += difficultySteps;
      difficultyTimer += difficultySteps * 10000;
    }

    update();
    updateObstacles();
    updateTopObstacles();

    const collidedObstacle = getCollidingObstacle();
    if (collidedObstacle) {
      const collisionPoint = getCollisionPoint(collidedObstacle);
      createBurst(collisionPoint.x, collisionPoint.y);
      endGame();
    }
  }

  if (gameState !== 'PAUSED') {
    updateParticles();
  }
  drawPlayer();
  drawObstacles();
  drawTopObstacles();
  drawParticles();
  drawScore();
  drawFlipWarning(timestamp);
  drawStageAlert(timestamp);
  drawFakeError(timestamp);
  updateCharacterInfoDisplay();
  updateAbilityStatusDisplay();

  requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('blur', pauseGame);
window.addEventListener('focus', keepGamePaused);

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM' && !event.repeat) {
    event.preventDefault();
    if (gameState === 'RUNNING') setSpeedMode(!isSpeedMode);
    return;
  }

  if (event.code === 'KeyD' && !event.repeat) {
    event.preventDefault();
    if (gameState === 'RUNNING' && selectedCharacter === 'runner') {
      activateDash();
    }
    return;
  }

  if (event.code === 'KeyF' && !event.repeat) {
    event.preventDefault();
    if (gameState === 'RUNNING' && selectedCharacter === 'techno_samurai') {
      activateSmashAttack();
    }
    return;
  }

  if (event.code !== 'Space' || event.repeat) return;
  event.preventDefault();

  if (gameState === 'PAUSED') {
    resumeGame();
    return;
  }

  handleJumpInput();
});

canvas.addEventListener('mousedown', handlePointerInput);
canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  handlePointerInput(event);
}, { passive: false });

startBtn.addEventListener('click', () => {
  gameMode = 'BASIC';
  setSpeedMode(false);
  startFromMenu();
});

speedModeBtn.addEventListener('click', () => {
  gameMode = 'BASIC';
  setSpeedMode(true);
  startFromMenu();
});

hardModeBtn.addEventListener('click', () => {
  gameMode = 'HARD';
  setSpeedMode(false);
  startFromMenu();
});

resumeBtn.addEventListener('click', resumeGame);

charSelectBtn.addEventListener('click', () => {
  mainMenu.classList.add('hidden');
  charMenu.classList.remove('hidden');
});

backMenuBtn.addEventListener('click', () => {
  charMenu.classList.add('hidden');
  mainMenu.classList.remove('hidden');
});

characterCards.forEach((card) => {
  card.addEventListener('click', () => {
    selectedCharacter = card.dataset.character;
    characterCards.forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    const charData = characters[selectedCharacter];
    player.color = charData.color;
    player.abilityCooldown = charData.baseCooldown;
  });
});

loadCharacterImages();
resizeCanvas();
player.y = groundY;
gameLoop();
