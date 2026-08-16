/* ============================================================
   BIBLIX — estado global, roteador de telas e tela inicial.
   ============================================================ */

const App = {
  screen: 'home', // home | solo | multi-lobby | multi-room
  deckId: 'ALL',
  playerName: localStorage.getItem('biblix2-name') || ''
};

const root = document.getElementById('app');

function totalFor(deckId) { return questionsForDeck(deckId).length; }

function render() {
  if (App.screen === 'home') return renderHome();
  if (App.screen === 'solo') return renderSolo();
  if (App.screen === 'multi-lobby') return renderMultiLobby();
  if (App.screen === 'multi-room') return renderMultiRoom();
}

function setScreen(screen) { App.screen = screen; render(); }

function deckLabel(deckId) { return deckId === 'ALL' ? 'Todos' : deckId; }

function renderDeckSeals(onSelect) {
  const items = [{ id: 'ALL', count: QUESTIONS.length }, ...DECKS];
  return `<div class="deck-row" role="tablist" aria-label="Selecionar cartão">
    ${items.map((d) => `
      <button class="seal ${App.deckId === d.id ? 'active' : ''}" role="tab" aria-selected="${App.deckId === d.id}" data-deck="${d.id}">
        <span class="seal-mark">${d.id === 'ALL' ? '●' : d.id.replace('C', '')}</span>
        <span class="seal-label">${d.id === 'ALL' ? 'Todos' : d.id}</span>
      </button>`).join('')}
  </div>`;
}

function wireDeckSeals(onSelect) {
  root.querySelectorAll('[data-deck]').forEach((btn) => {
    btn.addEventListener('click', () => {
      App.deckId = btn.dataset.deck;
      Sound.click();
      onSelect();
    });
  });
}

function renderHeader(activeMode) {
  return `<header class="header">
    <div class="brand">
      <div class="brand-seal">B</div>
      <div>
        <div class="brand-name">BIBLIX <b>Zeuvastec</b></div>
        <div class="brand-tag">Perguntas bíblicas</div>
      </div>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="sound-toggle" aria-label="Alternar som" title="Som">${Sound.isOn() ? '🔊' : '🔇'}</button>
      <div class="mode-toggle">
        <button data-mode="solo" class="${activeMode === 'solo' ? 'active' : ''}">Solo</button>
        <button data-mode="multi" class="${activeMode === 'multi' ? 'active' : ''}">Multi</button>
      </div>
    </div>
  </header>`;
}

function wireHeader() {
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) soundBtn.addEventListener('click', () => { Sound.toggle(); render(); });
  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === 'solo') setScreen('home');
      else setScreen('multi-lobby');
    });
  });
}

function renderHome() {
  const count = totalFor(App.deckId);
  root.innerHTML = `
    <div class="app">
      ${renderHeader('solo')}
      <section class="hero">
        <div class="hero-badge">📜 <b>${QUESTIONS.length}</b> perguntas · ${DECKS.length} cartões · sem repetir conteúdo original</div>
        <h1>Biblix Zeuvastec <br>Technology</h1>
        <p>Responda sozinho no seu ritmo, ou desafie amigos em tempo real. Escolha um cartão específico ou jogue com todas as perguntas.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="start-solo">▶ Jogar Solo · ${count}Q</button>
          <button class="btn btn-secondary" id="start-multi">👥 Multiplayer · ${count}Q</button>
        </div>
      </section>

      <div class="decks">
        <div class="decks-label">Filtrar cartão</div>
        ${renderDeckSeals()}
      </div>

      <div class="features">
        <div class="feature"><h3>Solo</h3><p>Progresso ao vivo, som de acerto e erro, e resumo da pontuação ao final.</p></div>
        <div class="feature"><h3>Multiplayer</h3><p>Crie uma sala e jogue com amigos em tempo real, com placar ao vivo.</p></div>
        <div class="feature"><h3>Efeitos</h3><p>Animações de acerto/erro e confete ao concluir um cartão.</p></div>
      </div>

      <p class="footer-note">BIBLIX Zeuvastec · ${QUESTIONS.length} perguntas · ${DECKS.length} cartões · conteúdo original preservado</p>
    </div>
  `;
  wireHeader();
  wireDeckSeals(renderHome);
  document.getElementById('start-solo').addEventListener('click', () => startSolo());
  document.getElementById('start-multi').addEventListener('click', () => setScreen('multi-lobby'));
}

document.addEventListener('DOMContentLoaded', () => { render(); });
