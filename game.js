const canvas = document.getElementById('game-canvas');
const context = canvas.getContext('2d');
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioContextClass ? new AudioContextClass() : null;
const mainMenu = document.getElementById('mainMenu');
const charMenu = document.getElementById('charMenu');
const pauseMenu = document.getElementById('pauseMenu');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const hardModeBtn = document.getElementById('hardModeBtn');
const charSelectBtn = document.getElementById('charSelectBtn');
const backMenuBtn = document.getElementById('backMenuBtn');
const skinCards = document.querySelectorAll('.skin-card');
const jumpForce = -11.5;

const player = {
  x: 72,
  y: 0,
  width: 40,
  height: 40,
  velocityY: 0,
  gravity: 0.55,
  color: '#00ffff',
};

const obstacles = [];
const particles = [];
const initialGameSpeed = 5;
const baseSpawnInterval = 2000;
let gameMode = 'BASIC';
let difficultyMultiplier = 1;
let gameState = 'START';
let score = 0;
let highScore = Number.parseInt(localStorage.getItem('highScore') || '0', 10) || 0;
let gameSpeed = initialGameSpeed;
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
  player.velocityY = jumpForce;
  playJumpSound();
}

function startGame() {
  gameState = 'RUNNING';
  score = 0;
  obstacles.length = 0;
  gameSpeed = initialGameSpeed;
  difficultyMultiplier = 1;
  spawnInterval = baseSpawnInterval;
  spawnTimer = performance.now();
  scoreTimer = performance.now();
  difficultyTimer = performance.now();
  flipLevel = 0;
  setScreenFlip(false);
  player.y = groundY;
  player.velocityY = 0;
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
  context.fillStyle = player.color;
  context.shadowColor = player.color;
  context.shadowBlur = 22;
  context.fillRect(player.x, player.y, player.width, player.height);
  context.restore();
}

function drawCyberGrid() {
  const gridSize = 50;
  if (gameState === 'RUNNING') {
    gridOffset = (gridOffset + gameSpeed) % gridSize;
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
      type: 'COFFEE',
      x,
      y: floorY - 58,
      width: 58,
      height: 58,
      color: '#ff8c00',
    };
    stageAlert = 'KAHVE MOLASI: Kod derleniyor...';
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

  if (gameMode === 'HARD' && Math.random() < 0.4) {
    const doubleGap = 40;
    createSingleObstacle(viewportWidth + firstObstacle.width + doubleGap);
  }
}

function hasEnoughObstacleSpacing() {
  const lastObstacle = obstacles[obstacles.length - 1];
  if (!lastObstacle) return true;

  const minimumDistance = Math.max(180, gameSpeed * 45) + lastObstacle.width;
  return lastObstacle.x + lastObstacle.width <= viewportWidth - minimumDistance;
}

function updateObstacles() {
  for (let index = obstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = obstacles[index];
    obstacle.x -= gameSpeed;

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
    context.fillStyle = obstacle.color;
    context.strokeStyle = obstacle.color;
    context.shadowColor = obstacle.color;
    context.shadowBlur = 18;
    context.lineWidth = 3;

    if (obstacle.type === 'COFFEE') {
      context.fillRect(obstacle.x + 8, obstacle.y + 14, 36, 34);
      context.strokeRect(obstacle.x + 44, obstacle.y + 22, 12, 18);
      context.fillRect(obstacle.x, obstacle.y + 50, obstacle.width, 7);
      context.lineWidth = 2;
      for (let steam = 0; steam < 3; steam += 1) {
        context.beginPath();
        context.arc(obstacle.x + 17 + steam * 11, obstacle.y + 10, 5, Math.PI, 0);
        context.stroke();
      }
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
      context.strokeStyle = obstacle.color;
      context.shadowColor = obstacle.color;
      context.shadowBlur = 18;
      for (let leg = 0; leg < 4; leg += 1) {
        context.beginPath();
        context.moveTo(centerX - 28 + leg * 18, centerY + 28);
        context.lineTo(centerX - 42 + leg * 27, centerY + 48);
        context.stroke();
      }
      context.font = 'bold 10px Arial, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = obstacle.color;
      context.fillText('YouTube', centerX, obstacle.y - 8);
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

function drawScore() {
  context.save();
  context.fillStyle = '#ffffff';
  context.shadowColor = '#ffffff';
  context.shadowBlur = 12;
  context.font = 'bold 24px Arial, sans-serif';
  context.textBaseline = 'top';

  context.textAlign = 'left';
  context.fillText(`High Score: ${highScore}`, 24, 24);

  context.textAlign = 'right';
  context.fillText(`Score: ${score}`, viewportWidth - 24, 24);

  const modeColor = gameMode === 'HARD' ? '#ff8c00' : '#39ff14';
  context.fillStyle = modeColor;
  context.shadowColor = modeColor;
  context.shadowBlur = 10;
  context.font = 'bold 17px Arial, sans-serif';
  context.fillText(gameMode === 'HARD' ? 'MODE: HARD DEVRİMİ' : 'MODE: BASIC', viewportWidth - 24, 56);
  context.fillText(`LVL: ${difficultyMultiplier}`, viewportWidth - 24, 78);
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

function getObstaclePoints(obstacle) {
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
  return obstacles.find((obstacle) => {
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
      score += survivedSeconds;
      scoreTimer += survivedSeconds * 1000;

      if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore.toString());
      }

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
  drawParticles();
  drawScore();
  drawFlipWarning(timestamp);
  drawStageAlert(timestamp);

  requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('blur', pauseGame);
window.addEventListener('focus', keepGamePaused);

window.addEventListener('keydown', (event) => {
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
  startFromMenu();
});

hardModeBtn.addEventListener('click', () => {
  gameMode = 'HARD';
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

skinCards.forEach((card) => {
  card.addEventListener('click', () => {
    player.color = card.dataset.color;
    skinCards.forEach((skinCard) => skinCard.classList.remove('active'));
    card.classList.add('active');
  });
});

resizeCanvas();
player.y = groundY;
gameLoop();
