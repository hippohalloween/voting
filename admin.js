// Host page: QR code, live results, answer review/merging, and the winner reveal.
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var app = $('#app');
  var voteUrl = C.VOTE_URL || new URL('./', location.href).href;
  var PASS_KEY = 'hv_admin_pass', DISMISS_KEY = 'hv_dismissed', OPTS_KEY = 'hv_reveal_opts';

  var questions = [], title = 'Costume Contest';
  var state = { results: {}, merges: {}, submissions: 0 };
  var tab = 'join', pollTimer = null, lastUpdated = null, loadErr = null, revealOpen = false;
  var suggestCache = {};

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function sGet(k) { var s = store('sessionStorage'); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function sSet(k, v) { var s = store('sessionStorage'); try { if (s) s.setItem(k, v); } catch (e) {} }
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var opts = Object.assign({ runners: true, sound: true }, lsGet(OPTS_KEY, {}));

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (isErr ? ' err' : ''); }, isErr ? 5000 : 2200);
  }

  // ---------- Start-up ----------
  async function init() {
    try {
      var qd = await API.loadQuestions();
      questions = qd.questions;
      title = qd.title || title;
      document.title = title + ' · Host';
    } catch (e) {
      app.innerHTML = '<div class="card"><h2>Oops</h2><p class="error">' + esc(e.message) + '</p></div>';
      return;
    }
    if (sGet(PASS_KEY) === String(C.ADMIN_PASSCODE)) start(); else gate();
  }

  function gate() {
    app.innerHTML =
      '<div class="card center" style="max-width:420px;margin:8vh auto 0">' +
        '<div class="big-emoji">🧙</div><h2>Host only</h2>' +
        '<p class="muted">Enter the admin passcode.</p>' +
        '<form id="gate"><label class="sr-only" for="pw">Passcode</label>' +
        '<input class="answer" id="pw" type="password" autocomplete="current-password" placeholder="Passcode">' +
        '<p class="error" id="gerr"></p><button class="btn block">Enter</button></form>' +
      '</div>';
    $('#gate').onsubmit = function (e) {
      e.preventDefault();
      if ($('#pw').value === String(C.ADMIN_PASSCODE)) { sSet(PASS_KEY, $('#pw').value); start(); }
      else $('#gerr').textContent = 'Wrong passcode 👻';
    };
    $('#pw').focus();
  }

  async function start() {
    await refresh();
    render();
    clearInterval(pollTimer);
    pollTimer = setInterval(async function () {
      if (document.hidden || revealOpen) return;
      if (tab === 'results' || tab === 'join') {
        await refresh();
        if (tab === 'results') renderTab();
        renderStats();
      }
    }, 5000);
  }

  async function refresh() {
    try {
      var r = await API.getResults();
      state = { results: r.results || {}, merges: r.merges || {}, submissions: r.submissions || 0 };
      lastUpdated = new Date();
      loadErr = null;
    } catch (e) {
      loadErr = e.message || 'Could not reach the Google Sheet';
    }
  }

  // ---------- Tally logic ----------
  // Groups raw answers after applying the host's merges. Returns [{gk, label, count, members, merged}]
  function tallies(qid) {
    var entries = state.results[qid] || [], m = state.merges[qid] || {}, groups = {};
    entries.forEach(function (e) {
      var label = m[e.key] || e.label;
      var gk = API.norm(label) || label;
      var g = groups[gk] || (groups[gk] = { gk: gk, label: label, count: 0, members: [], merged: false });
      g.count += e.count;
      g.members.push(e);
      if (m[e.key]) { g.label = m[e.key]; g.merged = true; }
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  function lev(a, b) {
    if (a === b) return 0;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similar(a, b) {
    var s = a.length <= b.length ? a : b, l = s === a ? b : a;
    if (s.length >= 3) {
      var st = s.split(' '), lt = l.split(' ');
      if (st.every(function (t) { return lt.indexOf(t) !== -1; })) return true; // "sarah" ⊂ "sarah witch"
      if (l.replace(/ /g, '') === s.replace(/ /g, '')) return true;            // "mr bones" = "mrbones"
    }
    var max = Math.max(a.length, b.length), d = lev(a, b);
    return max <= 3 ? false : max <= 5 ? d <= 1 : max <= 10 ? d <= 2 : d <= 3;
  }

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function suggestions(qid) {
    var groups = tallies(qid), n = groups.length;
    if (n > 400) return []; // keep it fast with huge answer lists
    var dismissed = (lsGet(DISMISS_KEY, {})[qid]) || [];
    var parent = groups.map(function (_, i) { return i; });
    function find(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; }
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (dismissed.indexOf(pairKey(groups[i].gk, groups[j].gk)) !== -1) continue;
        if (similar(groups[i].gk, groups[j].gk)) parent[find(i)] = find(j);
      }
    }
    var sets = {};
    groups.forEach(function (g, i) { var r = find(i); (sets[r] = sets[r] || []).push(g); });
    return Object.keys(sets).map(function (k) { return sets[k]; })
      .filter(function (s) { return s.length > 1; })
      .map(function (s) {
        s.sort(function (a, b) { return b.count - a.count; });
        return { groups: s, name: s[0].label };
      });
  }

  function pendingCount() {
    return questions.reduce(function (n, q) { return n + suggestions(q.id).length; }, 0);
  }

  // ---------- Rendering ----------
  var TABS = [
    ['join', '📱 Join'],
    ['results', '📊 Live results'],
    ['review', '🧹 Review answers'],
    ['reveal', '🏆 Reveal'],
    ['settings', '⚙️ Settings']
  ];

  function render() {
    var pend = pendingCount();
    app.innerHTML =
      '<div class="topbar">' +
        '<div><h1>🎃 ' + esc(title) + '</h1><div class="stat" id="stats"></div></div>' +
        '<div class="inline">' +
          '<button class="btn btn-sm btn-ghost" id="refreshBtn">↻ Refresh</button>' +
          '<button class="btn btn-sm" id="topReveal">🏆 Reveal winners</button>' +
        '</div>' +
      '</div>' +
      (API.demo ? '<p class="warn">Demo mode: no Google Sheet connected yet, so votes are saved only in this browser. See the README to connect it.</p>' : '') +
      '<nav class="tabs" role="tablist">' + TABS.map(function (t) {
        var badge = t[0] === 'review' && pend ? '<span class="badge">' + pend + '</span>' : '';
        return '<button class="tab' + (tab === t[0] ? ' active' : '') + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + badge + '</button>';
      }).join('') + '</nav>' +
      '<section id="tabBody"></section>';
    app.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute('data-tab'); render(); };
    });
    $('#refreshBtn').onclick = async function () { await refresh(); render(); toast('Updated'); };
    $('#topReveal').onclick = openReveal;
    renderStats();
    renderTab();
  }

  function renderStats() {
    var el = $('#stats');
    if (!el) return;
    el.innerHTML = '<b>' + state.submissions + '</b> ballot' + (state.submissions === 1 ? '' : 's') + ' cast' +
      (lastUpdated ? ' · updated ' + lastUpdated.toLocaleTimeString() : '') +
      (loadErr ? ' · <span class="error">⚠ ' + esc(loadErr) + '</span>' : '');
  }

  function renderTab() {
    var body = $('#tabBody');
    if (!body) return;
    if (tab === 'join') return renderJoin(body);
    if (tab === 'results') return renderResults(body);
    if (tab === 'review') return renderReview(body);
    if (tab === 'reveal') return renderRevealTab(body);
    if (tab === 'settings') return renderSettings(body);
  }

  function makeQR(el, size) {
    el.innerHTML = '';
    if (!window.QRCode) { el.innerHTML = '<p style="color:#000;max-width:260px">QR code couldn\'t load. Share the link below instead.</p>'; return; }
    new QRCode(el, { text: voteUrl, width: size, height: size, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  }

  function renderJoin(body) {
    body.innerHTML =
      '<div class="card center">' +
        '<h2>Scan to vote!</h2>' +
        '<div class="qr-box" id="qr"></div>' +
        '<div class="url">' + esc(voteUrl) + '</div>' +
        '<div class="inline" style="justify-content:center">' +
          '<button class="btn btn-sm btn-ghost" id="copyLink">Copy link</button>' +
          '<button class="btn btn-sm btn-purple" id="qrFull">Show QR full screen</button>' +
        '</div>' +
      '</div>';
    makeQR($('#qr'), 340);
    $('#copyLink').onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(voteUrl) : Promise.reject())
        .then(function () { toast('Link copied'); }, function () { toast('Copy failed: select the link and copy it', true); });
    };
    $('#qrFull').onclick = function () {
      $('#qrOverlay').hidden = false;
      $('#qrBigUrl').textContent = voteUrl;
      makeQR($('#qrBig'), 640);
    };
  }

  function renderResults(body) {
    body.innerHTML = '<p class="help">Updates every few seconds. Merged answers from “Review answers” are already combined here.</p>' +
      '<div class="grid">' + questions.map(function (q) {
        var t = tallies(q.id), max = t.length ? t[0].count : 0;
        var bars = t.length ? t.slice(0, 10).map(function (g) {
          return '<li class="bar' + (g.count === max ? ' lead' : '') + '">' +
            '<div class="bar-top"><span>' + esc(g.label) + '</span><span class="count">' + g.count + '</span></div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(g.count / max * 100) + '%"></div></div></li>';
        }).join('') : '<li class="empty">No votes yet</li>';
        return '<div class="card"><h3>' + esc(q.text) + '</h3><ul class="bars">' + bars + '</ul>' +
          (t.length > 10 ? '<p class="help">+ ' + (t.length - 10) + ' more answers</p>' : '') + '</div>';
      }).join('') + '</div>';
  }

  function renderReview(body) {
    suggestCache = {};
    body.innerHTML =
      '<p class="help">People type answers differently (“Sarah”, “sara”, “Sarah\'s witch”). Approve the suggested matches below, ' +
      'or tick answers yourself and merge them. Tick a single answer to rename it. Changes save automatically and apply to the reveal.</p>' +
      questions.map(function (q) {
        var t = tallies(q.id), sug = suggestions(q.id);
        suggestCache[q.id] = sug;
        var sugHtml = sug.map(function (s, i) {
          return '<div class="suggest">' +
            '<div class="title">🔮 These look like the same answer</div>' +
            '<div class="chips">' + s.groups.map(function (g) {
              return '<span class="chip">' + esc(g.label) + ' <b>' + g.count + '</b></span>';
            }).join('') + '</div>' +
            '<div class="inline">' +
              '<label class="sr-only" for="sn-' + esc(q.id) + '-' + i + '">Name for merged answer</label>' +
              '<input type="text" id="sn-' + esc(q.id) + '-' + i + '" value="' + esc(s.name) + '" maxlength="100">' +
              '<button class="btn btn-sm btn-green" data-approve="' + esc(q.id) + '" data-i="' + i + '">Merge</button>' +
              '<button class="btn btn-sm btn-ghost" data-dismiss="' + esc(q.id) + '" data-i="' + i + '">Not the same</button>' +
            '</div></div>';
        }).join('');
        var list = t.length ? t.map(function (g) {
          var others = [];
          g.members.forEach(function (m) { m.variants.forEach(function (v) { if (v !== g.label && others.indexOf(v) === -1) others.push(v); }); });
          return '<li><label><input type="checkbox" data-gk="' + esc(g.gk) + '" data-label="' + esc(g.label) + '">' +
            '<span><span class="a">' + esc(g.label) + '</span>' + (g.merged ? '<span class="badge purple">merged</span>' : '') +
            (others.length ? '<div class="variants">includes: ' + others.map(esc).join(', ') + '</div>' : '') + '</span></label>' +
            '<span class="count">' + g.count + '</span>' +
            (g.merged ? '<button class="btn btn-sm btn-ghost" data-unmerge="' + esc(g.gk) + '">Undo</button>' : '') +
            '</li>';
        }).join('') : '<li class="empty">No answers yet</li>';
        return '<div class="card" data-q="' + esc(q.id) + '">' +
          '<h3>' + esc(q.text) + '</h3>' + sugHtml +
          '<ul class="ans-list">' + list + '</ul>' +
          (t.length ? '<div class="inline">' +
            '<label class="sr-only" for="mn-' + esc(q.id) + '">Name for merged answer</label>' +
            '<input type="text" class="merge-name" id="mn-' + esc(q.id) + '" placeholder="Tick answers, then name the combined answer" maxlength="100">' +
            '<button class="btn btn-sm btn-purple" data-merge>Merge ticked</button></div>' : '') +
          '</div>';
      }).join('');

    body.onchange = function (e) {
      var cb = e.target;
      if (!cb.matches('input[type=checkbox][data-gk]')) return;
      var card = cb.closest('[data-q]'), nameEl = $('.merge-name', card);
      var ticked = card.querySelectorAll('input[data-gk]:checked');
      if (ticked.length && !nameEl.value.trim()) nameEl.value = ticked[0].getAttribute('data-label');
      if (!ticked.length) nameEl.value = '';
    };

    body.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var card = b.closest('[data-q]'), qid = card && card.getAttribute('data-q');
      if (b.hasAttribute('data-approve')) {
        var s = suggestCache[qid][+b.getAttribute('data-i')];
        var name = $('#sn-' + CSS.escape(qid) + '-' + b.getAttribute('data-i')).value;
        applyMerge(qid, s.groups, name);
      } else if (b.hasAttribute('data-dismiss')) {
        var s2 = suggestCache[qid][+b.getAttribute('data-i')], d = lsGet(DISMISS_KEY, {});
        d[qid] = d[qid] || [];
        s2.groups.forEach(function (a, i) {
          s2.groups.slice(i + 1).forEach(function (c) { d[qid].push(pairKey(a.gk, c.gk)); });
        });
        lsSet(DISMISS_KEY, d);
        render();
      } else if (b.hasAttribute('data-merge')) {
        var gks = Array.prototype.map.call(card.querySelectorAll('input[data-gk]:checked'), function (c) { return c.getAttribute('data-gk'); });
        if (!gks.length) return toast('Tick one or more answers first', true);
        var groups = tallies(qid).filter(function (g) { return gks.indexOf(g.gk) !== -1; });
        applyMerge(qid, groups, $('.merge-name', card).value);
      } else if (b.hasAttribute('data-unmerge')) {
        var g = tallies(qid).filter(function (x) { return x.gk === b.getAttribute('data-unmerge'); })[0];
        if (!g) return;
        var m = state.merges[qid] || {};
        g.members.forEach(function (mem) { delete m[mem.key]; });
        saveMerges();
      }
    };
  }

  function applyMerge(qid, groups, name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return toast('Give the merged answer a name', true);
    var m = state.merges[qid] || (state.merges[qid] = {});
    groups.forEach(function (g) { g.members.forEach(function (mem) { m[mem.key] = name; }); });
    saveMerges();
  }

  async function saveMerges() {
    Object.keys(state.merges).forEach(function (q) { if (!Object.keys(state.merges[q]).length) delete state.merges[q]; });
    render();
    try {
      await API.saveMerges(state.merges, sGet(PASS_KEY));
      toast('Saved ✓');
    } catch (e) {
      toast('Couldn\'t save: ' + e.message, true);
      await refresh();
      render();
    }
  }

  function renderRevealTab(body) {
    var pend = pendingCount();
    body.innerHTML =
      '<div class="card" style="max-width:640px">' +
        '<h2>Reveal the winners</h2>' +
        '<p>Winners are revealed one award at a time, in the order of <code>questions.json</code>. ' +
        'Each press of the big button shows the next award with a drumroll, then the winner.</p>' +
        '<p class="help">Tip: plug your laptop into the projector first. Keyboard: Space or → for next, ← to go back, Esc to exit.</p>' +
        (pend ? '<p class="warn">⚠ ' + pend + ' possible duplicate' + (pend === 1 ? '' : 's') + ' still waiting in “Review answers”.</p>' : '') +
        '<div class="checks">' +
          '<label><input type="checkbox" id="optRunners"' + (opts.runners ? ' checked' : '') + '> Show 2nd and 3rd place after each winner</label>' +
          '<label><input type="checkbox" id="optSound"' + (opts.sound ? ' checked' : '') + '> Sound effects (drumroll and spooky chord)</label>' +
        '</div>' +
        '<button class="btn block" id="launch">🏆 Start the reveal</button>' +
      '</div>';
    $('#optRunners').onchange = function (e) { opts.runners = e.target.checked; lsSet(OPTS_KEY, opts); };
    $('#optSound').onchange = function (e) { opts.sound = e.target.checked; lsSet(OPTS_KEY, opts); };
    $('#launch').onclick = openReveal;
  }

  function renderSettings(body) {
    body.innerHTML =
      '<div class="card" style="max-width:640px">' +
        '<h3>Connection</h3>' +
        '<p>' + (API.demo ? '🟣 <b>Demo mode</b>: votes are stored only in this browser. Paste your Apps Script URL into <code>config.js</code> to go live.'
                          : '🟢 <b>Connected</b> to your Google Sheet.') + '</p>' +
        '<p class="help">Voting link: ' + esc(voteUrl) + '</p>' +
      '</div>' +
      (API.demo ?
        '<div class="card" style="max-width:640px"><h3>Try it out</h3>' +
        '<p>Add a batch of messy sample votes to test merging and the reveal.</p>' +
        '<button class="btn btn-sm btn-purple" id="sample">Add sample votes</button></div>' : '') +
      '<div class="card" style="max-width:640px">' +
        '<h3>Start fresh</h3>' +
        '<p>Use this after testing so practice votes don\'t count. ' +
        (API.demo ? 'This clears the demo votes in this browser.' : 'Current votes are moved to an archive tab in your Google Sheet (nothing is lost), and counting starts again from zero.') + '</p>' +
        '<button class="btn btn-sm btn-danger" id="archive">Clear votes and start fresh</button>' +
      '</div>' +
      '<div class="card" style="max-width:640px"><button class="btn btn-sm btn-ghost" id="logout">Lock host page</button></div>';
    if ($('#sample')) $('#sample').onclick = async function () { API.addSampleVotes(questions); await refresh(); render(); toast('Added 24 sample ballots'); };
    $('#archive').onclick = async function () {
      if (!confirm('Clear all current votes and start the count from zero?')) return;
      try {
        await API.archiveVotes(sGet(PASS_KEY));
        try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
        await refresh(); render(); toast('Fresh start! 🎃');
      } catch (e) { toast('Couldn\'t clear votes: ' + e.message, true); }
    };
    $('#logout').onclick = function () { sSet(PASS_KEY, ''); location.reload(); };
  }

  // ---------- QR overlay ----------
  $('#qrClose').onclick = function () { $('#qrOverlay').hidden = true; };

  // ---------- Reveal ----------
  var R = { i: -1, busy: false, timers: [] };
  var ov = $('#reveal'), stage = $('#revealStage'), nextBtn = $('#revealNext'), prevBtn = $('#revealPrev'),
      muteBtn = $('#revealMute'), spot = $('#spotlight');

  function later(fn, ms) { R.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { R.timers.forEach(clearTimeout); R.timers = []; }
  function setMuteIcon() { muteBtn.textContent = opts.sound ? '🔊' : '🔇'; }

  async function openReveal() {
    FX.Sound.unlock(); // must happen during the click so browsers allow sound
    await refresh();
    if (loadErr) toast('Using last known results: ' + loadErr, true);
    revealOpen = true;
    R.i = -1; R.busy = false;
    FX.Sound.enabled = opts.sound;
    setMuteIcon();
    ov.hidden = false;
    document.body.style.overflow = 'hidden';
    try { if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {}); } catch (e) {}
    showIntro();
  }

  function closeReveal() {
    clearTimers();
    revealOpen = false;
    ov.hidden = true;
    spot.classList.remove('on');
    document.body.style.overflow = '';
    try { if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); } catch (e) {}
    render();
  }

  function showIntro() {
    spot.classList.remove('on');
    stage.innerHTML =
      '<div class="eyebrow">' + esc(title) + '</div>' +
      '<div class="rq flicker">And the winners are…</div>' +
      '<p class="muted" style="font-size:1.3rem">' + questions.length + ' award' + (questions.length === 1 ? '' : 's') + ' · ' +
      state.submissions + ' ballot' + (state.submissions === 1 ? '' : 's') + ' cast</p>';
    nextBtn.textContent = 'Reveal first award ▶';
    nextBtn.disabled = false;
    prevBtn.hidden = true;
  }

  function advance() {
    if (R.busy) return;
    if (R.i >= questions.length) return closeReveal();
    R.i++;
    if (R.i >= questions.length) return showEnd();
    suspense(R.i);
  }

  function back() {
    if (R.busy) return;
    if (R.i <= 0) { R.i = -1; return showIntro(); }
    R.i = Math.min(R.i - 1, questions.length - 1);
    showWinner(R.i, false);
  }

  function suspense(i) {
    var q = questions[i];
    R.busy = true;
    nextBtn.disabled = true;
    prevBtn.hidden = true;
    spot.classList.remove('on');
    stage.innerHTML =
      '<div class="eyebrow">Award ' + (i + 1) + ' of ' + questions.length + '</div>' +
      '<div class="rq">' + esc(q.text) + '</div>' +
      '<div id="cd" style="min-height:1em"></div>';
    nextBtn.textContent = 'Drumroll…';
    FX.Sound.drumroll(3.4);
    var n = 3;
    function tick() {
      var cd = $('#cd');
      if (!cd) return;
      if (n > 0) { cd.innerHTML = '<div class="count3">' + n + '</div>'; n--; later(tick, 1000); }
      else showWinner(i, true);
    }
    later(tick, 500);
  }

  function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }

  function showWinner(i, dramatic) {
    var q = questions[i], t = tallies(q.id), html;
    html = '<div class="eyebrow">Award ' + (i + 1) + ' of ' + questions.length + '</div>' +
           '<div class="rq small">' + esc(q.text) + '</div>';
    if (!t.length) {
      html += '<div class="winners none"><div class="winner">No votes 👻</div></div>';
    } else {
      var top = t[0].count, winners = t.filter(function (g) { return g.count === top; });
      if (winners.length > 1) html += '<div class="tie">It\'s a ' + winners.length + '-way tie!</div>';
      html += '<div class="winners' + (winners.length > 1 ? ' multi' : '') + '">' +
        winners.map(function (w) { return '<div class="winner">' + esc(w.label) + '</div>'; }).join('') + '</div>';
      html += '<div class="votes">with <b>' + top + '</b> vote' + (top === 1 ? '' : 's') + (winners.length > 1 ? ' each' : '') + '</div>';
      if (opts.runners) {
        var rest = t.filter(function (g) { return g.count < top; }), seen = [], items = [];
        rest.forEach(function (g) { if (seen.indexOf(g.count) === -1) seen.push(g.count); });
        seen.forEach(function (c) {
          var place = t.filter(function (g) { return g.count > c; }).length + 1;
          if (place > 3) return;
          var names = rest.filter(function (g) { return g.count === c; }).map(function (g) { return esc(g.label); }).join(', ');
          items.push('<div class="runner"><b>' + ordinal(place) + '</b> · ' + names + ' <span class="muted">(' + c + ')</span></div>');
        });
        if (items.length) html += '<div class="runners">' + items.join('') + '</div>';
      }
    }
    stage.innerHTML = html;
    if (dramatic && t.length) {
      FX.Sound.stinger();
      FX.confetti();
      FX.batBurst();
    }
    spot.classList.toggle('on', !!t.length);
    R.busy = false;
    nextBtn.disabled = false;
    prevBtn.hidden = false;
    nextBtn.textContent = i === questions.length - 1 ? 'Finish 🎉' : 'Next award ▶';
  }

  function showEnd() {
    spot.classList.remove('on');
    stage.innerHTML =
      '<div class="big-emoji" style="font-size:7rem">🎃</div>' +
      '<div class="winner" style="color:var(--purple-2)">Thanks for playing!</div>' +
      '<div class="rq small" style="color:var(--orange)">Happy Halloween</div>';
    FX.confetti(140);
    FX.Sound.stinger();
    nextBtn.textContent = 'Close';
    prevBtn.hidden = false;
  }

  nextBtn.onclick = function () { nextBtn.blur(); advance(); };
  prevBtn.onclick = function () { prevBtn.blur(); back(); };
  $('#revealClose').onclick = closeReveal;
  muteBtn.onclick = function () {
    opts.sound = !opts.sound;
    FX.Sound.enabled = opts.sound;
    lsSet(OPTS_KEY, opts);
    setMuteIcon();
    muteBtn.blur();
  };

  document.addEventListener('keydown', function (e) {
    if (!$('#qrOverlay').hidden && e.key === 'Escape') { $('#qrOverlay').hidden = true; return; }
    if (!revealOpen) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back(); }
    else if (e.key === 'Escape') { closeReveal(); }
  });
  // If the browser leaves full screen via Esc, keep the reveal open (host can press Esc again or ✕ to exit).

  init();
})();
