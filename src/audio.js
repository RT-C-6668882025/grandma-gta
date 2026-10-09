// Effects/radio use WebAudio; square dance uses the user-supplied song. Voices are MiMo TTS
// clips (assets/voice/l/*.mp3). Four radio stations play in vehicles (and from
// 阿嬤's tricycle speaker): 台語老歌, 電子花車, 地下電台賣藥, 那卡西.

export const DANCE_MUSIC = { url: 'assets/music/square-dance-chorus.mp3', title: '最炫民族風', bpm: 127.085 };

export const STATIONS = [
  { id: 'off', name: '關閉', freq: '' },
  { id: 'oldies', name: '番薯寮之聲 · 台語老歌', freq: 'AM 1152' },
  { id: 'techno', name: '電子花車 · 台客電音', freq: 'FM 98.7' },
  { id: 'medicine', name: '地下電台 · 神奇大補丸', freq: 'FM 91.3' },
  { id: 'nakashi', name: '那卡西 · 走唱夜未眠', freq: 'AM 792' },
];

// The square-dance song isn't shipped (it's copyrighted). Drop your own chorus at
// DANCE_MUSIC.url; without it we render a 16-bar pentatonic 廣場舞 loop at the same BPM,
// so the rhythm game's notes still land on the beat.
async function synthDance(rate, bpm) {
  const beat = 60 / bpm, bars = 16, len = bars * 4 * beat;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * rate), rate);
  const out = ctx.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 4;
  const trim = ctx.createGain(); trim.gain.value = 0.6; out.connect(trim); trim.connect(ctx.destination);
  const noise = ctx.createBuffer(1, rate, rate); const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); };
  const tone = (type, f, t, d, v, pan = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = type; o.frequency.value = f; p.pan.value = pan; o.connect(g); g.connect(p); p.connect(out);
    env(g, t, 0.008, v, d); o.start(t); o.stop(t + d + 0.05);
  };
  const hit = (t, f0, d, v, hp) => {
    const s = ctx.createBufferSource(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    s.buffer = noise; fl.type = 'highpass'; fl.frequency.value = hp; s.connect(fl); fl.connect(g); g.connect(out);
    env(g, t, 0.002, v, d); s.start(t, Math.random() * 0.5, d + 0.05);
  };
  const kick = (t) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(out);
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(g, t, 0.003, 0.9, 0.28); o.start(t); o.stop(t + 0.35);
  };
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  // A minor pentatonic hook (A C D E G), 2 bars, played 8 times with a lift in the second half
  const hook = [69, 72, 74, 76, 74, 72, 69, 67, 69, 72, 76, 79, 76, 74, 72, 74];
  const roots = [45, 45, 41, 43];
  for (let b = 0; b < bars; b++) for (let q = 0; q < 4; q++) {
    const t = (b * 4 + q) * beat;
    kick(t);
    if (q % 2) hit(t, 0, 0.16, 0.35, 1500);                    // clap on 2 and 4
    hit(t + beat / 2, 0, 0.05, 0.18, 7000);                     // off-beat hat
    tone('sawtooth', hz(roots[(b >> 1) % 4]), t + beat / 2, beat * 0.4, 0.16);
    const n = hook[((b % 2) * 4 + q) * 2 % 16 + 0], n2 = hook[(((b % 2) * 4 + q) * 2 + 1) % 16];
    const up = b >= 8 ? 12 : 0;
    tone('square', hz(n + up - 12), t, beat * 0.45, 0.07, -0.2);
    tone('triangle', hz(n2 + up), t + beat / 2, beat * 0.45, 0.12, 0.2);
  }
  return ctx.startRendering();
}

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false;
    this.buffers = {}; this.loading = {};
    this.station = 0; this.radioOn = false;
    this.nextBeat = 0; this.beat = 0; this.djNext = 0;
    this.engine = null;
    this.danceForced = false; this.danceLevel = 0; this.danceSource = null;
  }
  start() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = 0.85; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    this.voice = ctx.createGain(); this.voice.gain.value = 1.15; this.voice.connect(this.master);
    // radio chain: band-limited, a little saturated, ducked under voices
    this.radio = ctx.createGain(); this.radio.gain.value = 0;
    this.radioDuck = ctx.createGain(); this.radioDuck.gain.value = 1;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    this.radioLP = ctx.createBiquadFilter(); this.radioLP.type = 'lowpass'; this.radioLP.frequency.value = 5200;
    this.radio.connect(hp); hp.connect(this.radioLP); this.radioLP.connect(this.radioDuck); this.radioDuck.connect(this.master);
    this.danceGain = ctx.createGain(); this.danceGain.gain.value = 0;
    this.danceDuck = ctx.createGain(); this.danceDuck.gain.value = 1;
    this.danceGain.connect(this.danceDuck); this.danceDuck.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.wind = this.bed('lowpass', 500, 0.05);
    this.cicada = this.bed('bandpass', 6200, 0.0, 14);
    this.rainBed = this.bed('highpass', 1400, 0.0, 0.5);
    this.rainLow = this.bed('lowpass', 380, 0.0, 0.7);
    this.street = this.bed('lowpass', 260, 0.0, 0.6); // distant scooters / town hum
    const lfo = ctx.createOscillator(); lfo.frequency.value = 38;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(this.cicada.g.gain); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.13;
    const lg2 = ctx.createGain(); lg2.gain.value = 0.025;
    lfo2.connect(lg2); lg2.connect(this.cicada.g.gain); lfo2.start();
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; document.hidden ? this.ctx.suspend() : this.ctx.resume(); });
    // preload a few common voice lines
    ['hit1', 'hit2', 'hit3', 'hurt1', 'hurt2', 'carjack1', 'carjack2', 'npc_hit1', 'npc_hit2', 'radio_dj1', 'radio_dj2', 'radio_dj3'].forEach((l) => this.load(l));
  }
  bed(type, f, gain, q = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(fl); fl.connect(g); g.connect(this.amb); s.start();
    return { s, f: fl, g };
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.85; }
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  noiseHit(t, type, f, q, peak, dec, dest = this.sfx) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = this.ctx.createGain();
    s.connect(fl); fl.connect(g); g.connect(dest);
    this.env(g, t, 0.004, peak, dec);
    s.start(t, Math.random()); s.stop(t + dec + 0.1);
    return fl;
  }
  tone(t, f, type, peak, dec, dest = this.sfx, a = 0.004) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = this.ctx.createGain(); o.connect(g); g.connect(dest);
    this.env(g, t, a, peak, dec);
    o.start(t); o.stop(t + a + dec + 0.05);
    return o;
  }
  pluck(t, f, vol, dest, dur = 1.6, damp = 0.497) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const n = Math.floor(sr * dur), N = Math.max(2, Math.round(sr / f));
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N; i < n; i++) d[i] = damp * (d[i - N] + d[i - N + 1]);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(dest); s.start(t);
  }
  play(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'whoosh': { const f = this.noiseHit(t, 'bandpass', 600, 1.2, 0.22 * vol, 0.2); f.frequency.exponentialRampToValueAtTime(2400, t + 0.16); break; }
      case 'hit': this.tone(t, 110, 'sine', 0.5 * vol, 0.16).frequency.exponentialRampToValueAtTime(50, t + 0.14); this.noiseHit(t, 'lowpass', 1500, 0.8, 0.5 * vol, 0.1); break;
      case 'slap': this.noiseHit(t, 'highpass', 1800, 0.6, 0.6 * vol, 0.06); this.noiseHit(t, 'bandpass', 900, 1, 0.4 * vol, 0.08); break;
      case 'bonk': this.tone(t, 520, 'triangle', 0.35 * vol, 0.12).frequency.exponentialRampToValueAtTime(260, t + 0.1); this.noiseHit(t, 'bandpass', 1200, 3, 0.3 * vol, 0.05); break;
      case 'stars': [0, 0.09, 0.18, 0.27].forEach((d, i) => this.tone(t + d, [2093, 2637, 3136, 2637][i], 'sine', 0.07, 0.2)); break;
      case 'coin': this.tone(t, 1760, 'triangle', 0.16, 0.2); this.tone(t + 0.07, 2637, 'triangle', 0.13, 0.3); break;
      case 'cash': this.noiseHit(t, 'bandpass', 3000, 2, 0.2, 0.05); [0, 0.1].forEach((d) => this.tone(t + 0.05 + d, 2400, 'sine', 0.14, 0.4)); break;
      case 'pickup': [0, 0.06, 0.12].forEach((d, i) => this.tone(t + d, [784, 988, 1319][i], 'square', 0.06, 0.12)); break;
      case 'passed': { // mission passed: brassy chord stab and a rising run
        for (const f of [261.6, 329.6, 392, 523.3]) { const o = this.tone(t, f, 'sawtooth', 0.07, 1.4, this.sfx, 0.02); o.detune.value = (Math.random() - 0.5) * 12; }
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(t + 0.5 + i * 0.09, f, 'square', 0.05, 0.25));
        this.noiseHit(t, 'lowpass', 200, 1, 0.5, 0.3);
        break;
      }
      case 'failed': [392, 370, 349.2, 311.1].forEach((f, i) => this.tone(t + i * 0.22, f, 'sawtooth', 0.06, 0.35, this.sfx, 0.02)); break;
      case 'honk': { const o = this.tone(t, 330, 'sawtooth', 0.12 * vol, 0.45, this.sfx, 0.01); const o2 = this.tone(t, 415, 'sawtooth', 0.1 * vol, 0.45, this.sfx, 0.01); break; }
      case 'beep': [0, 0.18].forEach((d) => this.tone(t + d, 520, 'square', 0.07 * vol, 0.12)); break;
      case 'bell': [0, 0.14].forEach((d) => { this.tone(t + d, 2350, 'sine', 0.12 * vol, 0.5); this.tone(t + d, 3520, 'sine', 0.05 * vol, 0.3); }); break;
      case 'crash': this.noiseHit(t, 'lowpass', 900, 0.7, 0.8 * vol, 0.5); this.tone(t, 70, 'sine', 0.5 * vol, 0.4); for (let i = 0; i < 6; i++) this.tone(t + 0.05 + Math.random() * 0.3, 2000 + Math.random() * 3000, 'sine', 0.05 * vol, 0.3); break;
      case 'skid': { const f = this.noiseHit(t, 'bandpass', 1800, 5, 0.15 * vol, 0.5); break; }
      case 'bark': for (const d of [0, 0.2]) { const o = this.tone(t + d, 480, 'sawtooth', 0.09 * vol, 0.1); o.frequency.exponentialRampToValueAtTime(280, t + d + 0.1); } break;
      case 'meow': { const o = this.tone(t, 700, 'triangle', 0.08 * vol, 0.5, this.sfx, 0.08); o.frequency.linearRampToValueAtTime(950, t + 0.15); o.frequency.linearRampToValueAtTime(600, t + 0.5); break; }
      case 'honk': for (const d of [0, 0.22]) { const o = this.tone(t + d, 520, 'sawtooth', 0.07 * vol, 0.16); o.frequency.exponentialRampToValueAtTime(380, t + d + 0.15); } break;
      case 'moo': { const o = this.tone(t, 150, 'sawtooth', 0.09 * vol, 1.3, this.sfx, 0.2); o.frequency.linearRampToValueAtTime(190, t + 0.5); o.frequency.linearRampToValueAtTime(120, t + 1.3); break; }
      case 'cluck': for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.09, 'bandpass', 1400, 8, 0.12 * vol, 0.05); break;
      case 'crow': { const o = this.tone(t, 600, 'sawtooth', 0.08 * vol, 1.1, this.sfx, 0.05); o.frequency.linearRampToValueAtTime(900, t + 0.3); o.frequency.linearRampToValueAtTime(700, t + 0.9); break; }
      case 'lighter': this.noiseHit(t, 'highpass', 4000, 1, 0.3, 0.03); this.noiseHit(t + 0.08, 'bandpass', 900, 0.8, 0.12, 0.5); break;
      case 'spit': this.noiseHit(t, 'bandpass', 2400, 2, 0.25, 0.12); break;
      case 'drink': for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.18, 'bandpass', 500 + i * 60, 5, 0.15, 0.12); break;
      case 'paper': this.noiseHit(t, 'bandpass', 2500, 1, 0.2, 0.2); break;
      case 'thud': this.tone(t, 80, 'sine', 0.35 * vol, 0.15); this.noiseHit(t, 'lowpass', 500, 1, 0.3 * vol, 0.1); break;
      case 'phone': // the old-person phone: loud polyphonic ringtone
        [0, 0.12, 0.24, 0.6, 0.72, 0.84].forEach((d, i) => this.tone(t + d, [1318, 1568, 2093, 1318, 1568, 2093][i], 'square', 0.06, 0.1));
        break;
      case 'whistle': { const o = this.tone(t, 2600, 'sine', 0.14, 0.5, this.sfx, 0.02); for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(i % 2 ? 2900 : 2600, t + i * 0.05); break; }
      case 'static': this.noiseHit(t, 'bandpass', 3000, 0.5, 0.25, 0.35); break;
      case 'door': this.noiseHit(t, 'lowpass', 500, 2, 0.4, 0.15); this.tone(t, 90, 'sine', 0.3, 0.2); break;
      case 'step': this.noiseHit(t, 'lowpass', 800, 1, 0.045 * vol, 0.05); break;
      case 'splash': this.noiseHit(t, 'bandpass', 900, 0.7, 0.2 * vol, 0.3); break;
      case 'thunder': {
        this.noiseHit(t, 'lowpass', 2400, 0.7, 0.5 * vol, 0.35);
        const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
        const g = this.ctx.createGain(); s.connect(f); f.connect(g); g.connect(this.sfx);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.25);
        for (let k = 1; k < 6; k++) g.gain.exponentialRampToValueAtTime((0.25 + Math.random() * 0.6) * vol, t + 0.25 + k * 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        s.start(t); s.stop(t + 4.6);
        break;
      }
    }
  }
  // ------------------------------------------------------------------ voices
  async load(id) {
    if (!this.ctx) return null;
    if (this.buffers[id]) return this.buffers[id];
    if (!this.loading[id]) this.loading[id] = fetch(`assets/voice/l/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)).then((b) => (this.buffers[id] = b)).catch(() => null);
    return this.loading[id];
  }
  // play a line; resolves with its duration (seconds). Ducks the radio.
  async say(id, vol = 1) {
    if (!this.ctx) return 2.5;
    const b = await this.load(id);
    if (!b) return 2.5;
    if (this.muted) return b.duration;
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.voice); s.start();
    const t = this.ctx.currentTime;
    this.danceDuck.gain.cancelScheduledValues(t);
    this.danceDuck.gain.setTargetAtTime(0.20, t, 0.08);
    this.danceDuck.gain.setTargetAtTime(1, t + b.duration, 0.3);
    this.radioDuck.gain.setTargetAtTime(0.25, t, 0.08);
    this.radioDuck.gain.setTargetAtTime(1, t + b.duration, 0.3);
    if (this.lastVoice) try { this.lastVoice.stop(); } catch (e) {}
    this.lastVoice = s;
    return b.duration;
  }
  // One shared music source for the evening square and the dance-off.
  // Keep it on a separate bus so dialogue can duck it and mute still controls it.
  async loadDanceMusic() {
    if (!this.ctx) return null;
    if (this.danceBuffer) return this.danceBuffer;
    if (!this.danceLoading) this.danceLoading = fetch(DANCE_MUSIC.url)
      .then(r => { if (!r.ok) throw new Error('Dance music unavailable'); return r.arrayBuffer(); })
      .then(b => this.ctx.decodeAudioData(b))
      .catch(e => { console.warn(e.message + ' — using the built-in synth loop'); return synthDance(this.ctx.sampleRate, DANCE_MUSIC.bpm); })
      .then(b => (this.danceBuffer = b));
    return this.danceLoading;
  }
  setDanceLevel(level, restart = false) {
    if (!this.ctx) return;
    this.danceLevel = Math.max(0, Math.min(1, level));
    this.danceGain.gain.setTargetAtTime(this.danceLevel * 0.42, this.ctx.currentTime, 0.18);
    if (restart && this.danceSource) { this.danceSource.stop(); this.danceSource.disconnect(); this.danceSource = null; }
    if (this.danceLevel > 0 && !this.danceSource && !this.danceStarting) {
      this.danceStarting = true;
      this.loadDanceMusic().then(b => {
        this.danceStarting = false;
        if (!b || this.danceLevel <= 0 || this.danceSource) return;
        const source = this.ctx.createBufferSource(); source.buffer = b; source.loop = true;
        source.connect(this.danceGain); source.start(); this.danceSource = source;
      });
    }
  }
  setDanceMode(on) {
    this.danceForced = on;
    if (on) this.setRadio(false);
    this.setDanceLevel(on ? 1 : 0, on);
  }
  // ------------------------------------------------------------------ radio
  setRadio(on, station = this.station) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (station !== this.station || on !== this.radioOn) this.play('static');
    this.station = station;
    this.radioOn = on && STATIONS[station].id !== 'off';
    this.radio.gain.setTargetAtTime(this.radioOn ? 0.5 : 0, t, 0.15);
    this.nextBeat = t + 0.3; this.beat = 0;
    if (this.radioOn && STATIONS[station].id === 'medicine') this.djNext = t + 0.5;
    else this.djNext = t + 25 + Math.random() * 20;
  }
  // radio sound: inside a car it's clean, from the tricycle speaker it's boxier
  radioTone(car) { if (this.ctx) this.radioLP.frequency.setTargetAtTime(car ? 6500 : 3200, this.ctx.currentTime, 0.2); }
  scheduleRadio() {
    const ctx = this.ctx, st = STATIONS[this.station].id;
    const now = ctx.currentTime;
    if (this.djNext && now > this.djNext) {
      const id = st === 'medicine' ? 'radio_dj1' : Math.random() < 0.5 ? 'radio_dj2' : 'radio_dj3';
      this.load(id).then((b) => {
        if (!b || !this.radioOn) return;
        const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = 1.3; s.connect(g); g.connect(this.radio); s.start();
      });
      this.djNext = now + (st === 'medicine' ? 26 : 50 + Math.random() * 30);
      this.djUntil = now + 13;
    }
    while (this.nextBeat < now + 0.25) {
      const t = this.nextBeat, b = this.beat++;
      const talkDuck = this.djUntil && t < this.djUntil ? 0.35 : 1;
      const out = this.radio;
      if (st === 'techno') {
        // 電子花車: 132 bpm four-on-the-floor, offbeat hats, octave bass, cheesy hook
        const spb = 60 / 132 / 2; // eighth notes
        const step = b % 16;
        if (step % 2 === 0) { const k = this.tone(t, 120, 'sine', 0.6 * talkDuck, 0.18, out); k.frequency.exponentialRampToValueAtTime(42, t + 0.14); }
        else this.noiseHit(t, 'highpass', 7000, 1, 0.12 * talkDuck, 0.05, out);
        const bassN = [55, 55, 110, 55, 65.4, 65.4, 130.8, 65.4][Math.floor(b / 2) % 8];
        this.tone(t, bassN, 'sawtooth', 0.14 * talkDuck, spb * 0.9, out);
        const hook = [659.3, 0, 784, 659.3, 587.3, 523.3, 587.3, 0, 659.3, 0, 784, 880, 784, 659.3, 587.3, 0];
        const bar = Math.floor(b / 16) % 4;
        const f = hook[step] * (bar === 3 ? 0.891 : 1);
        if (f && bar !== 2) { const o = this.tone(t, f, 'square', 0.05 * talkDuck, spb * 0.85, out); o.detune.value = 8; this.tone(t, f * 1.005, 'sawtooth', 0.03 * talkDuck, spb * 0.8, out); }
        if (step === 12 && bar === 3) this.noiseHit(t, 'bandpass', 1500, 0.5, 0.2 * talkDuck, 0.4, out);
        this.nextBeat += spb;
      } else if (st === 'oldies' || st === 'medicine') {
        // 台語老歌: slow 4/4 ballad, organ pad + accordion-ish lead in minor pentatonic, brushed snare
        const spb = 60 / 76 / 2;
        const step = b % 8;
        const chords = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];
        const ch = chords[Math.floor(b / 8) % 4];
        const vol = (st === 'medicine' ? 0.4 : 1) * talkDuck;
        if (step === 0) for (const f of ch) { const o = this.tone(t, f, 'triangle', 0.04 * vol, spb * 7, out, 0.15); }
        if (step % 4 === 0) this.tone(t, ch[0] / 2, 'sine', 0.2 * vol, spb * 1.6, out);
        if (step === 2 || step === 6) this.noiseHit(t, 'bandpass', 2500, 0.6, 0.07 * vol, 0.12, out);
        const mel = [440, 523.3, 587.3, 659.3, 783.99, 659.3, 587.3, 523.3, 440, 392, 440, 523.3, 440, 392, 329.6, 392];
        if (Math.random() < 0.8 && step % 2 === 0) {
          const f = mel[(Math.floor(b / 2) + Math.floor(b / 32) * 3) % mel.length];
          const o = this.tone(t, f, 'sawtooth', 0.035 * vol, spb * 1.9, out, 0.05);
          const v = ctx.createOscillator(); v.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 9; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + spb * 2);
        }
        this.nextBeat += spb;
      } else if (st === 'nakashi') {
        // 那卡西: 3/4 waltz, plucked guitar arpeggio + electone
        const spb = 60 / 150;
        const step = b % 3;
        const chords = [[164.8, 246.9, 329.6, 392], [220, 261.6, 329.6, 440], [146.8, 220, 293.7, 349.2], [123.5, 246.9, 311.1, 370]];
        const ch = chords[Math.floor(b / 6) % 4];
        this.pluck(t, step === 0 ? ch[0] : ch[1 + ((b + step) % 3)], (step === 0 ? 0.5 : 0.3) * talkDuck, out, 1.4);
        if (step === 0 && Math.floor(b / 3) % 2 === 0) { const f = ch[3] * 2 * [1, 1.122, 0.891, 1.335][Math.floor(b / 6) % 4]; const o = this.tone(t, f, 'square', 0.03 * talkDuck, spb * 2.6, out, 0.08); o.detune.value = 6; }
        this.nextBeat += spb;
      } else this.nextBeat += 0.5;
    }
  }
  // ------------------------------------------------------------------ engine drone
  engineSet(kind, speed, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.engine) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const o2 = this.ctx.createOscillator(); o2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o.start(); o2.start();
      this.engine = { o, o2, f, g };
    }
    const e = this.engine;
    const car = kind === 'car', scoot = kind === 'scooter';
    if (kind === 'electric') {
      // hub motor: a thin rising whine, quiet when stopped
      e.o.frequency.setTargetAtTime(160 + speed * 48, t, 0.1);
      e.o2.frequency.setTargetAtTime((160 + speed * 48) * 1.5, t, 0.1);
      e.f.frequency.setTargetAtTime(2400, t, 0.1);
      e.g.gain.setTargetAtTime(on ? 0.006 + Math.min(1, speed / 8) * 0.018 : 0, t, 0.15);
      return;
    }
    const base = car ? 38 : 70;
    const f0 = base + speed * (car ? 3.2 : 7);
    e.o.frequency.setTargetAtTime(f0, t, 0.1);
    e.o2.frequency.setTargetAtTime(f0 * (scoot ? 2.01 : 0.5), t, 0.1);
    e.f.frequency.setTargetAtTime(scoot ? 1400 : 500 + speed * 25, t, 0.1);
    e.g.gain.setTargetAtTime(on ? (car ? 0.05 : 0.035) : 0, t, 0.2);
  }
  update(dt, st) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p, v) => p.setTargetAtTime(v, t, 0.3);
    set(this.wind.g.gain, 0.03 + (st.wind || 0) * 0.12 + (st.speed || 0) * 0.004);
    set(this.rainBed.g.gain, (st.rain || 0) * 0.32);
    set(this.rainLow.g.gain, (st.rain || 0) * 0.18);
    const day = !st.night;
    // cicadas scream by day in the fields; crickets at night
    set(this.cicada.g.gain, (st.inTown ? 0.012 : day ? 0.05 : 0.025) * (1 - (st.rain || 0)));
    this.cicada.f.frequency.setTargetAtTime(day ? 6200 : 4200, t, 0.5);
    set(this.street.g.gain, st.inTown ? 0.06 : 0.015);
    if (this.radioOn) this.scheduleRadio();
    const proximity = Math.max(0, Math.min(1, (32 - (st.danceDistance ?? Infinity)) / 24));
    this.setDanceLevel(this.danceForced ? 1 : this.radioOn ? 0 : proximity);
  }
}
