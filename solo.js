/* ============================================================
   BIBLIX — modo Solo. FIX: sem piscar.
   Preserva textos, layout, cores e estilo.
   ============================================================ */

const SoloState = {
  deck: [],
  index: 0,
  score: 0,
  chosen: null,
  finished: false,
  _lastRenderedId: null
};

function startSolo() {
  SoloState.deck = shuffle(questionsForDeck(App.deckId));
  SoloState.index = 0;
  SoloState.score = 0;
  SoloState.chosen = null;
  SoloState.finished = false;
  SoloState._lastRenderedId = null;
  setScreen('solo');
}

function currentSoloQuestion() { return SoloState.deck[SoloState.index]; }

function answerSolo(optionIndex) {
  if (SoloState.chosen !== null) return;
  const q = currentSoloQuestion();
  const correct = optionIndex === q.answer;
  SoloState.chosen = optionIndex;
  if (correct) { SoloState.score += 1; Sound.correct(); } else { Sound.wrong(); }
  // atualização estável sem recriar a página inteira
  updateSoloFeedback();
  window.setTimeout(() => {
    if (SoloState.index + 1 >= SoloState.deck.length) {
      SoloState.finished = true;
      confettiBurst();
      Sound.win();
      render();
    } else {
      SoloState.index += 1;
      SoloState.chosen = null;
      render();
    }
  }, 1100);
}

function renderSolo() {
  if (SoloState.finished) return renderSoloResult();
  const q = currentSoloQuestion();
  const total = SoloState.deck.length;
  const needsFullRebuild = !document.querySelector('[data-screen="solo"]') || SoloState._lastRenderedId !== q.id;

  if (needsFullRebuild) {
    SoloState._lastRenderedId = q.id;
    root.innerHTML = `
      <div class="app" data-screen="solo" data-qid="${q.id}">
        ${renderHeader('solo')}
        <div class="game-status">
          <span>Pergunta <b id="solo-q-num">${SoloState.index + 1}</b> / ${total} · <span id="solo-deck-label">${deckLabel(App.deckId)}</span></span>
          <span>Pontos: <b id="solo-score">${SoloState.score}</b></span>
        </div>
        <div class="progress"><i id="solo-progress" style="width:${(SoloState.index / total) * 100}%"></i></div>

        <div class="card unfurl" id="solo-card">
          <div class="q-meta"><span id="solo-q-meta">${q.group} · #${String(q.id).padStart(3,'0')}</span><span>${deckLabel(App.deckId)} · ${total}Q</span></div>
          <div class="q-text" id="solo-q-text">${q.q}</div>
          <div class="options" id="solo-options">
            ${q.options.map((opt,i)=>optionHTML(q,i,null)).join('')}
          </div>
          <div id="solo-feedback"></div>
        </div>
      </div>
    `;
    wireHeader();
    root.querySelectorAll('#solo-options .option').forEach((btn)=>{
      btn.addEventListener('click',()=>answerSolo(Number(btn.dataset.i)));
    });
  } else {
    // atualização leve se permaneceu na mesma pergunta (ex: pontuação mudou antes)
    const numEl = document.getElementById('solo-q-num');
    if (numEl) numEl.textContent = SoloState.index + 1;
    const scoreEl = document.getElementById('solo-score');
    if (scoreEl) scoreEl.textContent = SoloState.score;
  }
}

function updateSoloFeedback(){
  const q = currentSoloQuestion();
  const options = document.querySelectorAll('#solo-options .option');
  options.forEach((btn)=>{
    const i = Number(btn.dataset.i);
    btn.disabled = true;
    btn.classList.remove('correct','wrong');
    let check = btn.querySelector('.option-check');
    if (check) check.remove();
    if (i === q.answer) {
      btn.classList.add('correct');
      btn.insertAdjacentHTML('beforeend','<span class="option-check">✓</span>');
    } else if (i === SoloState.chosen) {
      btn.classList.add('wrong');
      btn.insertAdjacentHTML('beforeend','<span class="option-check">✗</span>');
    }
  });
  const fb = document.getElementById('solo-feedback');
  if (fb) fb.innerHTML = feedbackHTML(SoloState.chosen === q.answer, q);
  const scoreEl = document.getElementById('solo-score');
  if (scoreEl) scoreEl.textContent = SoloState.score;
}

function optionHTML(q, i, chosen) {
  let cls = 'option';
  let mark = '';
  if (chosen !== null) {
    if (i === q.answer) { cls += ' correct'; mark = '<span class="option-check">✓</span>'; }
    else if (i === chosen) { cls += ' wrong'; mark = '<span class="option-check">✗</span>'; }
  }
  return `<button class="${cls}" data-i="${i}" ${chosen !== null ? 'disabled' : ''}>
    <span class="option-letter">${letterFor(i)}</span><span>${q.options[i]}</span>${mark}
  </button>`;
}

function feedbackHTML(correct, q) {
  return `<div class="feedback ${correct ? 'correct' : 'wrong'}">
    ${correct ? '✓ Correto! +1 ponto' : `✗ Errado. A resposta certa é: ${q.options[q.answer]}`}
  </div>`;
}

function renderSoloResult() {
  const total = SoloState.deck.length;
  const pct = Math.round((SoloState.score / total) * 100);
  const grade = pct >= 90 ? 'Excelente!' : pct >= 70 ? 'Muito bom!' : pct >= 50 ? 'Bom começo!' : 'Continue estudando!';
  root.innerHTML = `
    <div class="app">
      ${renderHeader('solo')}
      <div class="modal-backdrop">
        <div class="modal">
          <div class="crown">🏆</div>
          <h2>${grade}</h2>
          <div class="score-big">${SoloState.score} / ${total}</div>
          <div class="score-sub">${pct}% de acerto · ${deckLabel(App.deckId)}</div>
          <div class="modal-actions">
            <button class="btn btn-primary btn-block" id="play-again">↻ Jogar de novo</button>
            <div class="row">
              <button class="btn btn-secondary" id="back-home">🏠 Menu</button>
              <button class="btn btn-ghost" id="share-result">📤 Compartilhar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  wireHeader();
  document.getElementById('play-again').addEventListener('click', () => startSolo());
  document.getElementById('back-home').addEventListener('click', () => setScreen('home'));
  document.getElementById('share-result').addEventListener('click', () => {
    const text = `🏆 BIBLIX Zeuvastec — Fiz ${SoloState.score}/${total} pontos (${pct}%) no cartão ${deckLabel(App.deckId)}!`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard?.writeText(text); toast('Resultado copiado!'); }
  });
}
