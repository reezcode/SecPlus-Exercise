'use strict';

const main = document.querySelector('main');
const sourceLinks = ['YZkRTTzZtw','UrkNWmbQ5U','mvgNYAWnPp','eipAGdYceK','2YJkHSfgL6'];
const modes = {
  practice: ['Latihan', 'Cek kunci setelah tiap soal'],
  exam: ['Simulasi', 'Ujian 90 menit atau latihan tanpa timer'],
  cards: ['Flashcard', 'Klik untuk balik, geser untuk pindah']
};
const storageKey = 'security-plus-study-lab-v1';
const timedExamKey = 'security-plus-timed-exam-v1';
const examLength = 90;
const examPbqCount = 4;
const examDuration = 90 * 60 * 1000;
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
let examInterval;

function isPbq(q) {
  return q.type === 'pbq';
}
function setTitle(set) {
  return sets.find(entry => entry.set === set)?.title ?? ('Practice Test ' + set);
}
function sourcePool() {
  const pool = settings.mode === 'cards' ? questions.filter(q => !isPbq(q)) : questions;
  if (settings.source === 'all') return pool;
  if (settings.source === 'again') return pool.filter(q => progress.marks[q.id] === 'again');
  return pool.filter(q => String(q.set) === settings.source);
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function hasResponse(selected) {
  return selected?.some(Number.isInteger) ?? false;
}
function isComplete(q, selected) {
  return selected?.length === (isPbq(q) ? q.tasks.length : q.answers.length) &&
    selected.every(Number.isInteger);
}
function isCorrect(q, selected) {
  if (!isComplete(q, selected)) return false;
  if (isPbq(q)) return q.tasks.every((task, index) => selected[index] === task.answer);
  return q.answers.every(index => selected.includes(index));
}
function shuffleChoices(choices) {
  return shuffle(choices.map((_, index) => index));
}
function validOrder(order, size) {
  return Array.isArray(order) && order.length === size && new Set(order).size === size &&
    order.every(index => Number.isInteger(index) && index >= 0 && index < size);
}
function formatExamTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}

function saveTimedExam() {
  if (!session?.timed) return;
  const {items, optionOrder, i, selected, timed} = session;
  try {
    sessionStorage.setItem(timedExamKey, JSON.stringify({ids:items.map(q => q.id), optionOrder, i, selected, timed}));
  } catch {}
}

function clearTimedExam() {
  clearInterval(examInterval);
  try { sessionStorage.removeItem(timedExamKey); } catch {}
}

function restoreTimedExam() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(timedExamKey));
    if (!saved) return false;
    const bank = new Map(questions.map(q => [q.id, q]));
    const items = saved.ids.map(id => bank.get(id));
    if (!saved.selected || !saved.timed?.flagged || items.length !== examLength || items.some(q => !q) || new Set(saved.ids).size !== examLength ||
        !Number.isFinite(saved.timed.deadline) || !Number.isInteger(saved.i) || !items[saved.i] ||
        items.some(q => {
          const order = saved.optionOrder[q.id];
          if (isPbq(q)) {
            return order?.length !== q.tasks.length ||
              q.tasks.some((task, index) => !validOrder(order[index], task.choices.length));
          }
          return !validOrder(order, q.options.length);
        })) {
      clearTimedExam();
      return false;
    }
    const {optionOrder, i, selected, timed} = saved;
    session = {items, optionOrder, i, selected, timed, mode:'exam', checked:{}, visited:{}};
    settings.mode = 'exam';
    if (readReviewRoute()) history.replaceState(null, '', location.pathname + location.search);
    screen = 'session';
    render();
    beginExamClock();
    return true;
  } catch {
    clearTimedExam();
    return false;
  }
}

function updateExamClock() {
  if (screen !== 'session' || !session?.timed) return false;
  const remaining = session.timed.deadline - Date.now();
  if (remaining <= 0) {
    finish('expired');
    return true;
  }
  const timer = main.querySelector('#exam-clock');
  if (timer) {
    const time = formatExamTime(remaining);
    if (timer.textContent !== time) timer.textContent = time;
    timer.classList.toggle('exam-clock-low', remaining <= 5 * 60 * 1000);
  }
  return false;
}

function beginExamClock() {
  clearInterval(examInterval);
  if (!updateExamClock()) examInterval = setInterval(updateExamClock, 250);
}

function startTimedExam() {
  const mcq = questions.filter(q => !isPbq(q));
  const pbq = questions.filter(isPbq);
  if (mcq.length < examLength - examPbqCount || pbq.length < examPbqCount) return;
  settings.mode = 'exam';
  const sample = shuffle(mcq).slice(0, examLength - examPbqCount).concat(shuffle(pbq).slice(0, examPbqCount));
  start(shuffle(sample), 'exam', {deadline:Date.now() + examDuration, flagged:{}});
}

function examCounts() {
  const {items, selected, timed} = session;
  return {
    incomplete: items.filter(q => !isComplete(q, selected[q.id])).length,
    flagged: Object.values(timed.flagged).filter(Boolean).length
  };
}

function updateExamProgress() {
  const progressStatus = main.querySelector('#exam-progress-status');
  if (progressStatus) {
    const {incomplete, flagged} = examCounts();
    progressStatus.textContent = (session.items.length - incomplete) + ' / ' + session.items.length +
      ' terjawab · ' + flagged + ' ditandai';
  }
}

function showExamDialog(confirmSubmission = false) {
  const dialog = main.querySelector('#exam-dialog');
  const {items, i, selected, timed} = session;
  const {incomplete, flagged} = examCounts();
  dialog.innerHTML = '<h2 id="exam-dialog-title">' + (confirmSubmission ? 'Kirim jawaban?' : 'Daftar soal') + '</h2>' +
    '<p class="muted">' + incomplete + ' belum lengkap · ' + flagged + ' ditandai</p>' +
    (confirmSubmission
      ? '<p>Setelah dikirim, hasil dan pembahasan akan langsung tampil.</p>'
      : '<div class="exam-question-grid">' + items.map((q, index) => {
        const answered = isComplete(q, selected[q.id]);
        const flagged = !!timed.flagged[q.id];
        const label = 'Soal ' + (index + 1) + (answered ? ', terjawab' : ', belum lengkap') + (flagged ? ', ditandai' : '');
        return '<button class="mini exam-question' + (answered ? ' exam-question-answered' : '') + '"' +
          ' type="button" data-exam-jump="' + index + '" aria-label="' + label + '"' + (i === index ? ' aria-current="step"' : '') +
          '>' + (index + 1) + (flagged ? '<span aria-hidden="true">⚑</span>' : '') + '</button>';
      }).join('') + '</div>') +
    '<div class="actions">' + action('exam-close','Lanjut ujian') +
    (confirmSubmission ? action('exam-submit','Kirim sekarang','primary') : action('exam-confirm','Akhiri ujian','primary')) + '</div>';
  if (!dialog.open) dialog.showModal();
  const focusTarget = confirmSubmission ? '[data-action="exam-close"]' : '[aria-current="step"]';
  dialog.querySelector(focusTarget).focus();
}

function answerText(q, indices) {
  return indices?.length ? indices.map(index => q.options[index]).join(' · ') : 'Tidak dijawab';
}
function imagery(q) {
  return (q.media || []).map((name, index) => '<img class="question-image" src="media/' + escape(name) + '" alt="' +
    (isPbq(q) ? 'Referensi PBQ tentang ' + escape(q.topic) : 'Lampiran soal ' + q.n + ', gambar ' + (index + 1)) +
    '" loading="lazy" draggable="false">').join('');
}
function optionContent(q, index, loading = 'eager') {
  const image = q.optionMedia?.[index];
  const label = escape(q.options[index]);
  if (!image) return label;
  const alt = q.optionAlt?.[index] ?? ('Lampiran opsi ' + String.fromCharCode(65 + index));
  return label + '<img class="option-image" src="media/' + escape(image) + '" alt="' + escape(alt) +
    '" loading="' + loading + '" draggable="false">';
}
function answerOptions(q, indices, highlight = false, loading = 'lazy') {
  return '<ol class="review-options" lang="en">' + indices.map(index =>
    '<li value="' + (index + 1) + '"' + (highlight && q.answers.includes(index) ? ' class="correct-answer"' : '') +
    '>' + optionContent(q, index, loading) + '</li>').join('') + '</ol>';
}
function explanation(q) {
  return q.explanation ? '<div class="explanation"><h3>Pembahasan</h3><p>' + escape(q.explanation) + '</p></div>' : '';
}
function keyNote(q) {
  if (q.answerStatus === 'reviewed') return '<span class="key-note">Kunci ditinjau dari soal sumber.</span>';
  return q.answerStatus==='inferred'
    ? '<span class="key-note">Jawaban hasil analisis. Form tidak menampilkan kunci.</span>' : '';
}
function prompt(q) {
  const media = imagery(q);
  return (q.stem ? '<h2 class="question" lang="en">' + escape(q.stem) + '</h2>' : '') +
    (isPbq(q) ? '<details class="pbq-reference"><summary>Gambar referensi PBQ</summary>' + media + '</details>' : media) +
    (q.adapted ? '<p class="muted small">' + (q.set === 6 ? 'Soal disesuaikan dari dokumen sumber.' :
      'Detail teknis disederhanakan dari soal sumber.') + '</p>' : '');
}
function action(name, label, type='secondary', disabled=false) {
  return '<button type="button" class="' + type + '" data-action="' + name + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
}

function renderHome() {
  if (settings.mode === 'cards' && settings.source === '7') settings.source = 'all';
  const total = sourcePool().length;
  const studied = Object.values(progress.marks).filter(value => value === 'known').length;
  const again = Object.values(progress.marks).filter(value => value === 'again').length;
  settings.count = Math.min(total || 1, Math.max(1, settings.count || 1));
  const select = (value,label) => '<option value="' + value + '"' + (settings.source === value ? ' selected' : '') + '>' + label + '</option>';
  const cardCount = questions.filter(q => !isPbq(q)).length;
  const canStartTimed = cardCount >= examLength - examPbqCount && questions.length - cardCount >= examPbqCount;
  const studiedPercent = cardCount ? Math.round(100*studied/cardCount) : 0;
  main.innerHTML = '<div class="page-heading"><h1>Security+ Study Lab <span class="course-code">SY0-701</span></h1></div>' +
    '<nav class="panel study-entry" aria-label="Bahan belajar"><div><h2>Materi dan pembahasan</h2><p class="muted">Lima domain ujian, glosarium, dan pembahasan setiap soal.</p></div>' +
    '<div class="actions"><a class="primary" href="materi.html">Buka materi</a><a class="secondary" href="#pembahasan-1">Pembahasan soal</a></div></nav>' +
    (sets.some(s=>s.count < s.expected) ? '<p class="notice">Bank soal ini memuat soal yang berhasil diperiksa. Lihat cakupan tiap practice test di bawah.</p>' : '') +
    '<div class="grid"><section class="panel"><div class="section-head"><h2>Mulai latihan</h2></div>' +
    '<div class="modes" aria-label="Mode belajar">' + Object.entries(modes).map(([id, mode]) => '<button class="mode" type="button" data-mode="' + id + '" aria-pressed="' + (settings.mode===id) + '"><strong>' + mode[0] + '</strong><span>' + mode[1] + '</span></button>').join('') + '</div>' +
    (settings.mode === 'exam' ? '<section class="timed-exam-start"><h3>Simulasi penuh SY0-701</h3>' +
      '<p class="muted">86 pilihan ganda acak + 4 PBQ · 90 menit</p><div class="actions">' +
      action('start-timed','Mulai simulasi penuh','primary',!canStartTimed) + '</div></section>' +
      '<h3 class="exam-custom-title">Simulasi tanpa timer</h3>' : '') +
    '<div class="fields"><label class="field"><span>Sumber soal</span><select id="source">' + select('all', 'Campur semua set') +
    sets.filter(s => settings.mode !== 'cards' || s.set !== 7)
      .map(s => select(String(s.set),escape(setTitle(s.set)) + ' (' + s.count + ')')).join('') + select('again','Perlu diulang (' + again + ')') +
    '</select></label><label class="field"><span>Jumlah soal</span><input id="count" type="number" min="1" max="' + total + '" value="' + (total ? settings.count : '') + '"' + (!total ? ' disabled' : '') + '></label></div>' +
    '<div class="count-list" aria-label="Pilihan jumlah soal">' + [10,25,50].filter(n => n < total).map(n => '<button class="mini" type="button" data-count="' + n + '">' + n + '</button>').join('') + (total ? '<button class="mini" type="button" data-count="' + total + '">Semua (' + total + ')</button>' : '') + '</div>' +
    '<div class="actions">' + action('start',settings.mode === 'exam' ? 'Mulai tanpa timer' : 'Mulai sesi →',settings.mode === 'exam' ? 'secondary' : 'primary',!total) + '<span class="muted small">' + total + ' soal tersedia dari sumber ini</span></div></section>' +
    '<aside class="dashboard-sidebar"><section class="panel"><div class="section-head"><h2>Progres belajar</h2></div>' +
    '<dl class="activity-cells"><div><dt>Kartu dikuasai</dt><dd>' + studied + ' <span class="muted">/ ' + cardCount + '</span></dd></div>' +
    '<div><dt>Perlu diulang</dt><dd>' + again + '</dd></div><div><dt>Sesi terakhir</dt><dd>' + escape(progress.history[0]?.score || '—') + '</dd></div></dl>' +
    '<meter class="segment-meter" min="0" max="100" value="' + studiedPercent + '" aria-label="Persentase kartu dikuasai"></meter>' +
    (progress.history.length ? '<ul class="history-list" aria-label="Riwayat sesi">' + progress.history.slice(0,3).map(h => '<li><span>' + escape(modes[h.mode]?.[0]) + ' · ' + escape(h.score) + '</span><time>' + escape(new Date(h.date).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})) + '</time></li>').join('') + '</ul>' : '') +
    '</section><section class="panel"><div class="section-head"><h2>Bank soal</h2></div><ul class="source-list">' +
    sets.map(s => {
      const title = escape(setTitle(s.set));
      const source = sourceLinks[s.set-1];
      const link = source ? '<a href="https://forms.office.com/r/' + source + '" target="_blank" rel="noopener noreferrer">' +
        title + ' <span aria-hidden="true">↗</span></a>' : '<a href="#pembahasan-' + s.set + '">' + title + '</a>';
      return '<li>' + link + '<span class="muted">' + s.count + (s.count < s.expected ? ' / ' + s.expected : '') + ' soal</span></li>';
    }).join('') +
    '</ul>' +
    (questions.some(q=>q.answerStatus==='inferred') ? '<p class="muted small source-note">' +
      questions.filter(q=>q.answerStatus==='inferred').length + ' jawaban hasil analisis diberi label di tiap soal.</p>' : '') +
    '</section></aside></div>';
}

function start(items = shuffle(sourcePool()).slice(0, settings.count), mode=settings.mode, timed) {
  if (!items.length) return;
  const optionOrder = Object.fromEntries(items.map(q => [
    q.id, isPbq(q) ? q.tasks.map(task => shuffleChoices(task.choices)) : shuffleChoices(q.options)
  ]));
  session = { items, optionOrder, mode, timed, i:0, selected:{}, checked:{}, revealed:false, visited:{} };
  screen = 'session';
  saveTimedExam();
  render(true);
  if (timed) beginExamClock();
}
function renderPbqFields(q, order, selected) {
  return '<div class="pbq-fields" lang="en">' + q.tasks.map((task, index) =>
    '<label class="field pbq-field"><span>' + escape(task.label) + '</span>' +
    '<select data-pbq-step="' + index + '"><option value="">Select an answer</option>' + order[index].map(choice =>
      '<option value="' + choice + '"' + (choice === selected[index] ? ' selected' : '') +
      (q.uniqueChoices && selected.includes(choice) && choice !== selected[index] ? ' disabled' : '') + '>' +
      escape(task.choices[choice]) + '</option>').join('') + '</select></label>').join('') + '</div>';
}
function renderPbqReview(q, selected) {
  return '<ol class="pbq-review" lang="en">' + q.tasks.map((task, index) => {
    const chosen = selected?.[index];
    const answer = escape(task.choices[task.answer]);
    return '<li><strong>' + escape(task.label) + '</strong>' +
      (selected ? '<p class="' + (chosen === task.answer ? 'correct-answer' : 'muted') + '">Your answer: ' +
        (Number.isInteger(chosen) ? escape(task.choices[chosen]) : 'Unanswered') + '</p>' : '') +
      '<p>Correct answer: ' + answer + '</p></li>';
  }).join('') + '</ol>';
}
function renderSession() {
  const {items,optionOrder,i,mode,selected,checked,revealed,timed} = session;
  const q = items[i];
  const chosen = selected[q.id] || [];
  const order = optionOrder[q.id];
  const last = i === items.length-1;
  const card = mode === 'cards';
  const graded = !!checked[q.id];
  const picks = q.answers?.length;
  const pbq = isPbq(q);
  main.innerHTML = '<section class="session"><div class="session-top">' + action('home',timed ? 'Keluar simulasi' : '← Beranda') +
    '<span class="pill">' + (timed ? 'Simulasi penuh SY0-701' : modes[mode][0]) + '</span></div>' +
    (timed ? '<div class="exam-toolbar"><div><span class="muted small">Sisa waktu</span>' +
      '<span id="exam-clock" role="timer" class="exam-clock">' + formatExamTime(Math.max(0,timed.deadline-Date.now())) +
      '</span></div><p id="exam-progress-status" class="muted small"></p>' + action('exam-map','Daftar soal','mini') + '</div>' : '') +
    '<div class="meta" role="status">' + (card ? 'KARTU ' : 'SOAL ') + (i+1) + ' / ' + items.length + '</div><progress class="progress" aria-label="Progres sesi" value="' + (i+1) + '" max="' + items.length + '"></progress>' +
    '<article class="panel"><div class="pills">' + (timed ? '' : '<span class="pill">' + escape(setTitle(q.set)) + ' · Q' + q.n + '</span>') +
    (pbq ? '<span class="pill">PBQ · ' + q.tasks.length + ' BAGIAN</span>' :
      !card ? '<span class="pill">' + (picks===1 ? 'PILIH SATU' : 'PILIH ' + picks + ' JAWABAN') + '</span>' : '') + '</div>' +
    (card ? renderCard(q, order, revealed, last) : prompt(q) +
    (pbq ? (graded ? renderPbqReview(q, chosen) : renderPbqFields(q, order, chosen)) :
    '<div class="choices" lang="en">' + order.map((index, position) => {
      const wasChosen = chosen.includes(index);
      const styling = graded ? q.answers.includes(index) ? ' correct' : wasChosen ? ' wrong' : '' : '';
      return '<label class="option' + styling + '"><input type="' + (picks===1 ? 'radio' : 'checkbox') + '" name="answer" value="' + index + '"' + (wasChosen?' checked':'') + (graded?' disabled':'') +
        '>' + (q.optionMedia ? '' : '<span class="letter" aria-hidden="true">' + String.fromCharCode(65+position) + '</span>') +
        '<span class="label">' + optionContent(q,index) + '</span></label>';
    }).join('') + '</div>') +
    (graded ? '<p class="status-line' + (isCorrect(q,chosen)?'':' wrong') + '" role="status"><strong>' + (isCorrect(q,chosen)?'Benar.':pbq?'Periksa jawaban per bagian.':'Jawaban yang benar') + '</strong>' +
      (pbq ? '' : ' <span lang="en">' + escape(answerText(q,q.answers)) + '</span>') + keyNote(q) + '</p>' + explanation(q) : '') +
    '<div class="actions spread">' + action('back','← Sebelumnya','secondary',i===0) + '<div class="actions" style="margin-top:0">' +
    (timed ? '<button class="secondary" type="button" data-action="exam-flag" aria-pressed="' + !!timed.flagged[q.id] + '">Tandai soal</button>' : '') +
    (mode==='practice' && !graded ? action('skip',last?'Selesaikan':'Lewati') + action('check','Cek jawaban','primary',!isComplete(q,chosen)) :
      (timed && last ? action('exam-map','Tinjau &amp; akhiri','primary') : action('next',last?'Lihat hasil':'Selanjutnya →','primary'))) + '</div></div>' +
    (mode==='exam' && !timed ? '<p class="muted small" style="margin:9px 0 0">' + items.filter(q=>isComplete(q,selected[q.id])).length + ' / ' + items.length + ' soal sudah diisi. Kamu bisa kembali sebelum melihat hasil.</p>' : '')) +
    '</article>' + (timed ? '<dialog id="exam-dialog" class="exam-dialog" aria-labelledby="exam-dialog-title"></dialog>' : '') + '</section>';
  if (timed) updateExamProgress();
}
function renderCard(q, order, revealed, last) {
  const question = (q.stem ? '<span class="question" lang="en">' + escape(q.stem) + '</span>' : '') +
    (q.adapted ? '<span class="muted small">' + (q.set === 6 ? 'Soal disesuaikan dari dokumen sumber.' :
      'Detail teknis disederhanakan dari soal sumber.') + '</span>' : '');
  const media = imagery(q);
  const optionMedia = q.optionMedia ? '<span class="flashcard-option-grid" lang="en">' +
    order.map(index => '<span>' + optionContent(q, index) + '</span>').join('') + '</span>' : '';
  const answer = q.answers.map(index => '<span class="flashcard-answer" lang="en">' + optionContent(q, index) + '</span>').join('') + keyNote(q);
  return '<button type="button" class="flashcard" data-action="flip" data-side="' + (revealed?'answer':'question') + '" aria-describedby="card-gesture">' +
    '<span class="flashcard-faces"><span class="flashcard-face" aria-hidden="' + revealed + '"><span class="eyebrow">01 / SOAL</span>' + question + optionMedia + '</span>' +
    '<span class="flashcard-face" aria-hidden="' + !revealed + '"><span class="eyebrow">02 / KUNCI JAWABAN</span>' + answer + '</span>' +
    (media ? '<span class="flashcard-media">' + media + '</span>' : '') + '</span>' +
    '<span class="flashcard-hint"><span aria-hidden="true">↻</span> ' + (revealed?'Balik ke soal':'Balik untuk lihat jawaban') + '</span></button>' +
    '<p class="flashcard-gesture" id="card-gesture">Geser kiri atau kanan untuk pindah kartu.</p>' +
    '<div class="actions spread">' + action('back','← Sebelumnya','secondary',session.i===0) +
    action('next',last?'Selesai':'Berikutnya →','primary') + '</div>' +
    (revealed ? explanation(q) + '<div class="actions flashcard-rating"><span class="muted small">Tandai kartu (opsional)</span>' +
      action('again','Perlu diulang','mini') + action('known','Sudah paham','mini') + '</div>' : '');
}

function finish(reason = 'submitted') {
  if (screen !== 'session') return;
  const {items,mode,selected,visited,timed} = session;
  if (timed) {
    timed.reason = reason;
    timed.elapsed = Math.max(0, Math.min(examDuration, Date.now() - (timed.deadline - examDuration)));
    clearTimedExam();
  }
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
  const {items,mode,selected,visited,timed} = session;
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
      'Jawaban benar · ' + Math.round(100*correct/items.length) + '% · ' + items.filter(q=>!hasResponse(selected[q.id])).length + ' kosong') + '</p>' +
    (timed ? '<p class="exam-result-note">' + (timed.reason === 'expired' ? 'Waktu habis. Jawaban dikirim otomatis.' : 'Jawaban terkirim.') +
      ' Waktu terpakai ' + formatExamTime(timed.elapsed) + ' dari 90 menit. Tiap PBQ bernilai satu poin jika semua bagian benar.</p>' : '') +
    '<div class="actions">' + action('restart',timed ? 'Simulasi penuh baru' : 'Ulang sesi','primary') +
      action('retry',card?'Latih kartu yang perlu diulang':'Latih soal yang salah', 'secondary',!missed.length) + '</div>' +
    '<div class="review"><div class="section-head"><h2>Review jawaban</h2>' + action('filter',reviewOnlyMissed?'Tampilkan semua':'Filter perlu diulang','mini',!missed.length) + '</div>' +
    shown.map(q => '<details><summary><span class="meta">' + escape(setTitle(q.set)) + ' · Q' + q.n + '</span> ' +
      (card ? visited[q.id]==='known'?'Dikuasai':visited[q.id]==='again'?'Perlu diulang':'Belum ditandai' :
        isCorrect(q,selected[q.id])?'Benar':hasResponse(selected[q.id])?'Salah':'Kosong') + ' · <span lang="en">' +
      escape(q.stem?.split('\n')[0].slice(0,100)||'Soal bergambar') + '</span></summary>' + prompt(q) +
      (isPbq(q) ? renderPbqReview(q, selected[q.id] || []) :
      (card ? '' : '<p>Jawabanmu <span lang="en">' + escape(answerText(q,selected[q.id])) + '</span></p>') +
      '<p><strong>Kunci jawaban</strong> <span lang="en">' + escape(answerText(q,q.answers)) + '</span>' + keyNote(q) + '</p>' +
      answerOptions(q, q.options.map((_, index) => index), true)) + explanation(q) + '</details>').join('') + '</div></article></section>';
}

function readReviewRoute() {
  const match = location.hash.match(/^#pembahasan-([1-7])(?:-q([1-9][0-9]*))?$/);
  if (!match) return null;
  return { set: Number(match[1]), question: Number(match[2]) };
}

function renderReview({set, question}) {
  const items = questions.filter(q => q.set === set);
  main.innerHTML = '<section class="session study-review"><div class="session-top">' + action('home','← Beranda') +
    '<a class="secondary" href="materi.html">Materi</a></div><h1>Pembahasan latihan</h1>' +
    '<nav class="study-sets" aria-label="Pilih practice test">' + sets.map(entry =>
      '<a class="' + (entry.set === set ? 'primary' : 'secondary') + '" href="#pembahasan-' + entry.set + '"' +
      (entry.set === set ? ' aria-current="true"' : '') + '>' + (entry.title ? escape(entry.title) : 'Test ' + entry.set) + '</a>').join('') + '</nav>' +
    '<article class="panel review"><h2>' + escape(setTitle(set)) + ' · ' + items.length + ' soal</h2>' +
    items.map(q => '<details id="review-q' + q.n + '"' + (q.n === question ? ' open' : '') + '><summary>' +
      '<span class="meta">Q' + q.n + '</span> <span lang="en">' + escape(q.topic) + '</span></summary>' + prompt(q) +
      (isPbq(q) ? renderPbqReview(q) :
      (q.answers.length > 1 ? '<p class="muted">Pilih ' + q.answers.length + ' jawaban.</p>' : '') +
      answerOptions(q, q.options.map((_, index) => index), false, q.n === question ? 'eager' : 'lazy') +
      '<div class="review-key"><h3>Kunci jawaban</h3>' + answerOptions(q,q.answers,true) + keyNote(q) + '</div>') +
      explanation(q) + '<a class="question-link" href="#pembahasan-' + set + '-q' + q.n + '">Tautan soal Q' + q.n + '</a></details>').join('') +
    '</article></section>';
}

function applyRoute() {
  if (!questions.length) return;
  const route = readReviewRoute();
  if (!route && screen !== 'review') return;
  if (screen === 'session' && session.timed) {
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  screen = route ? 'review' : 'home';
  render(true);
  const entry = route && main.querySelector('#review-q' + route.question);
  if (entry) {
    entry.querySelector('summary').focus({preventScroll:true});
    entry.scrollIntoView({block:'start'});
  }
}

function render(focus=false) {
  document.querySelector('#console-location').textContent = screen==='home' ? 'Beranda' : screen==='review' ? 'Pembahasan latihan' : modes[session.mode][0];
  document.querySelector('[data-console-home]').setAttribute('aria-pressed', String(screen==='home'));
  document.querySelectorAll('[data-console-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(Boolean(session && (screen==='session' || screen==='results') && button.dataset.consoleMode===session.mode)));
  });
  if (screen==='home') renderHome();
  if (screen==='session') renderSession();
  if (screen==='results') renderResults();
  if (screen==='review') renderReview(readReviewRoute());
  if (focus) {
    main.focus({preventScroll:true});
    window.scrollTo(0,0);
  }
}
function advance() {
  if (session.i === session.items.length-1) {
    if (session.timed) showExamDialog();
    else finish();
    return;
  }
  moveQuestion(1);
}
function moveQuestion(step) {
  const index = session.i + step;
  if (index < 0 || index >= session.items.length) return;
  session.i = index;
  session.revealed = false;
  saveTimedExam();
  render(true);
}
function goHome(mode = settings.mode) {
  if (screen === 'session' && session.timed) {
    if (updateExamClock()) return false;
    if (!window.confirm('Keluar dari simulasi penuh? Sesi ini akan berakhir tanpa skor.')) return false;
    clearTimedExam();
    session = undefined;
  }
  if (readReviewRoute()) history.replaceState(null, '', location.pathname + location.search);
  settings.mode = mode;
  screen = 'home';
  render(true);
  return true;
}
function updateCount() {
  const raw = main.querySelector('#count').valueAsNumber;
  settings.count = Number.isFinite(raw) ? Math.floor(raw) : 1;
  settings.count = Math.max(1,Math.min(sourcePool().length || 1,settings.count));
}

document.querySelectorAll('.brand').forEach(link => {
  link.addEventListener('click',event=>{event.preventDefault();if (questions.length) goHome();});
});
document.querySelector('.rail').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button || !questions.length) return;
  if (goHome(button.dataset.consoleMode) && button.dataset.consoleMode) {
    main.querySelector('[data-mode="' + settings.mode + '"]').focus({preventScroll:true});
  }
});
main.addEventListener('change',event=>{
  const input = event.target;
  if (input.id==='source') { updateCount(); settings.source=input.value; render(); main.querySelector('#source').focus(); }
  if ((input.name !== 'answer' && input.dataset?.pbqStep === undefined) || updateExamClock()) return;
  const q=session.items[session.i];
  let selected;
  if (isPbq(q)) {
    const fields = [...main.querySelectorAll('[data-pbq-step]')];
    selected = fields.map(field => field.value === '' ? null : Number(field.value));
    if (q.uniqueChoices) {
      fields.forEach((field, index) => {
        for (const option of field.options) {
          const value = Number(option.value);
          option.disabled = option.value !== '' && value !== selected[index] && selected.includes(value);
        }
      });
    }
  } else {
    selected = [...main.querySelectorAll('input[name="answer"]:checked')].map(item=>Number(item.value));
    if (selected.length > q.answers.length) {
      input.checked = false;
      selected = selected.filter(i=>i!==Number(input.value));
    }
  }
  session.selected[q.id]=selected;
  if (session.timed) {
    saveTimedExam();
    updateExamProgress();
  }
  const check = main.querySelector('[data-action="check"]');
  if (check) check.disabled=!isComplete(q,selected);
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
  if (!button || updateExamClock()) return;
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
  if (act==='start-timed') { startTimedExam(); return; }
  if (!session) return;
  const q = session.items[session.i];
  if (button.dataset.examJump !== undefined) {
    moveQuestion(Number(button.dataset.examJump) - session.i);
    return;
  }
  if (act==='exam-map' || act==='exam-confirm') { showExamDialog(act==='exam-confirm'); return; }
  if (act==='exam-close') { main.querySelector('#exam-dialog').close(); return; }
  if (act==='exam-submit') { finish(); return; }
  if (act==='exam-flag') {
    session.timed.flagged[q.id] = !session.timed.flagged[q.id];
    button.setAttribute('aria-pressed', String(session.timed.flagged[q.id]));
    saveTimedExam();
    updateExamProgress();
    return;
  }
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
  if (act==='restart') {
    if (session.timed) startTimedExam();
    else start(shuffle(session.items),session.mode);
  }
  if (act==='retry') start(session.items.filter(item => session.mode==='cards' ? session.visited[item.id]==='again' : !isCorrect(item,session.selected[item.id])),session.mode);
});

window.addEventListener('hashchange', applyRoute);

Promise.all(['bank.json?v=5', 'supplement.json?v=1'].map(async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Bank soal belum tersedia.');
  return response.json();
})).then(banks => {
  sets = banks.flatMap(data => data.sets);
  questions = banks.flatMap(data => data.questions);
  if (restoreTimedExam()) return;
  if (readReviewRoute()) applyRoute();
  else render();
}).catch(()=>{
  main.innerHTML='<p class="notice" role="alert">Bank soal gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>';
});
