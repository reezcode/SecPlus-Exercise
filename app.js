'use strict';

const main = document.querySelector('main');
const sourceLinks = ['YZkRTTzZtw','UrkNWmbQ5U','mvgNYAWnPp','eipAGdYceK','2YJkHSfgL6'];
const modes = {
  practice: ['Latihan', 'Cek kunci setelah tiap soal'],
  exam: ['Simulasi', 'Lihat skor di akhir sesi'],
  cards: ['Flashcard', 'Klik untuk balik, geser untuk pindah']
};
const storageKey = 'security-plus-study-lab-v1';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return { marks: saved.marks || {}, history: Array.isArray(saved.history) ? saved.history : [] };
  } catch {
    return { marks: {}, history: [] };
  }
}
const progress = readProgress();
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch {}
}

let sets = [];
let questions = [];
let settings = { mode:'practice', source:'all', count:10 };
let session;
let screen = 'home';
let reviewOnlyMissed = false;
let cardGesture;
let suppressCardClick = false;

function sourcePool() {
  if (settings.source === 'all') return questions;
  if (settings.source === 'again') return questions.filter(q => progress.marks[q.id] === 'again');
  return questions.filter(q => String(q.set) === settings.source);
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function isCorrect(q, selected) {
  return selected?.length === q.answers.length && q.answers.every(index => selected.includes(index));
}
function answerText(q, indices) {
  return indices?.length ? indices.map(index => q.options[index]).join(' · ') : 'Tidak dijawab';
}
function imagery(q) {
  return (q.media || []).map((name, index) => '<img class="question-image" src="media/' + escape(name) + '" alt="Lampiran soal ' + q.n + ', gambar ' + (index + 1) + '" loading="lazy" draggable="false">').join('');
}
function keyNote(q) {
  return q.answerStatus==='inferred'
    ? '<span class="key-note">Jawaban hasil analisis. Form tidak menampilkan kunci.</span>' : '';
}
function prompt(q) {
  return (q.stem ? '<h2 class="question" lang="en">' + escape(q.stem) + '</h2>' : '') + imagery(q) +
    (q.adapted ? '<p class="muted small">Detail teknis disederhanakan dari soal sumber.</p>' : '');
}
function action(name, label, type='secondary', disabled=false) {
  return '<button type="button" class="' + type + '" data-action="' + name + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
}

function renderHome() {
  const total = sourcePool().length;
  const studied = Object.values(progress.marks).filter(value => value === 'known').length;
  const again = Object.values(progress.marks).filter(value => value === 'again').length;
  settings.count = Math.min(total || 1, Math.max(1, settings.count || 1));
  const select = (value,label) => '<option value="' + value + '"' + (settings.source === value ? ' selected' : '') + '>' + label + '</option>';
  const studiedPercent = questions.length ? Math.round(100*studied/questions.length) : 0;
  main.innerHTML = '<section class="metrics" aria-label="Ringkasan belajar"><div class="panel metric-panel">' +
    '<div class="section-head"><h2>Bank overview</h2><span class="section-num">01 / DATA</span></div><div class="metric-cells">' +
    '<div class="metric-cell"><strong>' + questions.length + '</strong><span>SOAL TERSEDIA</span></div>' +
    '<div class="metric-cell"><strong>' + sets.filter(s=>s.count).length + '</strong><span>PRACTICE TEST</span></div>' +
    '<div class="metric-cell"><strong>' + progress.history.length + '</strong><span>RIWAYAT SESI</span></div></div></div>' +
    '<div class="panel metric-panel"><div class="section-head"><h2>Study activity</h2><span class="section-num">02 / PROGRESS</span></div>' +
    '<div class="activity-cells"><div><span class="muted small">Kartu dikuasai</span><div class="gauge-line"><meter class="segment-meter" min="0" max="100" value="' + studiedPercent + '" aria-label="Persentase kartu dikuasai"></meter><strong>' + studied + '<small>/' + questions.length + '</small></strong></div></div>' +
    '<div><span class="muted small">Perlu diulang</span><strong class="activity-number amber">' + again + '</strong></div>' +
    '<div><span class="muted small">Sesi terakhir</span><strong class="activity-number">' + escape(progress.history[0]?.score || '—') + '</strong></div></div></div></section>' +
    (sets.some(s=>s.count < s.expected) ? '<p class="notice">Bank soal ini memuat soal yang berhasil diperiksa. Lihat cakupan tiap practice test di bawah.</p>' : '') +
    '<div class="grid"><section class="panel"><div class="section-head"><div><h2>Konfigurasi latihan</h2><p>Pilih mode, sumber, dan jumlah soal.</p></div><span class="section-num">03 / SESSION</span></div>' +
    '<div class="modes" aria-label="Mode belajar">' + Object.entries(modes).map(([id, mode]) => '<button class="mode" type="button" data-mode="' + id + '" aria-pressed="' + (settings.mode===id) + '"><strong>' + mode[0] + '</strong><span>' + mode[1] + '</span></button>').join('') + '</div>' +
    '<div class="fields"><label class="field"><span>Sumber soal</span><select id="source">' + select('all', 'Campur semua set') +
    sets.map(s => select(String(s.set),'Practice Test ' + s.set + ' (' + s.count + ')')).join('') + select('again','Perlu diulang (' + again + ')') +
    '</select></label><label class="field"><span>Jumlah soal</span><input id="count" type="number" min="1" max="' + total + '" value="' + (total ? settings.count : '') + '"' + (!total ? ' disabled' : '') + '></label></div>' +
    '<div class="count-list" aria-label="Pilihan jumlah soal">' + [10,25,50].filter(n => n < total).map(n => '<button class="mini" type="button" data-count="' + n + '">' + n + '</button>').join('') + (total ? '<button class="mini" type="button" data-count="' + total + '">Semua (' + total + ')</button>' : '') + '</div>' +
    '<div class="actions">' + action('start','Mulai sesi →','primary',!total) + '<span class="muted small">' + total + ' soal tersedia dari sumber ini</span></div></section>' +
    '<aside class="panel"><div class="section-head"><div><h2>Question bank</h2><p>Sumber dan cakupan.</p></div><span class="section-num">04 / SOURCES</span></div>' +
    '<div class="bank-table"><table><caption class="sr-only">Sumber dan jumlah soal tiap practice test</caption><thead><tr><th>SUMBER</th><th>SOAL</th><th>STATUS</th></tr></thead><tbody>' +
    sets.map(s => '<tr><td><a href="https://forms.office.com/r/' + sourceLinks[s.set-1] + '" target="_blank" rel="noopener noreferrer">Practice Test ' + s.set + ' <span aria-hidden="true">↗</span></a></td><td>' + s.count + '</td><td><span class="source-status">' + (s.count < s.expected ? 'PARTIAL' : 'LOADED') + '</span></td></tr>').join('') + '</tbody></table></div>' +
    (questions.some(q=>q.answerStatus==='inferred') ? '<p class="muted small" style="margin:10px 0 0">' +
      questions.filter(q=>q.answerStatus==='inferred').length + ' jawaban hasil analisis diberi label di tiap soal.</p>' : '') +
    '<h3 style="margin-top:17px">Progres lokal</h3><p class="muted small">' + studied + ' kartu dikuasai · ' + again + ' perlu diulang</p>' +
    (progress.history.length ? '<ul class="history-list" aria-label="Riwayat sesi">' + progress.history.slice(0,3).map(h => '<li><span>' + escape(modes[h.mode]?.[0]) + ' · ' + escape(h.score) + '</span><time>' + escape(new Date(h.date).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})) + '</time></li>').join('') + '</ul>' : '') +
    '</aside></div>' +
    '<section class="panel console-help"><div class="section-head"><h2>Study console</h2><span class="section-num">05 / QUICK GUIDE</span></div>' +
    '<div class="console-lines"><p><span>&gt; LATIHAN</span> Pilih jawaban, lalu cek kunci tiap soal.</p>' +
    '<p><span>&gt; SIMULASI</span> Kerjakan satu sesi dan lihat skor di akhir.</p>' +
    '<p><span>&gt; FLASHCARD</span> Klik untuk balik kartu. Geser kiri/kanan atau gunakan tombol navigasi.</p></div>' +
    '<div class="console-prompt" aria-hidden="true"><span>study@security-plus</span> ~ $ <i></i></div></section>';
}

function start(items = shuffle(sourcePool()).slice(0, settings.count), mode=settings.mode) {
  if (!items.length) return;
  session = { items, mode, i:0, selected:{}, checked:{}, revealed:false, visited:{} };
  screen = 'session';
  render(true);
}
function renderSession() {
  const {items,i,mode,selected,checked,revealed} = session;
  const q = items[i];
  const chosen = selected[q.id] || [];
  const last = i === items.length-1;
  const card = mode === 'cards';
  const graded = !!checked[q.id];
  const picks = q.answers.length;
  main.innerHTML = '<section class="session"><div class="session-top">' + action('home','← Beranda') + '<span class="pill">' + modes[mode][0] + '</span></div>' +
    '<div class="meta" role="status">' + (card ? 'KARTU ' : 'SOAL ') + (i+1) + ' / ' + items.length + '</div><progress class="progress" aria-label="Progres sesi" value="' + (i+1) + '" max="' + items.length + '"></progress>' +
    '<article class="panel"><div class="pills"><span class="pill">PRACTICE TEST ' + q.set + ' · Q' + q.n + '</span>' + (!card ? '<span class="pill">' + (picks===1 ? 'PILIH SATU' : 'PILIH ' + picks + ' JAWABAN') + '</span>' : '') + '</div>' +
    (card ? renderCard(q,revealed,last) : prompt(q) + '<div class="choices" lang="en">' + q.options.map((option, index) => {
      const wasChosen = chosen.includes(index);
      const styling = graded ? q.answers.includes(index) ? ' correct' : wasChosen ? ' wrong' : '' : '';
      return '<label class="option' + styling + '"><input type="' + (picks===1 ? 'radio' : 'checkbox') + '" name="answer" value="' + index + '"' + (wasChosen?' checked':'') + (graded?' disabled':'') +
        '><span class="letter" aria-hidden="true">' + String.fromCharCode(65+index) + '</span><span class="label">' + escape(option) + '</span></label>';
    }).join('') + '</div>' +
    (graded ? '<p class="status-line' + (isCorrect(q,chosen)?'':' wrong') + '" role="status"><strong>' + (isCorrect(q,chosen)?'Benar.':'Jawaban yang benar') + '</strong> <span lang="en">' + escape(answerText(q,q.answers)) + '</span>' + keyNote(q) + '</p>' : '') +
    '<div class="actions spread">' + action('back','← Sebelumnya','secondary',i===0) + '<div class="actions" style="margin-top:0">' +
    (mode==='practice' && !graded ? action('skip',last?'Selesaikan':'Lewati') + action('check','Cek jawaban','primary',chosen.length!==picks) :
      action('next',last?'Lihat hasil':'Selanjutnya →','primary')) + '</div></div>' +
    (mode==='exam' ? '<p class="muted small" style="margin:9px 0 0">' + Object.values(selected).filter(a=>a.length).length + ' / ' + items.length + ' soal sudah diisi. Kamu bisa kembali sebelum melihat hasil.</p>' : '')) +
    '</article></section>';
}
function renderCard(q,revealed,last) {
  const question = (q.stem ? '<span class="question" lang="en">' + escape(q.stem) + '</span>' : '') +
    (q.adapted ? '<span class="muted small">Detail teknis disederhanakan dari soal sumber.</span>' : '');
  const media = imagery(q);
  const answer = q.answers.map(index => '<span class="flashcard-answer" lang="en">' + escape(q.options[index]) + '</span>').join('') + keyNote(q);
  return '<button type="button" class="flashcard" data-action="flip" data-side="' + (revealed?'answer':'question') + '" aria-describedby="card-gesture">' +
    '<span class="flashcard-faces"><span class="flashcard-face" aria-hidden="' + revealed + '"><span class="eyebrow">01 / SOAL</span>' + question + '</span>' +
    '<span class="flashcard-face" aria-hidden="' + !revealed + '"><span class="eyebrow">02 / KUNCI JAWABAN</span>' + answer + '</span>' +
    (media ? '<span class="flashcard-media">' + media + '</span>' : '') + '</span>' +
    '<span class="flashcard-hint"><span aria-hidden="true">↻</span> ' + (revealed?'Balik ke soal':'Balik untuk lihat jawaban') + '</span></button>' +
    '<p class="flashcard-gesture" id="card-gesture">Geser kiri atau kanan untuk pindah kartu.</p>' +
    '<div class="actions spread">' + action('back','← Sebelumnya','secondary',session.i===0) +
    action('next',last?'Selesai':'Berikutnya →','primary') + '</div>' +
    (revealed ? '<div class="actions flashcard-rating"><span class="muted small">Tandai kartu (opsional)</span>' +
      action('again','Perlu diulang','mini') + action('known','Sudah paham','mini') + '</div>' : '');
}

function finish() {
  const {items,mode,selected,visited} = session;
  const correct = items.filter(q => isCorrect(q,selected[q.id])).length;
  const score = mode==='cards' ? Object.values(visited).filter(v=>v==='known').length : correct;
  progress.history.unshift({mode,score:score+'/'+items.length,date:new Date().toISOString()});
  progress.history = progress.history.slice(0,10);
  persist();
  reviewOnlyMissed = false;
  screen = 'results';
  render(true);
}
function renderResults() {
  const {items,mode,selected,visited} = session;
  const card = mode==='cards';
  const correct = items.filter(q=>isCorrect(q,selected[q.id])).length;
  const known = Object.values(visited).filter(v=>v==='known').length;
  const again = Object.values(visited).filter(v=>v==='again').length;
  const missed = card ? items.filter(q=>visited[q.id]==='again') : items.filter(q=>!isCorrect(q,selected[q.id]));
  const shown = reviewOnlyMissed ? missed : items;
  const score = card ? known : correct;
  main.innerHTML = '<section class="session"><div class="session-top">' + action('home','← Beranda') + '<span class="pill">' + modes[mode][0] + '</span></div>' +
    '<article class="panel"><p class="eyebrow">HASIL SESI</p><h1 class="score">' + score + ' / ' + items.length + '</h1><p class="muted">' +
    (card ? 'Kartu dikuasai · ' + again + ' perlu diulang · ' + (items.length-known-again) + ' belum ditandai' :
      'Jawaban benar · ' + Math.round(100*correct/items.length) + '% · ' + items.filter(q=>!selected[q.id]?.length).length + ' kosong') + '</p>' +
    '<div class="actions">' + action('restart','Ulang sesi','primary') + action('retry',card?'Latih kartu yang perlu diulang':'Latih soal yang salah', 'secondary',!missed.length) + '</div>' +
    '<div class="review"><div class="section-head"><h2>Review jawaban</h2>' + action('filter',reviewOnlyMissed?'Tampilkan semua':'Filter perlu diulang','mini',!missed.length) + '</div>' +
    shown.map(q => '<details><summary><span class="meta">TEST ' + q.set + ' · Q' + q.n + '</span> ' +
      (card ? visited[q.id]==='known'?'Dikuasai':visited[q.id]==='again'?'Perlu diulang':'Belum ditandai' :
        isCorrect(q,selected[q.id])?'Benar':selected[q.id]?.length?'Salah':'Kosong') + ' · <span lang="en">' +
      escape(q.stem?.split('\n')[0].slice(0,100)||'Soal bergambar') + '</span></summary>' + prompt(q) +
      (card ? '' : '<p>Jawabanmu <span lang="en">' + escape(answerText(q,selected[q.id])) + '</span></p>') +
      '<p><strong>Kunci jawaban</strong> <span lang="en">' + escape(answerText(q,q.answers)) + '</span>' + keyNote(q) + '</p></details>').join('') + '</div></article></section>';
}

function render(focus=false) {
  document.querySelector('#console-location').textContent = screen==='home' ? 'DASHBOARD' : modes[session.mode][0].toUpperCase();
  document.querySelector('[data-console-home]').setAttribute('aria-pressed', String(screen==='home'));
  document.querySelectorAll('[data-console-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(screen!=='home' && button.dataset.consoleMode===session.mode));
  });
  if (screen==='home') renderHome();
  if (screen==='session') renderSession();
  if (screen==='results') renderResults();
  if (focus) {
    main.focus({preventScroll:true});
    window.scrollTo(0,0);
  }
}
function advance() {
  if (session.i === session.items.length-1) { finish(); return; }
  moveQuestion(1);
}
function moveQuestion(step) {
  const index = session.i + step;
  if (index < 0 || index >= session.items.length) return;
  session.i = index;
  session.revealed = false;
  render(true);
}
function goHome() {
  screen = 'home';
  render(true);
}
function updateCount() {
  const raw = main.querySelector('#count').valueAsNumber;
  settings.count = Number.isFinite(raw) ? Math.floor(raw) : 1;
  settings.count = Math.max(1,Math.min(sourcePool().length || 1,settings.count));
}

document.querySelectorAll('.brand,.console-title').forEach(link => {
  link.addEventListener('click',event=>{event.preventDefault();goHome();});
});
document.querySelector('.rail').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button) return;
  if (button.dataset.consoleMode) settings.mode=button.dataset.consoleMode;
  goHome();
  main.querySelector('[data-mode="' + settings.mode + '"]').focus({preventScroll:true});
});
main.addEventListener('change',event=>{
  const input = event.target;
  if (input.id==='source') { updateCount(); settings.source=input.value; render(); main.querySelector('#source').focus(); }
  if (input.name!=='answer') return;
  const q=session.items[session.i];
  let selected=[...main.querySelectorAll('input[name="answer"]:checked')].map(item=>Number(item.value));
  if (selected.length > q.answers.length) {
    input.checked=false;
    selected=selected.filter(i=>i!==Number(input.value));
  }
  session.selected[q.id]=selected;
  const check = main.querySelector('[data-action="check"]');
  if (check) check.disabled=selected.length!==q.answers.length;
});
main.addEventListener('pointerdown',event=>{
  if (!event.isPrimary || event.button!==0) return;
  suppressCardClick = false;
  cardGesture = event.target.closest('.flashcard')
    ? {id:event.pointerId,x:event.clientX,y:event.clientY} : undefined;
});
main.addEventListener('pointercancel',event=>{
  if (cardGesture?.id===event.pointerId) cardGesture = undefined;
});
main.addEventListener('pointerup',event=>{
  if (cardGesture?.id!==event.pointerId) return;
  const dx = event.clientX - cardGesture.x;
  const dy = event.clientY - cardGesture.y;
  cardGesture = undefined;
  if (screen!=='session' || session.mode!=='cards') return;
  if (Math.abs(dx)<45 || Math.abs(dx)<Math.abs(dy)*1.35) return;
  suppressCardClick = true;
  moveQuestion(dx<0 ? 1 : -1);
});

main.addEventListener('click',event=>{
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.mode) {
    updateCount();
    settings.mode=button.dataset.mode;
    render();
    main.querySelector('[data-mode="'+settings.mode+'"]').focus();
    return;
  }
  if (button.dataset.count) {
    settings.count=Number(button.dataset.count);
    main.querySelector('#count').value=settings.count;
    return;
  }
  const act=button.dataset.action;
  if (act==='home') { goHome(); return; }
  if (act==='start') { updateCount(); start(); return; }
  if (!session) return;
  const q = session.items[session.i];
  if (act==='check') { session.checked[q.id]=true; render(); main.querySelector('[data-action="next"]').focus(); }
  if (act==='next'||act==='skip') advance();
  if (act==='back') moveQuestion(-1);
  if (act==='flip' && (!suppressCardClick || event.detail===0)) {
    session.revealed = !session.revealed;
    render();
    const card = main.querySelector('.flashcard');
    card.classList.add('is-flipping');
    card.focus({preventScroll:true});
  }
  if (act==='again'||act==='known') { progress.marks[q.id]=act; session.visited[q.id]=act; persist(); advance(); }
  if (act==='filter') { reviewOnlyMissed=!reviewOnlyMissed; render(); main.querySelector('[data-action="filter"]').focus(); }
  if (act==='restart') start(shuffle(session.items),session.mode);
  if (act==='retry') start(session.items.filter(item => session.mode==='cards' ? session.visited[item.id]==='again' : !isCorrect(item,session.selected[item.id])),session.mode);
});

fetch('bank.json').then(response=>{
  if (!response.ok) throw new Error('Bank soal belum tersedia.');
  return response.json();
}).then(data=>{
  sets=data.sets;
  questions=data.questions;
  render();
}).catch(()=>{
  main.innerHTML='<p class="notice" role="alert">Bank soal gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>';
});
