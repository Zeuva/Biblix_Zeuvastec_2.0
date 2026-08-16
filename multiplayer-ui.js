/* ============================================================
   BIBLIX — telas do modo Multiplayer.
   ============================================================ */

function renderMultiLobby() {
  const count = totalFor(App.deckId);
  root.innerHTML = `
    <div class="app">
      ${renderHeader('multi')}
      <section class="hero" style="padding-top:6px">
        <div class="hero-badge">👥 Multiplayer em tempo real · placar ao vivo</div>
        <h1 style="font-size:30px">Jogue com amigos</h1>
        <p>Crie uma sala e compartilhe o código, ou entre com um código que você recebeu.</p>
      </section>

      <div class="decks">
        <div class="decks-label">Cartão da partida (vale para a sala que você criar)</div>
        ${renderDeckSeals()}
      </div>

      ${Multi.error ? `<div class="panel" style="border-color:var(--wine-bright)"><p style="color:var(--wine-bright);margin:0;font-size:14px">⚠ ${Multi.error}</p></div>` : ''}

      <div class="panel">
        <h3>Seu nome</h3>
        <div class="field">
          <input id="player-name" type="text" maxlength="18" placeholder="Ex: João" value="${Multi.myName || ''}" />
          <div class="field-hint">Aparecerá para os outros jogadores na sala.</div>
        </div>
      </div>

      <div class="panel">
        <h3>Criar uma sala nova</h3>
        <p style="font-size:13px;color:var(--parchment-dim);margin:0 0 14px">Cartão selecionado: <b style="color:var(--gold-bright)">${deckLabel(App.deckId)} · ${count}Q</b></p>
        <button class="btn btn-primary btn-block" id="create-room" ${Multi.connecting ? 'disabled' : ''}>
          ${Multi.connecting && Multi.pendingAction === 'create' ? 'Criando sala…' : '👑 Criar sala'}
        </button>
      </div>

      <div class="panel">
        <h3>Entrar em uma sala</h3>
        <div class="field">
          <label>Código da sala</label>
          <input id="room-code" type="text" maxlength="6" placeholder="Ex: A3F9K2" style="text-transform:uppercase;letter-spacing:.1em" />
        </div>
        <button class="btn btn-secondary btn-block" id="join-room" ${Multi.connecting ? 'disabled' : ''}>
          ${Multi.connecting && Multi.pendingAction === 'join' ? 'Entrando…' : '🔑 Entrar na sala'}
        </button>
      </div>

      <p class="footer-note">Multiplayer via conexão direta (PeerJS). Funciona melhor com internet estável.</p>
    </div>
  `;
  wireHeader();
  wireDeckSeals(renderMultiLobby);
  const nameInput = document.getElementById('player-name');
  nameInput.addEventListener('input', () => { Multi.myName = nameInput.value; localStorage.setItem('biblix2-name', Multi.myName); });
  document.getElementById('create-room').addEventListener('click', () => {
    Multi.myName = nameInput.value;
    Multi.pendingAction = 'create';
    hostCreateRoom();
  });
  document.getElementById('join-room').addEventListener('click', () => {
    Multi.myName = nameInput.value;
    Multi.pendingAction = 'join';
    const code = document.getElementById('room-code').value;
    guestJoinRoom(code);
  });
}

function renderMultiRoom() {
  if (Multi.error && !Multi.started) return renderMultiError();
  if (Multi.finished) return renderMultiResult();
  if (!Multi.started) return renderMultiWaiting();
  return renderMultiQuestion();
}

function renderMultiError() {
  root.innerHTML = `
    <div class="app">
      ${renderHeader('multi')}
      <div class="panel" style="border-color:var(--wine-bright);text-align:center;padding:34px 22px">
        <div style="font-size:34px;margin-bottom:10px">⚠</div>
        <h3 style="color:var(--wine-bright)">Algo interrompeu a sala</h3>
        <p style="color:var(--parchment-dim);font-size:14px;margin:8px 0 20px">${Multi.error}</p>
        <button class="btn btn-primary" id="back-lobby">← Voltar</button>
      </div>
    </div>`;
  document.getElementById('back-lobby').addEventListener('click', () => { resetMultiKeepIdentity(); setScreen('multi-lobby'); });
}

function renderPlayersList(highlightMe) {
  const sorted = Multi.players.slice().sort((a, b) => b.score - a.score);
  return `<div class="players-list">
    ${sorted.map((p) => `
      <div class="player-row ${highlightMe && p.id === Multi.myId ? 'me' : ''}">
        <div class="player-name">
          <span class="dot"></span>
          ${p.isHost ? '<span class="crown-mini">👑</span>' : ''}
          ${p.name}${p.id === Multi.myId ? ' (você)' : ''}
        </div>
        <div class="player-score">${p.score} pts</div>
      </div>`).join('')}
  </div>`;
}

function renderMultiWaiting() {
  root.innerHTML = `
    <div class="app">
      ${renderHeader('multi')}
      <div class="panel" style="text-align:center">
        <div class="decks-label">Código da sala</div>
        <div style="font-family:'Spectral',serif;font-size:40px;font-weight:700;letter-spacing:.12em;color:var(--gold-bright);margin:6px 0 4px">${Multi.roomCode}</div>
        <p style="font-size:13px;color:var(--parchment-dim);margin:0 0 18px">Compartilhe esse código para outras pessoas entrarem · Cartão ${deckLabel(App.deckId)} · ${Multi.deck.length}Q</p>
      </div>

      <div class="panel">
        <h3>Jogadores na sala (${Multi.players.length})</h3>
        ${renderPlayersList(true)}
      </div>

      ${Multi.isHost ? `
        <button class="btn btn-primary btn-block" id="start-game" style="margin-top:18px">▶ Iniciar partida</button>
      ` : `
        <div class="panel" style="text-align:center;color:var(--parchment-dim);font-size:14px">Aguardando o anfitrião iniciar a partida…</div>
      `}

      <div class="panel">
        <h3>Registro da sala</h3>
        <div class="log-box">${Multi.log.length ? Multi.log.map((l) => `<div>${l}</div>`).join('') : 'Nenhum evento ainda…'}</div>
      </div>

      <button class="btn btn-ghost btn-block" id="leave-room" style="margin-top:14px">Sair da sala</button>
    </div>
  `;
  wireHeader();
  if (Multi.isHost) document.getElementById('start-game').addEventListener('click', () => hostStartGame());
  document.getElementById('leave-room').addEventListener('click', () => (Multi.isHost ? hostLeave() : guestLeave()));
}


function renderMultiQuestion() {
  const q = Multi.deck[Multi.currentIndex];
  const total = Multi.deck.length;
  const existing = document.querySelector('[data-screen="multi-question"]');
  const needsFull = !existing || Number(existing.dataset.qid) !== q.id;

  if (needsFull) {
    root.innerHTML = `
    <div class="app" data-screen="multi-question" data-qid="${q.id}">
      ${renderHeader('multi')}
      <div class="game-status">
        <span>Pergunta <b id="multi-q-pos">${Multi.currentIndex + 1}</b> / ${total} · Sala ${Multi.roomCode}</span>
        <div id="multi-timer-ring">${renderTimerRing()}</div>
      </div>
      <div class="progress"><i id="multi-progress" style="width:${(Multi.currentIndex / total) * 100}%"></i></div>

      <div class="card unfurl" id="multi-card">
        <div class="q-meta"><span>${q.group} · #${String(q.id).padStart(3, '0')}</span><span>${deckLabel(App.deckId)}</span></div>
        <div class="q-text" id="multi-q-text">${q.q}</div>
        <div class="options" id="multi-options">
          ${q.options.map((opt, i) => optionHTML(q, i, Multi.chosen)).join('')}
        </div>
        <div id="multi-feedback">${Multi.chosen !== null ? `${feedbackHTML(Multi.chosen === q.answer, q)}<div class="feedback-note" id="multi-answered-count">${Multi.isHost?`${Multi.answeredSet.size}/${Multi.players.length} responderam`:'Aguardando os outros jogadores…'}</div>` : ''}</div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" id="multi-next" style="${Multi.chosen!==null || (Multi.isHost && Multi.answeredSet.size>0) ? 'display:flex' : 'display:none'}">Próximo →</button>
        </div>
      </div>

      <div class="panel">
        <h3>Placar ao vivo</h3>
        <div id="multi-players-live">${renderPlayersList(true)}</div>
      </div>
    </div>
  `;
    wireHeader();
    const nextBtn = document.getElementById('multi-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (Multi.isHost) hostAdvanceManual();
      });
    }
    if (Multi.chosen === null) {
      root.querySelectorAll('#multi-options .option').forEach((btn) => {
        btn.addEventListener('click', () => submitMultiAnswer(Number(btn.dataset.i)));
      });
    }
  } else {
    // atualização leve sem recriar cartão - evita piscar
    const posEl = document.getElementById('multi-q-pos');
    if (posEl) posEl.textContent = Multi.currentIndex+1;
    const prog = document.getElementById('multi-progress');
    if (prog) prog.style.width = (Multi.currentIndex/total*100)+'%';
    updatePlayersListDOM();
    updateNextButtonState();
    if (Multi.chosen !== null) {
      updateMultiFeedback();
    }
  }
}

function updateMultiFeedback(){
  const q = Multi.deck[Multi.currentIndex];
  const options = document.querySelectorAll('#multi-options .option');
  options.forEach(btn=>{
    const i=Number(btn.dataset.i);
    btn.disabled=true;
    btn.classList.remove('correct','wrong');
    const old=btn.querySelector('.option-check');
    if (old) old.remove();
    if (i===q.answer){ btn.classList.add('correct'); btn.insertAdjacentHTML('beforeend','<span class="option-check">✓</span>'); }
    else if (i===Multi.chosen){ btn.classList.add('wrong'); btn.insertAdjacentHTML('beforeend','<span class="option-check">✗</span>'); }
  });
  const fb = document.getElementById('multi-feedback');
  if (fb) {
    fb.innerHTML = `${feedbackHTML(Multi.chosen===q.answer,q)}<div class="feedback-note" id="multi-answered-count">${Multi.isHost?`${Multi.answeredSet.size}/${Multi.players.length} responderam`:'Aguardando os outros jogadores…'}</div>`;
  }
  updateNextButtonState();
}

function renderTimerRing() {
  const pct = Math.max(0, Multi.timeLeft / QUESTION_TIME);
  const r = 19, c = 2 * Math.PI * r;
  const urgent = Multi.timeLeft <= 5;
  return `<div class="timer-ring" id="multi-timer-ring-inner">
    <svg width="46" height="46"><circle class="bg" cx="23" cy="23" r="${r}"></circle>
      <circle class="fg" id="multi-timer-fg" cx="23" cy="23" r="${r}" style="stroke:${urgent ? 'var(--wine-bright)' : 'var(--gold-bright)'};stroke-dasharray:${c};stroke-dashoffset:${c * (1 - pct)}"></circle>
    </svg>
    <div class="num" id="multi-timer-num" style="color:${urgent ? 'var(--wine-bright)' : 'var(--parchment)'}">${Math.max(0, Multi.timeLeft)}</div>
  </div>`;
}


function renderMultiResult() {
  const sorted = Multi.players.slice().sort((a, b) => b.score - a.score);
  const me = Multi.players.find((p) => p.id === Multi.myId);
  const total = Multi.deck.length;
  root.innerHTML = `
    <div class="app">
      ${renderHeader('multi')}
      <div class="modal-backdrop">
        <div class="modal" style="max-width:440px">
          <div class="crown">🏆</div>
          <h2>Partida concluída!</h2>
          <div class="score-big">${me ? me.score : 0} / ${total}</div>
          <div class="score-sub">Sua pontuação final</div>
          <div class="players-list" style="text-align:left;margin-bottom:22px">
            ${sorted.map((p, i) => `
              <div class="player-row ${p.id === Multi.myId ? 'me' : ''}">
                <div class="player-name">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`} ${p.name}${p.id === Multi.myId ? ' (você)' : ''}</div>
                <div class="player-score">${p.score} pts</div>
              </div>`).join('')}
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary btn-block" id="back-home2">🏠 Voltar ao início</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('back-home2').addEventListener('click', () => {
    if (Multi.isHost) hostLeave(); else guestLeave();
    setScreen('home');
  });
}
