// Voter page: one question per screen, review, submit.
(async function () {
  'use strict';
  var app = document.getElementById('app');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var data, qs, answers = [], step = 0;

  if (API.demo) {
    var b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = 'Demo mode: votes stay on this device';
    document.body.appendChild(b);
  }

  try {
    data = await API.loadQuestions();
  } catch (e) {
    app.innerHTML = '<div class="card center"><div class="big-emoji">🙀</div><h2>Something went bump</h2>' +
      '<p>We couldn\'t load the questions. Try refreshing the page.</p><p class="muted">' + esc(e.message) + '</p></div>';
    return;
  }
  qs = data.questions;
  document.title = data.title || 'Costume Contest';

  function renderIntro() {
    app.innerHTML =
      '<div class="card center slide-in">' +
        '<div class="big-emoji">🎃</div>' +
        '<h1>' + esc(data.title || 'Costume Contest') + '</h1>' +
        '<p>' + esc(data.intro || 'Vote for your favorite costumes! Type a name or describe the costume.') + '</p>' +
        '<p class="muted">' + qs.length + ' award' + (qs.length === 1 ? '' : 's') + ' to vote on</p>' +
        '<button class="btn block" id="start">Start voting 👻</button>' +
      '</div>';
    document.getElementById('start').onclick = function () {
      answers = qs.map(function () { return ''; });
      step = 0;
      renderQuestion();
    };
  }

  function renderQuestion() {
    var q = qs[step], last = step === qs.length - 1;
    var dots = qs.map(function (_, i) {
      return '<span class="dot' + (i < step ? ' done' : '') + (i === step ? ' cur' : '') + '"></span>';
    }).join('');
    app.innerHTML =
      '<div class="progress" aria-hidden="true">' + dots + '</div>' +
      '<form class="card slide-in" id="qform" autocomplete="off">' +
        '<div class="qnum">Question ' + (step + 1) + ' of ' + qs.length + '</div>' +
        '<h2>' + esc(q.text) + '</h2>' +
        (q.hint ? '<p class="muted">' + esc(q.hint) + '</p>' : '') +
        '<label class="sr-only" for="ans">Your answer</label>' +
        '<input id="ans" class="answer" type="text" maxlength="100" enterkeyhint="' + (last ? 'done' : 'next') + '"' +
          ' placeholder="' + esc(q.placeholder || 'Name or costume') + '" value="' + esc(answers[step]) + '">' +
        '<div class="row">' +
          '<button type="button" class="btn btn-ghost" id="back">← Back</button>' +
          '<button type="submit" class="btn">' + (last ? 'Review ✓' : 'Next →') + '</button>' +
        '</div>' +
        '<div class="center"><button type="button" class="link" id="skip">Skip this one</button></div>' +
      '</form>';
    var inp = document.getElementById('ans');
    inp.oninput = function () { answers[step] = inp.value; };
    document.getElementById('qform').onsubmit = function (e) { e.preventDefault(); next(); };
    document.getElementById('back').onclick = function () {
      if (step === 0) renderIntro(); else { step--; renderQuestion(); }
    };
    document.getElementById('skip').onclick = function () { answers[step] = ''; next(); };
    if (step > 0 || answers[step]) inp.focus();
  }

  function next() {
    if (step < qs.length - 1) { step++; renderQuestion(); } else renderReview();
  }

  function renderReview() {
    var filled = answers.filter(function (a) { return a.trim(); }).length;
    var items = qs.map(function (q, i) {
      var a = answers[i].trim();
      return '<li><div><div class="q">' + esc(q.text) + '</div>' +
        '<div class="a' + (a ? '' : ' skipped') + '">' + (a ? esc(a) : 'skipped') + '</div></div>' +
        '<button class="btn btn-sm btn-ghost" data-edit="' + i + '">Edit</button></li>';
    }).join('');
    app.innerHTML =
      '<div class="card slide-in">' +
        '<h2>Ready to cast your spell?</h2>' +
        '<ul class="review-list">' + items + '</ul>' +
        (filled ? '' : '<p class="error">Answer at least one question to vote.</p>') +
        '<p class="error" id="err" role="alert"></p>' +
        '<button class="btn btn-green block" id="submit"' + (filled ? '' : ' disabled') + '>Submit my votes 🧪</button>' +
      '</div>';
    app.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.onclick = function () { step = +btn.getAttribute('data-edit'); renderQuestion(); };
    });
    document.getElementById('submit').onclick = submit;
  }

  async function submit() {
    var btn = document.getElementById('submit'), err = document.getElementById('err');
    btn.disabled = true;
    btn.textContent = 'Brewing… 🧪';
    err.textContent = '';
    var payload = [];
    qs.forEach(function (q, i) {
      var a = answers[i].replace(/\s+/g, ' ').trim();
      if (a) payload.push({ questionId: q.id, answer: a });
    });
    try {
      await API.submitVote(payload);
      renderThanks();
    } catch (e) {
      err.textContent = 'Your votes didn\'t go through. Check your connection and try again.';
      btn.disabled = false;
      btn.textContent = 'Try again 🧪';
    }
  }

  function renderThanks() {
    app.innerHTML =
      '<div class="card center slide-in">' +
        '<div class="ghost-rise">👻</div>' +
        '<h1>Votes are in!</h1>' +
        '<p>Thanks for voting. Stick around for the big reveal! 🎃</p>' +
        '<button class="btn btn-ghost block" id="again">Someone else voting on this phone?</button>' +
      '</div>';
    FX.confetti(60);
    document.getElementById('again').onclick = renderIntro;
  }

  renderIntro();
})();
