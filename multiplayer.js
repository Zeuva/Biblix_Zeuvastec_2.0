/* ============================================================
   BIBLIX — modo Multiplayer (PeerJS / WebRTC).

   Princípio de design (corrige a classe de bug do jogo original):
   - O baralho (deck) é definido UMA vez pelo anfitrião e enviado
     a cada jogador ao entrar — nunca recalculado localmente. Isso
     garante que "pergunta no índice N" é sempre idêntica para todos.
   - Ao responder, cada jogador calcula certo/errado LOCALMENTE
     contra esse baralho compartilhado, e essa avaliação nunca é
     sobrescrita por uma mensagem de rede que chegue depois.
   - A rede (mensagens do anfitrião) só atualiza o placar e o
     avanço de perguntas — nunca o feedback de "você acertou".
   ============================================================ */

const QUESTION_TIME = 20; // segundos por pergunta
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

const Multi = {
  isHost: false,
  peer: null,
  conn: null,              // guest: conexão única com o anfitrião
  connections: new Map(),  // host: peerId -> DataConnection
  roomCode: '',
  myId: '',
  myName: '',
  deck: [],
  players: [],             // [{id,name,score,isHost}]
  currentIndex: -1,        // -1 = ainda não começou
  chosen: null,
  started: false,
  finished: false,
  answeredSet: new Set(),  // host: quem já respondeu a pergunta atual
  timeLeft: QUESTION_TIME,
  timerHandle: null,
  log: [],
  error: null,
  connecting: false
};

function resetMulti() {
  Multi.isHost = false;
  Multi.peer = null;
  Multi.conn = null;
  Multi.connections = new Map();
  Multi.roomCode = '';
  Multi.deck = [];
  Multi.players = [];
  Multi.currentIndex = -1;
  Multi.chosen = null;
  Multi.started = false;
  Multi.finished = false;
  Multi.answeredSet = new Set();
  Multi.timeLeft = QUESTION_TIME;
  clearMultiTimer();
  Multi.log = [];
  Multi.error = null;
  Multi.connecting = false;
}

function logLine(msg) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  Multi.log.unshift(`${time} — ${msg}`);
  if (Multi.log.length > 12) Multi.log.length = 12;
}

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 (ambíguos)
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

let peerJsLoadPromise = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (peerJsLoadPromise) return peerJsLoadPromise;
  peerJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEERJS_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PeerJS load fail'));
    document.head.appendChild(script);
  });
  return peerJsLoadPromise;
}

function peerOptions() {
  return { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
}

function clearMultiTimer() {
  if (Multi.timerHandle) { clearInterval(Multi.timerHandle); Multi.timerHandle = null; }
}

function updateTimerDOM() {
  const numEl = document.querySelector('#multi-timer-num');
  const fgEl = document.querySelector('#multi-timer-fg');
  const ringEl = document.querySelector('#multi-timer-ring');
  if (numEl) numEl.textContent = Math.max(0, Multi.timeLeft);
  if (fgEl) {
    const pct = Math.max(0, Multi.timeLeft / QUESTION_TIME);
    const r = 19, c = 2 * Math.PI * r;
    fgEl.style.strokeDashoffset = String(c * (1 - pct));
    const urgent = Multi.timeLeft <= 5;
    fgEl.style.stroke = urgent ? 'var(--wine-bright)' : 'var(--gold-bright)';
    if (ringEl) {
      const numInside = ringEl.querySelector('.num');
      if (numInside) numInside.style.color = urgent ? 'var(--wine-bright)' : 'var(--parchment)';
    }
  }
}

function startLocalTimer(onTick, onDone) {
  clearMultiTimer();
  Multi.timeLeft = QUESTION_TIME;
  updateTimerDOM();
  Multi.timerHandle = setInterval(() => {
    Multi.timeLeft -= 1;
    updateTimerDOM();
    if (typeof onTick === 'function') onTick();
    if (Multi.timeLeft <= 0) { clearMultiTimer(); onDone(); }
  }, 1000);
}


// ================= ANFITRIÃO (HOST) =================

async function hostCreateRoom() {
  if (!Multi.myName.trim()) { Multi.error = 'Digite seu nome antes de criar a sala.'; render(); return; }
  Multi.connecting = true; Multi.error = null; render();
  try {
    await loadPeerJS();
  } catch (e) {
    Multi.connecting = false;
    Multi.error = 'Não foi possível carregar o serviço de multiplayer. Verifique sua internet e tente novamente.';
    render();
    return;
  }
  resetMultiKeepIdentity();
  Multi.isHost = true;
  Multi.roomCode = genRoomCode();
  Multi.myId = Multi.roomCode;
  Multi.deck = shuffle(questionsForDeck(App.deckId));
  Multi.players = [{ id: Multi.myId, name: Multi.myName, score: 0, isHost: true }];

  const peer = new Peer(Multi.roomCode, peerOptions());
  Multi.peer = peer;

  peer.on('open', () => { Multi.connecting = false; logLine(`Sala ${Multi.roomCode} criada`); setScreen('multi-room'); });
  peer.on('error', (err) => {
    Multi.connecting = false;
    Multi.error = 'Falha ao criar sala: ' + (err?.type || err?.message || 'erro desconhecido');
    render();
  });
  peer.on('connection', (conn) => hostRegisterConnection(conn));
}

function hostRegisterConnection(conn) {
  conn.on('open', () => {
    Multi.connections.set(conn.peer, conn);
  });
  conn.on('data', (msg) => hostHandleMessage(conn, msg));
  conn.on('close', () => {
    Multi.connections.delete(conn.peer);
    Multi.players = Multi.players.filter((p) => p.id !== conn.peer);
    logLine(`Jogador saiu da sala`);
    hostBroadcast({ type: 'PLAYERS', players: Multi.players });
    render();
  });
}

function hostBroadcast(msg) {
  Multi.connections.forEach((conn) => { try { conn.send(msg); } catch (e) {} });
}

function hostHandleMessage(conn, msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'JOIN') {
    const name = (msg.name || 'Jogador').slice(0, 18);
    if (!Multi.players.find((p) => p.id === conn.peer)) {
      Multi.players.push({ id: conn.peer, name, score: 0, isHost: false });
    }
    logLine(`${name} entrou na sala`);
    try {
      conn.send({
        type: 'INIT',
        deck: Multi.deck,
        players: Multi.players,
        currentIndex: Multi.currentIndex,
        started: Multi.started,
        finished: Multi.finished,
        roomCode: Multi.roomCode
      });
    } catch (e) {}
    hostBroadcast({ type: 'PLAYERS', players: Multi.players });
    render();
  } else if (msg.type === 'ANSWER') {
    hostSubmitAnswer(conn.peer, msg.index, msg.choice);
  }
}


function updatePlayersListDOM() {
  const container = document.getElementById('multi-players-live');
  if (!container) return;
  const sorted = Multi.players.slice().sort((a,b)=>b.score-a.score);
  container.innerHTML = sorted.map(p=>`
      <div class="player-row ${p.id===Multi.myId?'me':''}">
        <div class="player-name"><span class="dot"></span>${p.isHost?'<span class="crown-mini">👑</span>':''} ${p.name}${p.id===Multi.myId?' (você)':''}</div>
        <div class="player-score">${p.score} pts</div>
      </div>`).join('');
  const countEl = document.getElementById('multi-answered-count');
  if (countEl && Multi.isHost) countEl.textContent = `${Multi.answeredSet.size}/${Multi.players.length} responderam`;
}

function updateNextButtonState() {
  const btn = document.getElementById('multi-next');
  if (!btn) return;
  if (Multi.isHost && Multi.chosen !== null) {
    btn.style.display = 'flex';
    btn.disabled = false;
  } else if (Multi.isHost && Multi.answeredSet.size>0) {
    btn.style.display = 'flex';
    btn.disabled = Multi.answeredSet.size < 1;
  } else {
    // para host, mostrar quando alguém respondeu; para convidado, esconder
    if (Multi.isHost) { btn.style.display='flex'; } else { btn.style.display='none'; }
  }
}

function hostAdvanceManual() {
  // chamado pelo botão Próximo — mantém dentro do Multiplay
  clearMultiTimer();
  hostAdvance();
}

function hostSubmitAnswer(playerId, index, choice) {
  if (index !== Multi.currentIndex) return; // resposta de uma pergunta que já passou
  if (Multi.answeredSet.has(playerId)) return; // já respondeu
  const q = Multi.deck[index];
  if (!q) return;
  const correct = choice === q.answer;
  Multi.answeredSet.add(playerId);
  Multi.players = Multi.players.map((p) => (p.id === playerId ? { ...p, score: p.score + (correct ? 1 : 0) } : p));
  const who = Multi.players.find((p) => p.id === playerId);
  logLine(`${who ? who.name : playerId} respondeu (${correct ? 'certo' : 'errado'}) · ${Multi.answeredSet.size}/${Multi.players.length}`);
  hostBroadcast({ type: 'PLAYERS', players: Multi.players });
  if (Multi.isHost) updatePlayersListDOM();
  updateNextButtonState();
  if (Multi.answeredSet.size >= Multi.players.length) {
    clearMultiTimer();
    window.setTimeout(() => hostAdvance(), 1100);
  }
}

function hostStartGame() {
  Multi.started = true;
  hostStartQuestion(0);
}

function hostStartQuestion(index) {
  Multi.currentIndex = index;
  Multi.chosen = null;
  Multi.answeredSet = new Set();
  hostBroadcast({ type: 'QUESTION', index });
  logLine(`Pergunta ${index + 1}/${Multi.deck.length}`);
  startLocalTimer(
    () => { /* atualização só do timer, sem render */ updatePlayersListDOM(); },
    () => hostTimeUp()
  );
  render();
}

function hostTimeUp() {
  // Quem não respondeu perde a vez desta pergunta (0 pontos), mas o jogo segue.
  Multi.players.forEach((p) => Multi.answeredSet.add(p.id));
  hostBroadcast({ type: 'PLAYERS', players: Multi.players });
  hostAdvance();
}

function hostAdvance() {
  const next = Multi.currentIndex + 1;
  if (next >= Multi.deck.length) { hostFinish(); return; }
  // mantém dentro da sala, sem voltar ao início
  hostStartQuestion(next);
}

function hostFinish() {
  Multi.finished = true;
  clearMultiTimer();
  hostBroadcast({ type: 'GAME_OVER', players: Multi.players });
  logLine('Partida concluída!');
  render();
}

function hostLeave() {
  hostBroadcast({ type: 'ROOM_CLOSED' });
  if (Multi.peer) Multi.peer.destroy();
  resetMulti();
  setScreen('multi-lobby');
}

// ================= CONVIDADO (GUEST) =================

async function guestJoinRoom(code) {
  if (!Multi.myName.trim()) { Multi.error = 'Digite seu nome antes de entrar.'; render(); return; }
  if (!code || code.trim().length < 4) { Multi.error = 'Digite o código da sala.'; render(); return; }
  Multi.connecting = true; Multi.error = null; render();
  try {
    await loadPeerJS();
  } catch (e) {
    Multi.connecting = false;
    Multi.error = 'Não foi possível carregar o serviço de multiplayer. Verifique sua internet e tente novamente.';
    render();
    return;
  }
  const roomCode = code.trim().toUpperCase();
  resetMultiKeepIdentity();
  Multi.isHost = false;
  Multi.roomCode = roomCode;

  const peer = new Peer(peerOptions());
  Multi.peer = peer;

  peer.on('open', (id) => {
    Multi.myId = id;
    const conn = peer.connect(roomCode, { reliable: true });
    Multi.conn = conn;
    conn.on('open', () => {
      Multi.connecting = false;
      conn.send({ type: 'JOIN', name: Multi.myName });
      logLine(`Conectado à sala ${roomCode}`);
      setScreen('multi-room');
    });
    conn.on('data', (msg) => guestHandleMessage(msg));
    conn.on('close', () => { Multi.error = 'A conexão com a sala foi encerrada.'; render(); });
    conn.on('error', () => { Multi.connecting = false; Multi.error = 'Falha na conexão com a sala.'; render(); });
  });
  peer.on('error', (err) => {
    Multi.connecting = false;
    const type = err?.type || '';
    if (type === 'peer-unavailable') Multi.error = 'Sala não encontrada. Confira o código e tente de novo.';
    else Multi.error = 'Falha ao conectar: ' + (type || err?.message || 'erro desconhecido');
    render();
  });
}

function guestHandleMessage(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'INIT') {
    Multi.deck = msg.deck;
    Multi.players = msg.players;
    Multi.currentIndex = msg.currentIndex;
    Multi.started = msg.started;
    Multi.finished = msg.finished;
    render();
  } else if (msg.type === 'PLAYERS') {
    Multi.players = msg.players;
    updatePlayersListDOM();
    updateNextButtonState();
  } else if (msg.type === 'QUESTION') {
    Multi.currentIndex = msg.index;
    Multi.chosen = null;
    Multi.started = true;
    startLocalTimer(() => {}, () => {});
    render();
  } else if (msg.type === 'GAME_OVER') {
    Multi.players = msg.players;
    Multi.finished = true;
    clearMultiTimer();
    confettiBurst();
    Sound.win();
    render();
  } else if (msg.type === 'ROOM_CLOSED') {
    Multi.error = 'O anfitrião encerrou a sala.';
    clearMultiTimer();
    render();
  }
}

function guestLeave() {
  if (Multi.conn) try { Multi.conn.close(); } catch (e) {}
  if (Multi.peer) Multi.peer.destroy();
  resetMulti();
  setScreen('multi-lobby');
}

// ================= AÇÃO COMPARTILHADA: responder =================

function submitMultiAnswer(optionIndex) {
  if (Multi.chosen !== null) return;
  const q = Multi.deck[Multi.currentIndex];
  if (!q) return;
  const correct = optionIndex === q.answer;
  Multi.chosen = optionIndex; // valor local, definitivo — nunca sobrescrito depois
  if (correct) Sound.correct(); else Sound.wrong();
  render();
  if (Multi.isHost) {
    hostSubmitAnswer(Multi.myId, Multi.currentIndex, optionIndex);
  } else if (Multi.conn) {
    try { Multi.conn.send({ type: 'ANSWER', index: Multi.currentIndex, choice: optionIndex }); } catch (e) {}
  }
}

function resetMultiKeepIdentity() {
  const name = Multi.myName;
  resetMulti();
  Multi.myName = name;
}
