// Spooky effects: confetti, bat bursts and synthesized sounds (no audio files needed).
(function () {
  'use strict';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLORS = ['#ff7b1c', '#ff9a4d', '#8d44e0', '#b685ff', '#8bff4f', '#ffffff'];

  function confetti(n) {
    n = reduced ? 12 : (n || 110);
    for (var i = 0; i < n; i++) {
      var d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = (Math.random() * 100) + 'vw';
      d.style.background = COLORS[i % COLORS.length];
      d.style.width = (6 + Math.random() * 8) + 'px';
      d.style.height = (10 + Math.random() * 10) + 'px';
      d.style.borderRadius = Math.random() < 0.3 ? '50%' : '2px';
      d.style.animationDuration = (2.4 + Math.random() * 2.6) + 's';
      d.style.animationDelay = (Math.random() * 0.8) + 's';
      document.body.appendChild(d);
      setTimeout(function (el) { el.remove(); }, 6000, d);
    }
  }

  function batBurst(n) {
    if (reduced) return;
    n = n || 12;
    for (var i = 0; i < n; i++) {
      var b = document.createElement('div');
      b.className = 'burst-bat';
      b.textContent = '🦇';
      var ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      var dist = 40 + Math.random() * 25;
      b.style.setProperty('--dx', Math.cos(ang) * dist + 'vw');
      b.style.setProperty('--dy', Math.sin(ang) * dist + 'vh');
      b.style.animationDelay = (Math.random() * 0.25) + 's';
      document.body.appendChild(b);
      setTimeout(function (el) { el.remove(); }, 2600, b);
    }
  }

  var Sound = {
    ctx: null,
    enabled: true,
    unlock: function () {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    _noise: function (seconds) {
      var ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    },
    drumroll: function (seconds) {
      if (!this.enabled || !this.unlock()) return;
      var ctx = this.ctx, now = ctx.currentTime, buf = this._noise(0.06);
      for (var t = 0; t < seconds; t += 0.045) {
        var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf;
        f.type = 'bandpass'; f.frequency.value = 160 + Math.random() * 60; f.Q.value = 0.8;
        var vol = 0.12 + 0.55 * (t / seconds);
        g.gain.setValueAtTime(vol, now + t);
        g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.05);
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(now + t); src.stop(now + t + 0.06);
      }
    },
    stinger: function () {
      if (!this.enabled || !this.unlock()) return;
      var ctx = this.ctx, now = ctx.currentTime;
      var master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
      // Spooky organ chord (A minor with a sour note).
      [110, 220, 261.63, 329.63, 415.3].forEach(function (freq, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = i === 0 ? 'triangle' : 'sawtooth';
        o.frequency.value = freq;
        lp.type = 'lowpass'; lp.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
        o.connect(lp); lp.connect(g); g.connect(master);
        o.start(now); o.stop(now + 2.5);
      });
      // Cymbal crash.
      var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = this._noise(2);
      hp.type = 'highpass'; hp.frequency.value = 5000;
      ng.gain.setValueAtTime(0.5, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      n.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      n.start(now); n.stop(now + 2);
    }
  };

  window.FX = { confetti: confetti, batBurst: batBurst, Sound: Sound };
})();
