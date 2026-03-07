// ═══════════════════════════════════════
//  CLIENT - WebSocket + Game State
// ═══════════════════════════════════════
import { esc, betLabel, numColor, PLAYER_COLORS } from './shared.js';
import { initWheel, spinWheel } from './wheel.js';
import { initTable, updateChipStacks, highlightWinning } from './table.js';
import { sndChip, sndWin, sndLose, sndBigWin, toggleSound, isSoundOn } from './audio.js';

// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
let ws = null;
let myId = null;
let gameState = null; // full state from server
let selectedChip = 10;
let spinning = false;

// ═══════════════════════════════════════
//  CONFETTI
// ═══════════════════════════════════════
const confCanvas = document.getElementById('confettiCanvas');
const confCtx = confCanvas ? confCanvas.getContext('2d') : null;
let confParticles = [], confAnimId;

function launchConfetti() {
  if (!confCtx) return;
  confCanvas.width = window.innerWidth; confCanvas.height = window.innerHeight;
  confCanvas.style.display = 'block'; confParticles = [];
  for (let i = 0; i < 180; i++) {
    confParticles.push({
      x: Math.random() * confCanvas.width, y: -20 - Math.random() * 300,
      w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
      color: ['#f0c040', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#ff5722', '#fff'][Math.floor(Math.random() * 7)],
      vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 5,
      rot: Math.random() * 360, rs: (Math.random() - .5) * 12, life: 1
    });
  }
  animConfetti();
  setTimeout(() => { confCanvas.style.display = 'none'; cancelAnimationFrame(confAnimId) }, 3500);
}

function animConfetti() {
  confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
  let alive = false;
  confParticles.forEach(p => {
    if (p.life <= 0) return; alive = true;
    p.x += p.vx; p.y += p.vy; p.vy += .12; p.rot += p.rs;
    if (p.y > confCanvas.height + 30) { p.life = 0; return }
    confCtx.save(); confCtx.translate(p.x, p.y); confCtx.rotate(p.rot * Math.PI / 180);
    confCtx.fillStyle = p.color; confCtx.globalAlpha = Math.min(p.life, 1);
    confCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); confCtx.restore();
    p.life -= .004;
  });
  if (alive) confAnimId = requestAnimationFrame(animConfetti);
}

// ═══════════════════════════════════════
//  BET POPUP
// ═══════════════════════════════════════
function showBetPopup(el, text) {
  const r = el.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'bet-popup'; pop.textContent = text;
  pop.style.left = (r.left + r.width / 2) + 'px';
  pop.style.top = (r.top - 5) + 'px';
  pop.style.transform = 'translateX(-50%)';
  pop.style.animation = 'betPopUp .8s ease forwards';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 850);
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════
function connect(roomId) {
  const host = location.host;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${host}/parties/main/${roomId}`);
  ws.onopen = () => {};
  ws.onclose = () => { toast('Disconnected from server'); };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ═══════════════════════════════════════
//  MESSAGE HANDLERS
// ═══════════════════════════════════════
function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myId = msg.playerId;
      gameState = msg.state;
      if (gameState.phase === 'lobby') showWaitingRoom();
      else showGame();
      break;

    case 'fullState':
      gameState = msg.state;
      break;

    case 'playerJoined':
      if (gameState) {
        gameState.players[msg.player.id] = msg.player;
        gameState.dealerId = msg.dealerId;
      }
      if (gameState?.phase === 'lobby') renderWaitingPlayers();
      else renderPlayers();
      break;

    case 'playerLeft':
      if (gameState) {
        delete gameState.players[msg.playerId];
        gameState.dealerId = msg.dealerId;
      }
      if (gameState?.phase === 'lobby') renderWaitingPlayers();
      else renderPlayers();
      break;

    case 'configured':
      if (gameState) {
        gameState.startBalance = msg.startBalance;
        gameState.tableMin = msg.tableMin;
        gameState.tableMax = msg.tableMax;
        for (const p of Object.values(gameState.players)) p.balance = msg.startBalance;
      }
      renderWaitingPlayers();
      break;

    case 'phaseChange':
      if (gameState) gameState.phase = msg.phase;
      if (msg.state) gameState = msg.state;
      if (msg.phase === 'betting') {
        spinning = false;
        showGame();
        updateSpinButton();
      }
      break;

    case 'betPlaced':
    case 'betUpdated':
      if (gameState && msg.allBets) updateChipStacks(msg.allBets);
      // Update local player bets if needed
      if (gameState && msg.playerId && gameState.players[msg.playerId] && msg.allBets) {
        // Reconstruct player bets from allBets
      }
      break;

    case 'spinStart':
      spinning = true;
      if (gameState) gameState.phase = 'spinning';
      updateSpinButton();
      document.getElementById('resultNumber').classList.remove('revealed');
      document.getElementById('resultLabel').classList.remove('revealed');
      document.getElementById('resultNumber').textContent = '--';
      document.getElementById('resultNumber').style.color = '#888';
      document.getElementById('resultLabel').textContent = 'Spinning...';
      highlightWinning(-1); // clear
      spinWheel(msg.physicsParams, (resultNum) => {
        // Physics animation completed on our end - server handles payout timing
      });
      break;

    case 'spinComplete': {
      const rn = document.getElementById('resultNumber');
      const rl = document.getElementById('resultLabel');
      const color = numColor(msg.resultNumber);
      rn.classList.remove('revealed'); rl.classList.remove('revealed');
      void rn.offsetWidth;
      rn.textContent = msg.resultNumber;
      rn.style.color = color === 'red' ? '#f44' : color === 'green' ? '#4f4' : '#fff';
      rn.classList.add('revealed');
      rl.textContent = `${msg.resultNumber} ${color.toUpperCase()}${msg.resultNumber !== 0 ? (msg.resultNumber % 2 === 0 ? ' EVEN' : ' ODD') : ''}`;
      rl.classList.add('revealed');
      highlightWinning(msg.resultNumber);

      // Update players from server
      if (gameState) {
        gameState.players = msg.players;
        gameState.history = msg.history;
      }
      renderPlayers();
      renderHistory();
      updateChipStacks([]); // clear all chips

      // Sound
      let anyWon = false, bigWin = 0;
      for (const [id, pay] of Object.entries(msg.payouts)) {
        if (pay.won > pay.lost) { anyWon = true; if (pay.won - pay.lost > bigWin) bigWin = pay.won - pay.lost; }
      }
      if (anyWon) { if (bigWin >= 500) { sndBigWin(); launchConfetti() } else sndWin(); }
      else { if (Object.values(msg.payouts).some(p => p.lost > 0)) sndLose(); }
      break;
    }

    case 'dealerChanged':
      if (gameState) gameState.dealerId = msg.dealerId;
      updateSpinButton();
      renderPlayers();
      break;

    case 'error':
      toast(msg.message);
      break;
  }
}

// ═══════════════════════════════════════
//  UI: LOBBY (Create/Join Room)
// ═══════════════════════════════════════
function showLobby() {
  document.getElementById('lobby').style.display = 'flex';
  document.getElementById('waitingRoom').style.display = 'none';
  document.getElementById('game').style.display = 'none';
}

window.createRoom = function() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { toast('Enter your name'); return; }
  // Generate room code
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  document.getElementById('lobby').style.display = 'none';
  connect(code);
  // Wait for connection then join
  const waitForOpen = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitForOpen);
      send({ type: 'join', name });
      // Configure after join
      const bal = parseInt(document.getElementById('startMoney').value) || 1000;
      const tmin = parseInt(document.getElementById('tableMin').value) || 0;
      const tmax = parseInt(document.getElementById('tableMax').value) || 0;
      setTimeout(() => send({ type: 'configure', startBalance: bal, tableMin: tmin, tableMax: tmax }), 200);
    }
  }, 100);
};

window.joinRoom = function() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name) { toast('Enter your name'); return; }
  if (!code || code.length < 4) { toast('Enter room code'); return; }
  document.getElementById('lobby').style.display = 'none';
  connect(code);
  const waitForOpen = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitForOpen);
      send({ type: 'join', name });
    }
  }, 100);
};

// ═══════════════════════════════════════
//  UI: WAITING ROOM
// ═══════════════════════════════════════
function showWaitingRoom() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'flex';
  document.getElementById('game').style.display = 'none';
  // Show room code
  const roomId = ws?.url?.split('/').pop() || '????';
  document.getElementById('roomCodeDisplay').textContent = roomId;
  renderWaitingPlayers();
  // Show/hide start button
  const startBtn = document.getElementById('startGameBtn');
  startBtn.style.display = (myId === gameState?.dealerId) ? 'block' : 'none';
}

function renderWaitingPlayers() {
  const list = document.getElementById('waitingPlayers');
  if (!gameState) return;
  list.innerHTML = Object.values(gameState.players).map(p =>
    `<li><span class="pleft"><span class="pcolor" style="background:${p.color}"></span><span class="pname">${esc(p.name)}</span></span>
    <span class="pbal">${p.id === gameState.dealerId ? 'Dealer' : ''}</span></li>`
  ).join('');
  // Update start button visibility
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) startBtn.style.display = (myId === gameState?.dealerId) ? 'block' : 'none';
}

window.startMultiplayerGame = function() {
  send({ type: 'startGame' });
};

// ═══════════════════════════════════════
//  UI: GAME
// ═══════════════════════════════════════
let gameInitialized = false;

function showGame() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  if (!gameInitialized) {
    gameInitialized = true;
    initTable(document.getElementById('tableSection'), onBetClick);
    initWheel(document.getElementById('wheelView'));
  }
  renderPlayers();
  renderHistory();
  updateSpinButton();
}

function onBetClick(betKey, el) {
  if (spinning) return;
  if (!gameState) return;
  const me = gameState.players[myId];
  if (!me) return;
  if (me.balance <= 0) { toast('You are bankrupt!'); return; }
  const totalBets = Object.values(me.bets || {}).reduce((s, v) => s + v, 0);
  if (totalBets + selectedChip > me.balance) { toast("Not enough balance"); return; }
  send({ type: 'placeBet', betKey, amount: selectedChip });
  sndChip();
  showBetPopup(el, `${betLabel(betKey)}: $${selectedChip}`);
  // Optimistically update local bets display
  if (!me.bets) me.bets = {};
  me.bets[betKey] = (me.bets[betKey] || 0) + selectedChip;
  updateChipStacks(Object.values(gameState.players).map(p => ({ color: p.color, bets: p.bets || {} })));
  renderPlayers();
}

function updateSpinButton() {
  const btn = document.getElementById('spinBtn');
  const isDealer = myId === gameState?.dealerId;
  btn.style.display = isDealer ? 'inline-block' : 'none';
  btn.disabled = spinning;
}

window.doSpin = function() {
  send({ type: 'spin' });
};

window.doUndo = function() {
  // Find last bet key for this player
  const me = gameState?.players[myId];
  if (!me || !me.bets) { toast('Nothing to undo'); return; }
  const keys = Object.keys(me.bets);
  if (keys.length === 0) { toast('Nothing to undo'); return; }
  const lastKey = keys[keys.length - 1];
  const amt = Math.min(selectedChip, me.bets[lastKey]);
  send({ type: 'removeBet', betKey: lastKey, amount: amt });
  me.bets[lastKey] -= amt;
  if (me.bets[lastKey] <= 0) delete me.bets[lastKey];
  updateChipStacks(Object.values(gameState.players).map(p => ({ color: p.color, bets: p.bets || {} })));
  renderPlayers();
};

window.doRebet = function() { send({ type: 'rebet' }); };
window.doClear = function() {
  send({ type: 'clearBets' });
  const me = gameState?.players[myId];
  if (me) me.bets = {};
  updateChipStacks(Object.values(gameState.players).map(p => ({ color: p.color, bets: p.bets || {} })));
  renderPlayers();
};

window.selectChip = function(el) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedChip = parseInt(el.dataset.value);
};

window.doToggleSound = function() {
  const on = toggleSound();
  document.getElementById('soundBtn').textContent = 'Sound: ' + (on ? 'ON' : 'OFF');
};

// ═══════════════════════════════════════
//  RENDER PLAYERS
// ═══════════════════════════════════════
function renderPlayers() {
  const grid = document.getElementById('playersGrid');
  if (!gameState) return;
  const players = Object.values(gameState.players);
  grid.innerHTML = players.map(p => {
    const tb = Object.values(p.bets || {}).reduce((s, v) => s + v, 0);
    let rh = '';
    if (p.lastResult) {
      if (p.lastResult.won > 0) rh = `<div class="pc-result win">Won $${p.lastResult.won.toLocaleString()}</div>`;
      else if (p.lastResult.lost > 0) rh = `<div class="pc-result lose">Lost $${p.lastResult.lost.toLocaleString()}</div>`;
      else rh = `<div class="pc-result" style="color:#888">No bets</div>`;
    }
    const isMe = p.id === myId;
    const isDealer = p.id === gameState.dealerId;
    return `<div class="player-card ${isMe ? 'active' : ''}" style="border-color:${isMe ? p.color : 'rgba(255,255,255,.1)'}">
      <div class="pc-header">
        <div class="pc-dot" style="background:${p.color}"></div>
        <div class="pc-name">${esc(p.name)}${isDealer ? ' (Dealer)' : ''}${isMe ? ' (You)' : ''}</div>
      </div>
      <div class="pc-balance">$${p.balance.toLocaleString()}</div>
      <div class="pc-bet-total">Bets: $${tb.toLocaleString()}</div>${rh}
    </div>`;
  }).join('');
}

function renderHistory() {
  const bar = document.getElementById('historyBar');
  if (!gameState) return;
  bar.innerHTML = (gameState.history || []).map(n =>
    `<div class="history-num ${numColor(n) === 'green' ? 'hgreen' : numColor(n) === 'red' ? 'hred' : 'hblack'}">${n}</div>`
  ).join('');
}

// ═══════════════════════════════════════
//  STATS MODAL
// ═══════════════════════════════════════
window.openStats = function() {
  if (!gameState) return;
  const sorted = Object.values(gameState.players).sort((a, b) => b.balance - a.balance);
  let html = '<h3 style="color:#ccc;margin-bottom:.5rem;font-size:.95rem">Leaderboard</h3>';
  html += '<table class="stats-table"><tr><th>#</th><th>Player</th><th>Balance</th><th>Wagered</th><th>Won</th><th>Net</th><th>Best Win</th><th>Rounds</th><th>Win %</th></tr>';
  sorted.forEach((p, i) => {
    const s = p.stats;
    const net = s.totalWon - s.totalWagered;
    const wr = s.roundsPlayed > 0 ? Math.round(s.roundsWon / s.roundsPlayed * 100) : 0;
    html += `<tr><td>${i + 1}</td><td><span class="stats-dot" style="background:${p.color}"></span>${esc(p.name)}</td>
      <td style="color:var(--gold)">$${p.balance.toLocaleString()}</td>
      <td>$${s.totalWagered.toLocaleString()}</td><td>$${s.totalWon.toLocaleString()}</td>
      <td style="color:${net >= 0 ? '#4f4' : '#f66'}">${net >= 0 ? '+' : ''}$${net.toLocaleString()}</td>
      <td>$${s.biggestWin.toLocaleString()}</td><td>${s.roundsPlayed}</td><td>${wr}%</td></tr>`;
  });
  html += '</table>';
  document.getElementById('statsContent').innerHTML = html;
  document.getElementById('statsModal').classList.add('show');
};

window.closeModals = function() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
};

// ═══════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════
document.getElementById('playerName')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.createRoom() });
document.getElementById('joinName')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.joinRoom() });
document.getElementById('roomCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.joinRoom() });

// Start on lobby
showLobby();
