// Talks to the Google Apps Script backend (or to the browser's storage in demo mode).
(function () {
  'use strict';
  var C = window.CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var LS_VOTES = 'hv_demo_votes';
  var LS_MERGES = 'hv_demo_merges';

  // Turns "Sarah's  Witch!!" into "sarah witch" so near-identical answers count together.
  // Keep this identical to norm_() in Code.gs.
  function norm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    try { t = t.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return t.replace(/['’`]s\b/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
  }

  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // rows: [{s: submissionId, q: questionId, a: answer}]
  function groupVotes(rows) {
    var out = {}, subs = {};
    rows.forEach(function (r) {
      subs[r.s] = 1;
      var a = String(r.a).trim(), key = norm(a);
      if (!key) return;
      var q = out[r.q] || (out[r.q] = {});
      var e = q[key] || (q[key] = { key: key, count: 0, spellings: {} });
      e.count++;
      e.spellings[a] = (e.spellings[a] || 0) + 1;
    });
    var results = {};
    Object.keys(out).forEach(function (q) {
      results[q] = Object.keys(out[q]).map(function (k) {
        var e = out[q][k];
        var label = Object.keys(e.spellings).sort(function (a, b) { return e.spellings[b] - e.spellings[a]; })[0];
        return { key: e.key, count: e.count, label: label, variants: Object.keys(e.spellings) };
      }).sort(function (a, b) { return b.count - a.count; });
    });
    return { results: results, submissions: Object.keys(subs).length };
  }

  async function post(body) {
    var r = await fetch(C.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight Apps Script can't answer
      body: JSON.stringify(body)
    });
    var j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  async function get(params) {
    var u = new URL(C.APPS_SCRIPT_URL);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    u.searchParams.set('_', Date.now());
    var r = await fetch(u.toString());
    var j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  window.API = {
    demo: DEMO,
    norm: norm,

    loadQuestions: async function () {
      var r = await fetch('questions.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('Could not load questions.json');
      var d = await r.json();
      if (!d || !Array.isArray(d.questions) || !d.questions.length) throw new Error('questions.json has no questions');
      return d;
    },

    // answers: [{questionId, answer}]
    submitVote: async function (answers) {
      if (DEMO) {
        var rows = lsGet(LS_VOTES, []), s = 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        answers.forEach(function (a) { rows.push({ s: s, q: a.questionId, a: a.answer }); });
        lsSet(LS_VOTES, rows);
        await new Promise(function (r) { setTimeout(r, 400); });
        return { ok: true };
      }
      return post({ action: 'vote', answers: answers });
    },

    getResults: async function () {
      if (DEMO) {
        var g = groupVotes(lsGet(LS_VOTES, []));
        return { ok: true, results: g.results, submissions: g.submissions, merges: lsGet(LS_MERGES, {}) };
      }
      return get({ action: 'results' });
    },

    saveMerges: async function (merges, passcode) {
      if (DEMO) { lsSet(LS_MERGES, merges); return { ok: true }; }
      return post({ action: 'saveMerges', merges: merges, passcode: passcode });
    },

    archiveVotes: async function (passcode) {
      if (DEMO) { lsSet(LS_VOTES, []); lsSet(LS_MERGES, {}); return { ok: true }; }
      return post({ action: 'archiveVotes', passcode: passcode });
    },

    // Demo only: fills in some messy sample votes so you can try merging and the reveal.
    addSampleVotes: function (questions) {
      var pools = [
        ['Sarah', 'sara', "Sarah's witch", 'Sarah', 'Mr. Bones', 'mr bones', 'Pumpkin Pete', 'The Mummy', 'Dracula', 'Sarah'],
        ['The Mummy', 'mummy', 'the mummy!', 'Dracula', 'dracula', 'Zombie Zoe', 'Sarah', 'Mr. Bones', 'Zombie Zoe'],
        ['Pumpkin Pete', 'pumpkin pete', 'Pumkin Pete', 'Mr. Bones', 'The banana', 'banana guy', 'Sarah', 'Dracula']
      ];
      var rows = lsGet(LS_VOTES, []);
      for (var i = 0; i < 24; i++) {
        var s = 'sample-' + Date.now() + '-' + i;
        questions.forEach(function (q, qi) {
          var pool = pools[qi % pools.length];
          rows.push({ s: s, q: q.id, a: pool[Math.floor(Math.random() * pool.length)] });
        });
      }
      lsSet(LS_VOTES, rows);
    }
  };
})();
