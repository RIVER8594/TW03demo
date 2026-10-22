/**
 * Momcozy TW03 Towel Warmer Interactive Demos - Engine
 * Pure Vanilla ES6 Engine supporting Scheme 1, 2, and 3
 */

// ==========================================
// 1. Audio Engine (Realistic Appliance Sound)
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.soundUrl = 'sound/' + encodeURIComponent('叮的一声.wav');
    this.audioBuffer = null;
    this.audioPool = [];
    this.poolSize = 8;
    this.poolIndex = 0;
    this.initAudio();
  }

  initAudio() {
    // 1. Initialize HTMLAudioElement pool for instant local / file:// and web playback
    if (typeof Audio !== 'undefined') {
      try {
        for (let i = 0; i < this.poolSize; i++) {
          const a = new Audio(this.soundUrl);
          a.preload = 'auto';
          this.audioPool.push(a);
        }
      } catch (e) {
        console.warn('Audio pool initialization failed', e);
      }
    }

    // 2. Pre-fetch for Web Audio API buffer if running in HTTP/HTTPS environment
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (typeof fetch === 'function') {
          fetch(this.soundUrl)
            .then(res => {
              if (!res.ok) throw new Error('Network error');
              return res.arrayBuffer();
            })
            .then(buf => this.ctx.decodeAudioData(buf))
            .then(decoded => {
              this.audioBuffer = decoded;
            })
            .catch(() => {
              // file:// protocol or fetch blocked; Audio element pool handles playback
            });
        }
      }
    } catch (_) {}
  }

  unlockAudio() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playDing() {
    if (this.muted) return;
    this.unlockAudio();

    // 1. Web Audio API playback (zero latency, clean concurrent overlaps)
    if (this.ctx && this.audioBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        gain.gain.value = 0.9;
        source.buffer = this.audioBuffer;
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        return;
      } catch (e) {
        // Fallback to pool
      }
    }

    // 2. HTMLAudioElement pool playback
    if (this.audioPool && this.audioPool.length > 0) {
      try {
        const audio = this.audioPool[this.poolIndex];
        this.poolIndex = (this.poolIndex + 1) % this.audioPool.length;
        audio.currentTime = 0;
        audio.volume = 0.9;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
        return;
      } catch (_) {}
    }

    // 3. Fallback synthesizer if file cannot be played
    this.playBeep(1600, 0.03, 'sine', 0.15);
  }

  playClick() {
    this.playDing();
  }

  playPower(on = true) {
    this.playDing();
  }

  playMode() {
    this.playDing();
  }

  playAlert() {
    this.playDing();
  }

  playBeep(freq = 1400, duration = 0.035, type = 'sine', gainVal = 0.15) {
    if (this.muted) return;
    try {
      this.unlockAudio();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }
}

const sound = new SoundEngine();

// ==========================================
// 2. Constants & Presets
// ==========================================
const HEAT_TIME_PRESETS = [
  '00:20', '00:30', '00:40', '00:50', '01:00',
  '01:10', '01:20', '01:30', '02:00', '03:00'
];

const DRY_TIME_PRESETS = [
  '01:00', '02:00', '03:00', '04:00', '05:00'
];

const BABY_HEAT_TIME_PRESETS = [
  '00:15', '00:20', '00:30', '00:40', '00:50',
  '01:00', '01:10', '01:20', '01:30', '03:00'
];

const BABY_DRY_TIME_PRESETS = [
  '00:30', '01:00', '02:00', '03:00', '04:00', '05:00'
];

const RESERVATION_PRESETS = [
  '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30', '04:00',
  '05:00', '06:00', '08:00', '10:00', '12:00', '16:00', '20:00', '24:00'
];

const TEMP_PRESETS_F = [120, 140, 160];
const TEMP_PRESETS_C = [50, 60, 70];
const DRY_TEMP_F = 210;
const DRY_TEMP_C = 100;
const BABY_TEMP_F = 105;
const BABY_TEMP_C = 40;
const BABY_DRY_TEMP_F = 180;
const BABY_DRY_TEMP_C = 82;

// Helper to get digit SVG path
function getDigitSvg(digit) {
  if (digit === '-' || digit === '—') return 'images/内容=-.svg';
  if (digit === ' ' || digit === null || digit === undefined || digit === '') return 'images/内容=熄灭.svg';
  return `images/内容=${digit}.svg`;
}

// Convert string like "00:40" to minutes
function timeStrToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Format seconds into HH:MM or MM:SS
function formatCountdown(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ==========================================
// 3. Scheme 1 Controller
// Single Screen (Time OR Temp), Flame+Dots, Composite Key
// ==========================================
class Scheme1Controller {
  constructor(rootEl, onStateChange) {
    this.root = rootEl;
    this.onStateChange = onStateChange;

    // Core States
    this.power = 'standby'; // 'off' | 'standby' | 'running' | 'paused' | 'reserved'
    this.mode = 'heat'; // 'heat' | 'dry'
    this.babyMode = false;
    this.unit = 'F'; // 'F' | 'C'
    this.childLocked = false;
    this.isLowPower = false;

    // Edit & Display States
    this.editMode = 'none'; // 'none' | 'temp' | 'time' | 'reservation'
    this.standbyParam = 'temp'; // 'temp' | 'time' (3s alternating carousel in standby)

    // Preset Indices (Remembered values)
    this.tempIndex = 1; // Heat: 140°F / 60°C
    this.heatTimeIndex = 6; // Heat Time: '01:20'
    this.dryTimeIndex = 0; // Dry Time: '01:00'
    this.babyHeatTimeIndex = 4; // Baby Heat Time: '00:50'
    this.babyDryTimeIndex = 1; // Baby Dry Time: '01:00'
    this.reserveIndex = 3; // Reservation: '02:00'

    // Timers & Intervals
    this.remainingSec = 0;
    this.countdownTimer = null;
    this.dotCycle = 0;
    this.dotInterval = null;
    this.carouselTimer = null;
    this.inactivityTimer = null;
    this.lowPowerTimer = null;
    this.lockWarningTimer = null;

    // Press Timers (Long-press handlers)
    this.powerPressTimer = null;
    this.powerPressStart = 0;
    this.heatPressTimer = null;
    this.heatPressStart = 0;
    this.compPressTimer = null;
    this.compPressStart = 0;
    this.babyPressTimer = null;
    this.babyPressStart = 0;

    // Adjust Continuous Step (+/- continuous press)
    this.adjustHoldTimer = null;
    this.adjustStepInterval = null;

    this.lastTouchTime = 0;
    this.lastCompClickTime = 0;

    this.bindEvents();
    this.startStandbyCarousel();
    this.resetLowPowerTimer();
    this.render();
  }

  // Get current temperature value according to mode and unit
  get currentTemp() {
    if (this.babyMode) {
      if (this.mode === 'dry') {
        return this.unit === 'F' ? BABY_DRY_TEMP_F : BABY_DRY_TEMP_C;
      }
      return this.unit === 'F' ? BABY_TEMP_F : BABY_TEMP_C;
    }
    if (this.mode === 'dry') {
      return this.unit === 'F' ? DRY_TEMP_F : DRY_TEMP_C;
    }
    const list = this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C;
    return list[this.tempIndex];
  }

  // Get current time string
  get currentTimeStr() {
    if (this.babyMode) {
      return this.mode === 'heat'
        ? BABY_HEAT_TIME_PRESETS[this.babyHeatTimeIndex]
        : BABY_DRY_TIME_PRESETS[this.babyDryTimeIndex];
    }
    return this.mode === 'heat'
      ? HEAT_TIME_PRESETS[this.heatTimeIndex]
      : DRY_TIME_PRESETS[this.dryTimeIndex];
  }

  // Current reservation string
  get currentReserveStr() {
    return RESERVATION_PRESETS[this.reserveIndex];
  }

  // ==================== EVENT BINDING ====================
  bindEvents() {
    // 1. Power/Start Button in Pill Center
    const powerBtn = this.root.querySelector('.pill-power-center');
    if (powerBtn) {
      const startP = (e) => this.handlePowerDown(e);
      const endP = (e) => this.handlePowerUp(e);
      const cancelP = () => this.handlePowerCancel();
      powerBtn.addEventListener('mousedown', startP);
      powerBtn.addEventListener('touchstart', startP, { passive: true });
      powerBtn.addEventListener('mouseup', endP);
      powerBtn.addEventListener('mouseleave', cancelP);
      powerBtn.addEventListener('touchend', endP);
    }

    // 2. Heat Button (Click to set mode, Long press 2s in standby to switch unit °F/°C)
    const heatBtn = this.root.querySelector('.pill-heat');
    if (heatBtn) {
      const startH = (e) => this.handleHeatDown(e);
      const endH = (e) => this.handleHeatUp(e);
      const cancelH = () => this.handleHeatCancel();
      heatBtn.addEventListener('mousedown', startH);
      heatBtn.addEventListener('touchstart', startH, { passive: true });
      heatBtn.addEventListener('mouseup', endH);
      heatBtn.addEventListener('mouseleave', cancelH);
      heatBtn.addEventListener('touchend', endH);
    }

    // 3. Dry Button
    const dryBtn = this.root.querySelector('.pill-dry');
    if (dryBtn) {
      dryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.interceptLockedOrLowPower()) return;
        if (this.editMode === 'reservation' || this.power === 'reserved') return;
        this.selectMode('dry');
      });
    }

    // 4. Setting (Composite) Key (Click: toggle Temp/Time edit; Long press 2s: Reservation)
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      const startC = (e) => this.handleCompDown(e);
      const endC = (e) => this.handleCompUp(e);
      const cancelC = () => this.handleCompCancel();
      compBtn.addEventListener('mousedown', startC);
      compBtn.addEventListener('touchstart', startC, { passive: true });
      compBtn.addEventListener('mouseup', endC);
      compBtn.addEventListener('mouseleave', cancelC);
      compBtn.addEventListener('touchend', endC);
    }

    // 5. Baby Button (Click: toggle baby mode; Long press 2s: child lock toggle)
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      const startB = (e) => this.handleBabyDown(e);
      const endB = (e) => this.handleBabyUp(e);
      const cancelB = () => this.handleBabyCancel();
      babyBtn.addEventListener('mousedown', startB);
      babyBtn.addEventListener('touchstart', startB, { passive: true });
      babyBtn.addEventListener('mouseup', endB);
      babyBtn.addEventListener('mouseleave', cancelB);
      babyBtn.addEventListener('touchend', endB);
    }

    // 6. Minus [-] Button
    const minusBtn = this.root.querySelector('.btn-adjust-left');
    if (minusBtn) {
      const startM = (e) => this.handleAdjustDown(e, -1);
      const endM = (e) => this.handleAdjustUp(e);
      minusBtn.addEventListener('mousedown', startM);
      minusBtn.addEventListener('touchstart', startM, { passive: true });
      minusBtn.addEventListener('mouseup', endM);
      minusBtn.addEventListener('mouseleave', endM);
      minusBtn.addEventListener('touchend', endM);
    }

    // 7. Plus [+] Button
    const plusBtn = this.root.querySelector('.btn-adjust-right');
    if (plusBtn) {
      const startP = (e) => this.handleAdjustDown(e, 1);
      const endP = (e) => this.handleAdjustUp(e);
      plusBtn.addEventListener('mousedown', startP);
      plusBtn.addEventListener('touchstart', startP, { passive: true });
      plusBtn.addEventListener('mouseup', endP);
      plusBtn.addEventListener('mouseleave', endP);
      plusBtn.addEventListener('touchend', endP);
    }
  }

  // ==================== INTERCEPTION (LOCK & LOW POWER) ====================
  interceptLockedOrLowPower(targetKey = '') {
    // 1. If currently in low power, any click only wakes up the unit without action
    if (this.isLowPower) {
      this.wakeUp();
      sound.playClick();
      return true;
    }
    this.resetLowPowerTimer();

    // 2. If child lock is active, clicking any button triggers warning flash (0.6s on/off)
    if (this.childLocked && targetKey !== 'babyLongPress') {
      this.triggerLockWarning();
      sound.playAlert();
      return true;
    }
    return false;
  }

  triggerLockWarning() {
    const lockIcon = this.root.querySelector('.s1-icon-lock');
    if (!lockIcon) return;
    lockIcon.classList.add('lock-warning-blink');
    if (this.lockWarningTimer) clearTimeout(this.lockWarningTimer);
    this.lockWarningTimer = setTimeout(() => {
      lockIcon.classList.remove('lock-warning-blink');
    }, 1800);
  }

  wakeUp() {
    this.isLowPower = false;
    this.root.classList.remove('low-power');
    this.resetLowPowerTimer();
  }

  resetLowPowerTimer() {
    clearTimeout(this.lowPowerTimer);
    // 5 minutes (300,000 ms) inactivity leads to low-power state per specification
    this.lowPowerTimer = setTimeout(() => {
      this.enterLowPower();
    }, 300000);
  }

  enterLowPower() {
    this.isLowPower = true;
    this.root.classList.add('low-power');
  }

  isSyntheticMouseEvent(e) {
    if (!e) return false;
    if (e.type && e.type.startsWith('touch')) {
      this.lastTouchTime = Date.now();
      return false;
    }
    if (e.type && e.type.startsWith('mouse')) {
      if (Date.now() - this.lastTouchTime < 700) {
        return true;
      }
    }
    return false;
  }

  // ==================== POWER & START / PAUSE LOGIC ====================
  handlePowerDown(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) e.stopPropagation();
    if (this.isLowPower) {
      this.wakeUp();
      return;
    }
    this.powerPressStart = Date.now();
    this.powerLongPressed = false;
    clearTimeout(this.powerPressTimer);

    // 1.5s long press triggers on/off
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.togglePowerOnOff();
    }, 1500);
  }

  handlePowerCancel() {
    clearTimeout(this.powerPressTimer);
    this.powerPressStart = 0;
  }

  handlePowerUp(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) {
      e.stopPropagation();
      if (e.cancelable && e.type && e.type.startsWith('touch')) {
        e.preventDefault();
      }
    }
    clearTimeout(this.powerPressTimer);
    if (this.powerLongPressed) {
      this.powerPressStart = 0;
      return;
    }

    if (this.powerPressStart && Date.now() - this.powerPressStart < 1500) {
      this.powerPressStart = 0;
      // Short click on Power/Start
      if (this.power === 'off') {
        // In power-off state, short click has no action (must long-press 1.5s to turn on)
        return;
      }
      if (this.interceptLockedOrLowPower()) return;
      this.handleStartPauseClick();
    }
    this.powerPressStart = 0;
  }

  togglePowerOnOff() {
    if (this.power === 'off') {
      // Turn ON -> Standby
      this.power = 'standby';
      this.editMode = 'none';
      sound.playPower(true);
      this.startStandbyCarousel();
    } else {
      // Turn OFF
      this.power = 'off';
      this.editMode = 'none';
      this.childLocked = false;
      this.stopRunning();
      this.stopStandbyCarousel();
      sound.playPower(false);
    }
    this.render();
  }

  handleStartPauseClick() {
    sound.playClick();
    if (this.editMode === 'reservation') {
      // Confirm Reservation on Power button click
      this.confirmReservation();
      return;
    }
    if (this.power === 'reserved') {
      // Start immediately from reservation countdown
      this.startRunning();
      return;
    }
    if (this.power === 'standby') {
      // Start Running
      this.startRunning();
    } else if (this.power === 'running') {
      // Pause
      this.pauseRunning();
    } else if (this.power === 'paused') {
      // Resume Running
      this.resumeRunning();
    }
    this.render();
  }

  startRunning() {
    this.power = 'running';
    this.editMode = 'none';
    this.stopStandbyCarousel();
    this.remainingSec = timeStrToMinutes(this.currentTimeStr) * 60;
    this.startCountdown();
    this.startDotAnimation();
    this.render();
  }

  pauseRunning() {
    this.power = 'paused';
    clearInterval(this.countdownTimer);
    clearInterval(this.dotInterval);
    this.render();
  }

  resumeRunning() {
    this.power = 'running';
    this.startCountdown();
    this.startDotAnimation();
    this.render();
  }

  stopRunning() {
    clearInterval(this.countdownTimer);
    clearInterval(this.dotInterval);
  }

  startCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'running' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderDigits();
        if (this.remainingSec <= 0) {
          // Finished
          this.power = 'standby';
          sound.playAlert();
          this.stopRunning();
          this.startStandbyCarousel();
          this.render();
        }
      }
    }, 1000);
  }

  startDotAnimation() {
    clearInterval(this.dotInterval);
    this.dotCycle = 0;
    this.dotInterval = setInterval(() => {
      if (this.power === 'running') {
        this.dotCycle = (this.dotCycle + 1) % 5;
        this.renderDots();
      }
    }, 380);
  }

  renderDots() {
    const dots = this.root.querySelectorAll('.indicator-dot');
    const flame = this.root.querySelector('.indicator-flame');
    if (!flame) return;

    if (this.power === 'running') {
      flame.classList.add('active');
      dots.forEach((dot, idx) => {
        let pairDist = 0;
        if (idx <= 3) pairDist = 3 - idx;
        else pairDist = idx - 4;
        if (this.dotCycle === 0) {
          dot.classList.toggle('active', false);
        } else if (pairDist < this.dotCycle) {
          dot.classList.toggle('active', true);
        } else {
          dot.classList.toggle('active', false);
        }
      });
    } else if (this.power === 'paused') {
      flame.classList.add('active');
      // In pause, flame stays on and dots stay fixed at current state per spec
    } else {
      flame.classList.remove('active');
      dots.forEach(d => d.classList.remove('active'));
    }
  }

  // ==================== STANDBY 3S ALTERNATING CAROUSEL ====================
  startStandbyCarousel() {
    this.stopStandbyCarousel();
    this.standbyParam = 'temp'; // Start with temperature per specification
    this.carouselTimer = setInterval(() => {
      if (this.power === 'standby' && this.editMode === 'none' && !this.childLocked) {
        this.standbyParam = this.standbyParam === 'temp' ? 'time' : 'temp';
        this.render();
      }
    }, 3000);
  }

  stopStandbyCarousel() {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  // ==================== MODE & UNIT SWITCHING ====================
  handleHeatDown(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    this.heatPressStart = Date.now();
    this.heatLongPressed = false;
    clearTimeout(this.heatPressTimer);

    // Long press 2s in standby switches unit (°F / °C)
    if (this.power === 'standby') {
      this.heatPressTimer = setTimeout(() => {
        this.heatLongPressed = true;
        this.toggleUnit();
      }, 2000);
    }
  }

  handleHeatCancel() {
    clearTimeout(this.heatPressTimer);
    this.heatPressStart = 0;
  }

  handleHeatUp(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) {
      e.stopPropagation();
      if (e.cancelable && e.type && e.type.startsWith('touch')) {
        e.preventDefault();
      }
    }
    clearTimeout(this.heatPressTimer);
    if (this.heatLongPressed) {
      this.heatPressStart = 0;
      return;
    }
    if (this.heatPressStart && Date.now() - this.heatPressStart < 2000) {
      this.heatPressStart = 0;
      if (this.editMode === 'reservation' || this.power === 'reserved') return;
      this.selectMode('heat');
    }
    this.heatPressStart = 0;
  }

  selectMode(newMode) {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playMode();

    if (this.power === 'paused') {
      // Per spec: changing mode during pause immediately returns to standby!
      this.power = 'standby';
      this.stopRunning();
      this.startStandbyCarousel();
    }

    this.mode = newMode;
    this.babyMode = false;

    if (this.power === 'standby') {
      this.exitEditMode();
    }
    this.render();
  }

  toggleUnit() {
    sound.playClick();
    this.unit = this.unit === 'F' ? 'C' : 'F';
    this.render();
  }

  // ==================== SETTING KEY (COMPOSITE KEY) & RESERVATION ====================
  handleCompDown(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
    this.compPressStart = Date.now();
    this.compLongPressed = false;
    clearTimeout(this.compPressTimer);

    // Long press 2s triggers reservation setup or cancels reservation
    this.compPressTimer = setTimeout(() => {
      this.compLongPressed = true;
      this.toggleReservation();
    }, 2000);
  }

  handleCompCancel() {
    clearTimeout(this.compPressTimer);
    this.compPressStart = 0;
  }

  handleCompUp(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) {
      e.stopPropagation();
      if (e.cancelable && e.type && e.type.startsWith('touch')) {
        e.preventDefault();
      }
    }
    clearTimeout(this.compPressTimer);
    if (this.compLongPressed) {
      this.compPressStart = 0;
      return;
    }

    if (this.compPressStart && Date.now() - this.compPressStart < 2000) {
      this.compPressStart = 0;
      this.handleCompClick();
    }
    this.compPressStart = 0;
  }

  handleCompClick() {
    const now = Date.now();
    if (now - this.lastCompClickTime < 350) return;
    this.lastCompClickTime = now;

    // In reservation setting or reserved countdown, short click does nothing!
    if (this.editMode === 'reservation' || this.power === 'reserved') return;

    sound.playClick();

    if (this.power === 'paused') {
      // In pause, editing parameter returns to standby
      this.power = 'standby';
      this.stopRunning();
      this.enterEditMode('time');
      return;
    }

    if (this.power !== 'standby') return;

    // Standby: 1st click -> Time edit; 2nd click -> Temp edit; 3rd click -> Time edit
    if (this.editMode === 'none') {
      this.enterEditMode('time');
    } else if (this.editMode === 'time') {
      this.enterEditMode('temp');
    } else if (this.editMode === 'temp') {
      this.enterEditMode('time');
    }
  }

  enterEditMode(mode) {
    this.editMode = mode;
    this.stopStandbyCarousel();
    this.resetEditInactivityTimer();
    this.render();
  }

  exitEditMode() {
    this.editMode = 'none';
    clearTimeout(this.inactivityTimer);
    if (this.power === 'standby') {
      this.startStandbyCarousel();
    }
    this.render();
  }

  resetEditInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    // 5s inactivity returns to default standby per spec
    this.inactivityTimer = setTimeout(() => {
      this.exitEditMode();
    }, 5000);
  }

  // ==================== RESERVATION LOGIC ====================
  toggleReservation() {
    sound.playClick();
    if (this.power === 'reserved' || this.editMode === 'reservation') {
      // Cancel reservation and return to standby
      this.cancelReservation();
      return;
    }

    if (this.power === 'standby') {
      // Enter reservation editing
      this.power = 'standby';
      this.editMode = 'reservation';
      this.reserveIndex = 3; // Default 02:00
      this.stopStandbyCarousel();

      // 1-minute auto-cancel if start not pressed
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.cancelReservation();
      }, 60000);

      this.render();
    }
  }

  cancelReservation() {
    this.power = 'standby';
    this.editMode = 'none';
    clearInterval(this.countdownTimer);
    clearTimeout(this.inactivityTimer);
    this.startStandbyCarousel();
    this.render();
  }

  confirmReservation() {
    sound.playClick();
    this.power = 'reserved';
    this.editMode = 'none';
    clearTimeout(this.inactivityTimer);
    this.stopStandbyCarousel();
    this.remainingSec = timeStrToMinutes(this.currentReserveStr) * 60;
    this.startReserveCountdown();
    this.render();
  }

  startReserveCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'reserved' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderDigits();
        if (this.remainingSec <= 0) {
          sound.playAlert();
          this.startRunning();
        }
      }
    }, 1000);
  }

  // ==================== BABY MODE & CHILD LOCK ====================
  handleBabyDown(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    this.babyPressStart = Date.now();
    this.babyLongPressed = false;
    clearTimeout(this.babyPressTimer);

    // Long press 2s triggers child lock
    this.babyPressTimer = setTimeout(() => {
      this.babyLongPressed = true;
      this.toggleChildLock();
    }, 2000);
  }

  handleBabyCancel() {
    clearTimeout(this.babyPressTimer);
    this.babyPressStart = 0;
  }

  handleBabyUp(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) {
      e.stopPropagation();
      if (e.cancelable && e.type && e.type.startsWith('touch')) {
        e.preventDefault();
      }
    }
    clearTimeout(this.babyPressTimer);
    if (this.babyLongPressed) {
      this.babyPressStart = 0;
      return;
    }

    if (this.babyPressStart && Date.now() - this.babyPressStart < 2000) {
      this.babyPressStart = 0;
      if (this.interceptLockedOrLowPower()) return;
      if (this.editMode === 'reservation' || this.power === 'reserved') return;
      this.toggleBabyMode();
    }
    this.babyPressStart = 0;
  }

  toggleChildLock() {
    this.childLocked = !this.childLocked;
    sound.playAlert();
    if (this.childLocked) {
      this.exitEditMode();
    }
    this.render();
  }

  toggleBabyMode() {
    if (this.power === 'off') return;
    sound.playClick();

    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }

    this.babyMode = !this.babyMode;

    if (this.power === 'standby') {
      this.exitEditMode();
    }
    this.render();
  }

  // ==================== PARAMETER ADJUSTMENT (+ / -) ====================
  handleAdjustDown(e, delta) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
    if (this.power === 'off' || this.power === 'running' || this.power === 'paused' || this.power === 'reserved') return;
    if (this.editMode === 'none') return;
    this.adjustValue(delta);

    // Continuous stepping after 0.5s hold (step every 0.5s)
    clearTimeout(this.adjustHoldTimer);
    clearInterval(this.adjustStepInterval);
    this.adjustHoldTimer = setTimeout(() => {
      this.adjustStepInterval = setInterval(() => {
        this.adjustValue(delta);
      }, 500);
    }, 500);
  }

  handleAdjustUp(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e && e.cancelable && e.type && e.type.startsWith('touch')) {
      e.preventDefault();
    }
    clearTimeout(this.adjustHoldTimer);
    clearInterval(this.adjustStepInterval);
  }

  adjustValue(delta) {
    if (this.power === 'off' || this.power === 'running' || this.power === 'paused' || this.power === 'reserved') return;
    if (this.editMode === 'none') return;
    sound.playClick();
    this.resetEditInactivityTimer();

    // In reservation mode
    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      const next = this.reserveIndex + delta;
      if (next >= 0 && next <= max) {
        this.reserveIndex = next;
      }
      this.render();
      return;
    }

    if (this.editMode === 'temp') {
      if (this.mode === 'dry' || this.babyMode) {
        // Temperature is fixed! Cannot be adjusted
        return;
      }
      // Adult HEAT: 120, 140, 160 (or 50, 60, 70)
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      const next = this.tempIndex + delta;
      if (next >= 0 && next <= max) {
        this.tempIndex = next;
      }
    } else if (this.editMode === 'time') {
      if (this.babyMode) {
        if (this.mode === 'heat') {
          const max = BABY_HEAT_TIME_PRESETS.length - 1;
          const next = this.babyHeatTimeIndex + delta;
          if (next >= 0 && next <= max) this.babyHeatTimeIndex = next;
        } else {
          const max = BABY_DRY_TIME_PRESETS.length - 1;
          const next = this.babyDryTimeIndex + delta;
          if (next >= 0 && next <= max) this.babyDryTimeIndex = next;
        }
      } else {
        if (this.mode === 'heat') {
          const max = HEAT_TIME_PRESETS.length - 1;
          const next = this.heatTimeIndex + delta;
          if (next >= 0 && next <= max) this.heatTimeIndex = next;
        } else {
          const max = DRY_TIME_PRESETS.length - 1;
          const next = this.dryTimeIndex + delta;
          if (next >= 0 && next <= max) this.dryTimeIndex = next;
        }
      }
    }
    this.render();
  }

  // ==================== RENDER UI & STATES ====================
  render() {
    const isOff = this.power === 'off';
    const isRunning = this.power === 'running';
    const isPaused = this.power === 'paused';
    const isReserved = this.power === 'reserved';

    this.root.classList.toggle('device-off', isOff);
    this.root.classList.toggle('running', isRunning);
    this.root.classList.toggle('paused', isPaused);
    this.root.classList.toggle('low-power', this.isLowPower);

    // 1. Pill Bar Buttons
    const heatEl = this.root.querySelector('.pill-heat');
    const dryEl = this.root.querySelector('.pill-dry');
    const powerCenter = this.root.querySelector('.pill-power-center');

    const isReservedOrSetting = (this.editMode === 'reservation' || isReserved);

    if (heatEl) {
      if (isOff) {
        heatEl.style.opacity = '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'none';
      } else {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'auto';
      }
      heatEl.classList.toggle('active', this.mode === 'heat' && !isOff);
      heatEl.classList.toggle('baby-mode', this.mode === 'heat' && this.babyMode && !isOff);
    }

    if (dryEl) {
      if (isOff) {
        dryEl.style.opacity = '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'none';
      } else {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'auto';
      }
      dryEl.classList.toggle('active', this.mode === 'dry' && !isOff);
      dryEl.classList.toggle('baby-mode', this.mode === 'dry' && this.babyMode && !isOff);
    }

    if (powerCenter) {
      if (isOff) {
        powerCenter.style.opacity = '0.5';
        powerCenter.classList.remove('active', 'pause-blink');
      } else if (isPaused) {
        powerCenter.style.opacity = '1';
        powerCenter.classList.add('pause-blink');
      } else {
        powerCenter.style.opacity = '1';
        powerCenter.classList.remove('pause-blink');
        powerCenter.classList.add('active');
      }
    }

    // 2. Setting / Composite Key (Left bottom)
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      const compImg = compBtn.querySelector('img');
      if (isOff) {
        compBtn.style.opacity = '0.05';
        compBtn.style.pointerEvents = 'none';
        compBtn.style.filter = 'none';
        compBtn.classList.remove('editing-glow');
        if (compImg) compImg.src = 'images/时间:温度icon/状态=全灭.svg';
      } else if (isRunning) {
        compBtn.style.opacity = '0';
        compBtn.style.pointerEvents = 'none';
        compBtn.style.filter = 'none';
        compBtn.classList.remove('editing-glow');
      } else {
        compBtn.style.pointerEvents = 'auto';
        const isEditing = (this.editMode === 'temp' || this.editMode === 'time' || this.editMode === 'reservation');
        compBtn.style.opacity = isEditing ? '1' : '0.45';
        compBtn.style.filter = isEditing ? 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.85))' : 'none';
        compBtn.classList.toggle('editing-glow', isEditing);
        if (compImg) compImg.src = isEditing
          ? 'images/时间:温度icon/状态=全亮.svg'
          : 'images/时间:温度icon/状态=半亮.svg';
      }
    }

    // 3. Baby Key (Right bottom)
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      if (isOff) {
        babyBtn.style.opacity = '0.05';
        babyBtn.style.pointerEvents = 'none';
      } else if (isRunning) {
        if (this.babyMode) {
          babyBtn.style.opacity = '1';
          babyBtn.style.pointerEvents = 'none';
        } else {
          babyBtn.style.opacity = '0';
          babyBtn.style.pointerEvents = 'none';
        }
      } else if (isReservedOrSetting) {
        babyBtn.style.pointerEvents = 'none';
        babyBtn.style.opacity = '0.25';
      } else {
        babyBtn.style.pointerEvents = 'auto';
        babyBtn.style.opacity = this.babyMode ? '1' : '0.25';
      }
      const isBabyActive = this.babyMode && !isOff;
      babyBtn.classList.toggle('baby-active', isBabyActive);
      const babyImg = babyBtn.querySelector('img');
      if (babyImg) {
        babyImg.src = isBabyActive ? 'images/宝宝模式_绿.svg' : 'images/宝宝模式.svg';
      }
    }

    // 4. Adjust Buttons (+ / -)
    const minusBtn = this.root.querySelector('.btn-adjust-left');
    const plusBtn = this.root.querySelector('.btn-adjust-right');
    this.renderAdjustButtons(minusBtn, plusBtn, isOff, isRunning);

    // 5. Time & Temp Indicator Tabs at Top
    this.renderTabs(isOff, isRunning);

    // 6. Status Icons
    this.renderIcons(isOff, isReserved);

    // 7. Segmented Digits
    this.renderDigits();

    // 8. Dots & Flame
    this.renderDots();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 1,
        power: this.power,
        mode: this.mode,
        temp: this.currentTemp,
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit,
        childLocked: this.childLocked
      });
    }
  }

  renderAdjustButtons(minusBtn, plusBtn, isOff, isRunning) {
    if (!minusBtn || !plusBtn) return;

    const hide = (btn) => {
      btn.classList.remove('active');
      btn.classList.add('disabled');
      btn.style.setProperty('opacity', '0', 'important');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
    };

    const show = (btn) => {
      btn.classList.remove('disabled');
      btn.classList.add('active');
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
    };

    if (isOff || isRunning || this.power === 'reserved' || this.power === 'paused' || this.editMode === 'none') {
      hide(minusBtn);
      hide(plusBtn);
      return;
    }

    // 1. In reservation edit
    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      if (this.reserveIndex <= 0) hide(minusBtn);
      else show(minusBtn);

      if (this.reserveIndex >= max) hide(plusBtn);
      else show(plusBtn);
      return;
    }

    // 2. If editing temp
    if (this.editMode === 'temp') {
      // In Dry mode or Baby mode, temperature is fixed and cannot be adjusted at all!
      if (this.mode === 'dry' || this.babyMode) {
        hide(minusBtn);
        hide(plusBtn);
        return;
      }
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      if (this.tempIndex <= 0) hide(minusBtn);
      else show(minusBtn);

      if (this.tempIndex >= max) hide(plusBtn);
      else show(plusBtn);
      return;
    }

    // 3. If editing time
    if (this.editMode === 'time') {
      let atMin = false;
      let atMax = false;
      if (this.babyMode) {
        if (this.mode === 'heat') {
          atMin = this.babyHeatTimeIndex <= 0;
          atMax = this.babyHeatTimeIndex >= BABY_HEAT_TIME_PRESETS.length - 1;
        } else {
          atMin = this.babyDryTimeIndex <= 0;
          atMax = this.babyDryTimeIndex >= BABY_DRY_TIME_PRESETS.length - 1;
        }
      } else {
        if (this.mode === 'heat') {
          atMin = this.heatTimeIndex <= 0;
          atMax = this.heatTimeIndex >= HEAT_TIME_PRESETS.length - 1;
        } else {
          atMin = this.dryTimeIndex <= 0;
          atMax = this.dryTimeIndex >= DRY_TIME_PRESETS.length - 1;
        }
      }

      if (atMin) hide(minusBtn);
      else show(minusBtn);

      if (atMax) hide(plusBtn);
      else show(plusBtn);
      return;
    }

    hide(minusBtn);
    hide(plusBtn);
  }

  renderTabs(isOff, isRunning) {
    const timeTab = this.root.querySelector('.pos-time-tab .tab-label');
    const timeLine = this.root.querySelector('.pos-time-tab .tab-indicator-line');
    const tempTab = this.root.querySelector('.pos-temp-tab .tab-label');
    const tempLine = this.root.querySelector('.pos-temp-tab .tab-indicator-line');

    if (!timeTab || !tempTab) return;

    if (isOff || isRunning) {
      timeTab.classList.remove('active');
      tempTab.classList.remove('active');
      if (timeLine) timeLine.classList.remove('active');
      if (tempLine) tempLine.classList.remove('active');
      if (timeTab.parentElement) timeTab.parentElement.style.opacity = isRunning ? '0' : '';
      if (tempTab.parentElement) tempTab.parentElement.style.opacity = isRunning ? '0' : '';
      return;
    }
    if (timeTab.parentElement) timeTab.parentElement.style.opacity = '';
    if (tempTab.parentElement) tempTab.parentElement.style.opacity = '';

    let isShowingTime = false;
    if (isRunning || this.power === 'paused') {
      isShowingTime = true;
    } else if (this.editMode === 'time' || this.editMode === 'reservation') {
      isShowingTime = true;
    } else if (this.editMode === 'temp') {
      isShowingTime = false;
    } else {
      isShowingTime = this.standbyParam === 'time';
    }

    timeTab.classList.toggle('active', isShowingTime);
    tempTab.classList.toggle('active', !isShowingTime);
    if (timeLine) timeLine.classList.toggle('active', isShowingTime);
    if (tempLine) tempLine.classList.toggle('active', !isShowingTime);
  }

  renderIcons(isOff, isReserved) {
    const iconWifi = this.root.querySelector('.s1-icon-wifi');
    const iconAlarm = this.root.querySelector('.s1-icon-alarm');
    const iconLock = this.root.querySelector('.s1-icon-lock');
    const iconIon = this.root.querySelector('.s1-icon-ion');
    const iconF = this.root.querySelector('.s1-icon-f');
    const iconC = this.root.querySelector('.s1-icon-c');

    if (iconWifi) iconWifi.classList.toggle('active', !isOff);

    // Negative Ion Icon: lit up whenever device is operating (running / paused)
    const isOperating = (this.power === 'running' || this.power === 'paused');
    if (iconIon) {
      iconIon.classList.toggle('active', isOperating && !isOff);
    }

    // Alarm Icon (Reservation)
    if (iconAlarm) {
      const showAlarm = this.editMode === 'reservation' || isReserved;
      iconAlarm.classList.toggle('active', showAlarm && !isOff);
    }

    // Lock Icon (Child Lock)
    if (iconLock) {
      iconLock.classList.toggle('active', this.childLocked && !isOff);
    }

    // Unit Icons (°F / °C)
    let isShowingTime = (this.power === 'running' || this.power === 'paused') || (this.editMode === 'time' || this.editMode === 'reservation') || (this.editMode === 'none' && this.standbyParam === 'time');
    if (iconF) iconF.classList.toggle('active', !isOff && !isShowingTime && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', !isOff && !isShowingTime && this.unit === 'C');
  }

  renderDigits() {
    const digitContainer = this.root.querySelector('.s1-digits');
    if (!digitContainer) return;

    if (this.power === 'off') {
      digitContainer.innerHTML = '';
      return;
    }

    // Blinking styles: In pause state, digits blink at 1s on / 1s off in sync with power center
    const isPaused = this.power === 'paused';
    const isEditing = this.editMode !== 'none';
    digitContainer.classList.toggle('blinking', isEditing && !isPaused);
    digitContainer.classList.toggle('pause-blink', isPaused);

    let d1 = ' ', d2 = ' ', d3 = ' ', d4 = ' ';
    let showColon = false;

    // 1. Running or Paused
    if (this.power === 'running' || this.power === 'paused') {
      showColon = true;
      const str = formatCountdown(this.remainingSec);
      const [h, m] = str.split(':');
      d1 = h[0]; d2 = h[1]; d3 = m[0]; d4 = m[1];
    }
    // 2. Reservation setup
    else if (this.editMode === 'reservation') {
      showColon = true;
      const str = this.currentReserveStr;
      const [h, m] = str.split(':');
      d1 = h[0]; d2 = h[1]; d3 = m[0]; d4 = m[1];
    }
    // 2b. Reservation countdown
    else if (this.power === 'reserved') {
      showColon = true;
      const str = formatCountdown(this.remainingSec);
      const [h, m] = str.split(':');
      d1 = h[0]; d2 = h[1]; d3 = m[0]; d4 = m[1];
    }
    // 3. Time Editing or Standby Time display
    else if (this.editMode === 'time' || (this.editMode === 'none' && this.standbyParam === 'time')) {
      showColon = true;
      const str = this.currentTimeStr;
      const [h, m] = str.split(':');
      d1 = h[0]; d2 = h[1]; d3 = m[0]; d4 = m[1];
    }
    // 4. Temperature Editing or Standby Temp display
    else {
      showColon = false;
      const tempNum = String(this.currentTemp);
      if (tempNum.length === 3) {
        d1 = ' ';
        d2 = tempNum[0];
        d3 = tempNum[1];
        d4 = tempNum[2];
      } else if (tempNum.length === 2) {
        d1 = ' ';
        d2 = ' ';
        d3 = tempNum[0];
        d4 = tempNum[1];
      }
    }

    digitContainer.innerHTML = `
      <img class="seg-digit" src="${getDigitSvg(d1)}" alt="${d1}">
      <img class="seg-digit" src="${getDigitSvg(d2)}" alt="${d2}">
      <img class="seg-colon" src="images/colon.svg" alt=":" style="visibility: ${showColon ? 'visible' : 'hidden'};">
      <img class="seg-digit" src="${getDigitSvg(d3)}" alt="${d3}">
      <img class="seg-digit" src="${getDigitSvg(d4)}" alt="${d4}">
    `;
  }
}

// ==========================================
// 4. Scheme 2 Controller
// Dual Screen (Time on top, Temp below), Dynamic [+]/[-] Left key, Sweeping Yellow Divider
// ==========================================
class Scheme2Controller {
  constructor(rootEl, onStateChange) {
    this.root = rootEl;
    this.onStateChange = onStateChange;

    this.power = 'standby';
    this.mode = 'heat';
    this.editMode = 'none'; // 'none', 'time', 'temp'
    this.babyMode = false;
    this.unit = 'F';
    this.tempIndex = 1;
    this.heatTimeIndex = 2; // 00:40
    this.dryTimeIndex = 0; // 01:00
    this.reserveIndex = 3; // 02:00
    this.savedPreBabyTempIndex = 1;

    this.remainingSec = 40 * 60;
    this.countdownTimer = null;
    this.inactivityTimer = null;
    this.lastTouchTime = 0;

    this.compPressTimer = null;
    this.compPressStartTime = 0;
    this.compLongPressed = false;

    this.bindEvents();
    this.render();
  }

  get currentTemp() {
    if (this.babyMode) {
      if (this.mode === 'dry') {
        return this.unit === 'F' ? BABY_DRY_TEMP_F : BABY_DRY_TEMP_C;
      }
      return this.unit === 'F' ? BABY_TEMP_F : BABY_TEMP_C;
    }
    if (this.mode === 'dry') {
      return this.unit === 'F' ? DRY_TEMP_F : DRY_TEMP_C;
    }
    const list = this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C;
    return list[this.tempIndex];
  }

  get currentTimeStr() {
    return this.mode === 'heat' 
      ? HEAT_TIME_PRESETS[this.heatTimeIndex] 
      : DRY_TIME_PRESETS[this.dryTimeIndex];
  }

  get currentReserveStr() {
    return RESERVATION_PRESETS[this.reserveIndex];
  }

  bindEvents() {
    // Power button in pill center
    const powerBtn = this.root.querySelector('.pill-power-center');
    if (powerBtn) {
      powerBtn.addEventListener('mousedown', (e) => this.handlePowerPressStart(e));
      powerBtn.addEventListener('touchstart', (e) => this.handlePowerPressStart(e), { passive: true });
      powerBtn.addEventListener('mouseup', (e) => this.handlePowerPressEnd(e));
      powerBtn.addEventListener('mouseleave', () => {
        clearTimeout(this.powerPressTimer);
        this.powerPressStartTime = 0;
      });
      powerBtn.addEventListener('touchend', (e) => this.handlePowerPressEnd(e));
    }

    // Heat Pill Section
    const heatSection = this.root.querySelector('.pill-heat');
    if (heatSection) {
      heatSection.addEventListener('click', () => this.setMode('heat'));
    }

    // Dry Pill Section
    const drySection = this.root.querySelector('.pill-dry');
    if (drySection) {
      drySection.addEventListener('click', () => this.setMode('dry'));
    }

    // Bottom Composite Key (Short click: cycle edit; Long press 2s: Reservation)
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      const startComp = (e) => this.handleCompPressStart(e);
      const endComp = (e) => this.handleCompPressEnd(e);
      const cancelComp = () => this.handleCompPressCancel();
      compBtn.addEventListener('mousedown', startComp);
      compBtn.addEventListener('touchstart', startComp, { passive: true });
      compBtn.addEventListener('mouseup', endComp);
      compBtn.addEventListener('mouseleave', cancelComp);
      compBtn.addEventListener('touchend', endComp);
      compBtn.addEventListener('touchcancel', cancelComp);
    }

    // Baby Mode Key
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      babyBtn.addEventListener('click', () => this.toggleBabyMode());
    }

    // Left dynamic [+] / [-] button
    const leftBtn = this.root.querySelector('.btn-adjust-left');
    if (leftBtn) {
      leftBtn.addEventListener('click', () => this.handleLeftAdjust());
    }

    // Right [+] button
    const rightBtn = this.root.querySelector('.btn-adjust-right');
    if (rightBtn) {
      rightBtn.addEventListener('click', () => this.adjustParam(1));
    }

    // Direct Time Digits Click to edit
    const timeDigits = this.root.querySelector('.s23-time-digits');
    if (timeDigits) {
      timeDigits.addEventListener('click', () => this.enterEdit('time'));
    }

    // Direct Temp Digits Click to edit
    const tempDigits = this.root.querySelector('.s2-temp-digits');
    if (tempDigits) {
      tempDigits.addEventListener('click', () => this.enterEdit('temp'));
    }

    // Unit toggle on °F / °C click
    const unitF = this.root.querySelector('.s2-icon-f');
    const unitC = this.root.querySelector('.s2-icon-c');
    if (unitF) unitF.addEventListener('click', () => this.toggleUnit());
    if (unitC) unitC.addEventListener('click', () => this.toggleUnit());
  }

  isSyntheticMouseEvent(e) {
    if (!e) return false;
    if (e.type && e.type.startsWith('touch')) {
      this.lastTouchTime = Date.now();
      return false;
    }
    if (e.type && e.type.startsWith('mouse')) {
      if (Date.now() - this.lastTouchTime < 700) {
        return true;
      }
    }
    return false;
  }

  handlePowerPressStart(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    this.powerPressStartTime = Date.now();
    this.powerLongPressed = false;
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.toggleOnOff();
    }, 1200);
  }

  handlePowerPressEnd(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e && e.cancelable && e.type && e.type.startsWith('touch')) {
      e.preventDefault();
    }
    clearTimeout(this.powerPressTimer);
    if (!this.powerLongPressed && this.powerPressStartTime && Date.now() - this.powerPressStartTime < 1200) {
      this.toggleStartPause();
    }
    this.powerPressStartTime = 0;
  }

  toggleOnOff() {
    if (this.power === 'off') {
      this.power = 'standby';
      sound.playPower(true);
      this.resetInactivityTimer();
    } else {
      this.power = 'off';
      sound.playPower(false);
      this.stopRunning();
      this.editMode = 'none';
    }
    this.render();
  }

  toggleStartPause() {
    if (this.power === 'off') {
      this.toggleOnOff();
      return;
    }
    sound.playClick();
    if (this.editMode === 'reservation') {
      this.confirmReservation();
      return;
    }
    if (this.power === 'reserved') {
      this.startRunning();
      return;
    }
    if (this.power === 'standby') {
      this.startRunning();
    } else if (this.power === 'running') {
      this.pauseRunning();
    } else if (this.power === 'paused') {
      this.resumeRunning();
    }
    this.render();
  }

  startRunning() {
    this.power = 'running';
    this.editMode = 'none';
    this.remainingSec = timeStrToMinutes(this.currentTimeStr) * 60;
    this.startCountdown();
    this.render();
  }

  resumeRunning() {
    this.power = 'running';
    this.startCountdown();
    this.render();
  }

  pauseRunning() {
    this.power = 'paused';
    clearInterval(this.countdownTimer);
    this.render();
  }

  stopRunning() {
    clearInterval(this.countdownTimer);
  }

  startCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'running' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderTimeDigits();
        if (this.remainingSec <= 0) {
          this.power = 'standby';
          sound.playAlert();
          this.stopRunning();
          this.render();
        }
      }
    }, 1000);
  }

  // ==================== RESERVATION LOGIC ====================
  handleCompPressStart(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (this.power === 'off') return;
    this.compPressStartTime = Date.now();
    this.compLongPressed = false;
    clearTimeout(this.compPressTimer);

    // Long press 2s triggers reservation setup or cancels reservation
    this.compPressTimer = setTimeout(() => {
      this.compLongPressed = true;
      this.toggleReservation();
    }, 2000);
  }

  handleCompPressCancel() {
    clearTimeout(this.compPressTimer);
    this.compPressStartTime = 0;
  }

  handleCompPressEnd(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e && e.cancelable && e.type && e.type.startsWith('touch')) {
      e.preventDefault();
    }
    clearTimeout(this.compPressTimer);
    if (this.compLongPressed) {
      this.compPressStartTime = 0;
      return;
    }

    if (this.compPressStartTime && Date.now() - this.compPressStartTime < 2000) {
      this.compPressStartTime = 0;
      // In reservation setup or reserved countdown, short click does nothing!
      if (this.editMode === 'reservation' || this.power === 'reserved') return;
      this.cycleCompositeKey();
    }
    this.compPressStartTime = 0;
  }

  toggleReservation() {
    sound.playClick();
    if (this.power === 'reserved' || this.editMode === 'reservation') {
      this.cancelReservation();
      return;
    }

    if (this.power === 'standby') {
      this.power = 'standby';
      this.editMode = 'reservation';
      this.reserveIndex = 3; // Default 02:00
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.cancelReservation();
      }, 60000);
      this.render();
    }
  }

  cancelReservation() {
    this.power = 'standby';
    this.editMode = 'none';
    clearInterval(this.countdownTimer);
    clearTimeout(this.inactivityTimer);
    this.render();
  }

  confirmReservation() {
    sound.playClick();
    this.power = 'reserved';
    this.editMode = 'none';
    clearTimeout(this.inactivityTimer);
    this.remainingSec = timeStrToMinutes(this.currentReserveStr) * 60;
    this.startReserveCountdown();
    this.render();
  }

  startReserveCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'reserved' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderTimeDigits();
        if (this.remainingSec <= 0) {
          sound.playAlert();
          this.startRunning();
        }
      }
    }, 1000);
  }

  cycleCompositeKey() {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playClick();
    this.resetInactivityTimer();

    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
      this.editMode = 'time';
      this.render();
      return;
    }

    if (this.mode === 'dry') {
      this.editMode = this.editMode === 'none' ? 'time' : 'none';
    } else if (this.editMode === 'none') {
      this.editMode = 'time';
    } else if (this.editMode === 'time') {
      this.editMode = this.babyMode ? 'none' : 'temp';
    } else if (this.editMode === 'temp') {
      this.editMode = 'time';
    }
    this.render();
  }

  enterEdit(type) {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    if (type === 'temp' && (this.babyMode || this.mode === 'dry')) return;
    sound.playClick();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.editMode = type;
    this.resetInactivityTimer();
    this.render();
  }

  setMode(mode) {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    if (this.mode === mode && this.power !== 'paused') return;
    sound.playMode();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.mode = mode;
    this.editMode = 'none';
    this.babyMode = false;
    this.resetInactivityTimer();
    this.render();
  }

  toggleBabyMode() {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playClick();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.babyMode = !this.babyMode;
    if (this.babyMode) {
      this.savedPreBabyTempIndex = this.tempIndex;
      this.editMode = 'none';
    } else {
      this.tempIndex = this.savedPreBabyTempIndex;
    }
    this.resetInactivityTimer();
    this.render();
  }

  toggleUnit() {
    if (this.power === 'off') return;
    sound.playClick();
    this.unit = this.unit === 'F' ? 'C' : 'F';
    this.render();
  }

  handleLeftAdjust() {
    if (this.power === 'off' || this.power === 'running' || this.power === 'paused' || this.power === 'reserved') return;
    if (this.editMode === 'none') return;
    this.adjustParam(-1);
  }

  adjustParam(delta) {
    if (this.power === 'off' || this.power === 'running' || this.power === 'paused' || this.power === 'reserved') return;
    if (this.editMode === 'none') return;
    sound.playClick();
    this.resetInactivityTimer();

    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      const next = this.reserveIndex + delta;
      if (next >= 0 && next <= max) {
        this.reserveIndex = next;
      }
      this.render();
      return;
    }

    if (this.editMode === 'temp') {
      if (this.babyMode || this.mode === 'dry') return;
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      const next = this.tempIndex + delta;
      if (next >= 0 && next <= max) {
        this.tempIndex = next;
      }
    } else if (this.editMode === 'time') {
      if (this.mode === 'heat') {
        const max = HEAT_TIME_PRESETS.length - 1;
        const next = this.heatTimeIndex + delta;
        if (next >= 0 && next <= max) {
          this.heatTimeIndex = next;
        }
      } else {
        const max = DRY_TIME_PRESETS.length - 1;
        const next = this.dryTimeIndex + delta;
        if (next >= 0 && next <= max) {
          this.dryTimeIndex = next;
        }
      }
    }
    this.render();
  }

  renderAdjustButtons(leftBtn, rightBtn, isOff, isRunning) {
    if (!leftBtn || !rightBtn) return;

    const hide = (btn) => {
      btn.classList.remove('active');
      btn.classList.add('disabled');
      btn.style.setProperty('opacity', '0', 'important');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
    };

    const show = (btn) => {
      btn.classList.remove('disabled');
      btn.classList.add('active');
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
    };

    if (isOff || isRunning || this.power === 'reserved' || this.power === 'paused' || this.editMode === 'none') {
      hide(leftBtn);
      hide(rightBtn);
      return;
    }

    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      if (this.reserveIndex <= 0) hide(leftBtn);
      else show(leftBtn);

      if (this.reserveIndex >= max) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    if (this.editMode === 'temp') {
      // Fixed temp in dry mode or baby mode: cannot be adjusted at all!
      if (this.mode === 'dry' || this.babyMode) {
        hide(leftBtn);
        hide(rightBtn);
        return;
      }
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      if (this.tempIndex <= 0) hide(leftBtn);
      else show(leftBtn);

      if (this.tempIndex >= max) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    if (this.editMode === 'time') {
      let atMin = false;
      let atMax = false;
      if (this.mode === 'heat') {
        atMin = this.heatTimeIndex <= 0;
        atMax = this.heatTimeIndex >= HEAT_TIME_PRESETS.length - 1;
      } else {
        atMin = this.dryTimeIndex <= 0;
        atMax = this.dryTimeIndex >= DRY_TIME_PRESETS.length - 1;
      }

      if (atMin) hide(leftBtn);
      else show(leftBtn);

      if (atMax) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    hide(leftBtn);
    hide(rightBtn);
  }

  resetInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.editMode !== 'none') {
        this.editMode = 'none';
        this.render();
      }
    }, 5000);
  }

  render() {
    const isOff = this.power === 'off';
    const isRunning = this.power === 'running';
    const isPaused = this.power === 'paused';
    const isReserved = this.power === 'reserved';
    const isReservedOrSetting = (this.editMode === 'reservation' || isReserved);

    this.root.classList.toggle('device-off', isOff);
    this.root.classList.toggle('running', isRunning);
    this.root.classList.toggle('paused', isPaused);

    // Pill sections
    const heatEl = this.root.querySelector('.pill-heat');
    const dryEl = this.root.querySelector('.pill-dry');
    const powerCenter = this.root.querySelector('.pill-power-center');
    if (heatEl) {
      if (isOff) {
        heatEl.style.opacity = '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'none';
      } else {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'auto';
      }
      heatEl.classList.toggle('active', this.mode === 'heat' && !isOff);
      heatEl.classList.toggle('baby-mode', this.mode === 'heat' && this.babyMode && !isOff);
    }
    if (dryEl) {
      if (isOff) {
        dryEl.style.opacity = '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'none';
      } else {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'auto';
      }
      dryEl.classList.toggle('active', this.mode === 'dry' && !isOff);
      dryEl.classList.toggle('baby-mode', this.mode === 'dry' && this.babyMode && !isOff);
    }
    if (powerCenter) {
      if (isOff) {
        powerCenter.style.opacity = '0.5';
        powerCenter.classList.remove('active', 'pause-blink');
      } else if (isPaused) {
        powerCenter.style.opacity = '1';
        powerCenter.classList.add('pause-blink');
      } else {
        powerCenter.style.opacity = '1';
        powerCenter.classList.remove('pause-blink');
        powerCenter.classList.add('active');
      }
    }

    // Baby Mode Button
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      if (isOff) {
        babyBtn.style.opacity = '0.05';
        babyBtn.style.pointerEvents = 'none';
      } else if (isRunning) {
        if (this.babyMode) {
          babyBtn.style.opacity = '1';
          babyBtn.style.pointerEvents = 'none';
        } else {
          babyBtn.style.opacity = '0';
          babyBtn.style.pointerEvents = 'none';
        }
      } else if (isReservedOrSetting) {
        babyBtn.style.pointerEvents = 'none';
        babyBtn.style.opacity = '0.25';
      } else {
        babyBtn.style.pointerEvents = 'auto';
        babyBtn.style.opacity = this.babyMode ? '1' : '0.25';
      }
      const isBabyActive = this.babyMode && !isOff;
      babyBtn.classList.toggle('baby-active', isBabyActive);
      const babyImg = babyBtn.querySelector('img');
      if (babyImg) {
        babyImg.src = isBabyActive ? 'images/宝宝模式_绿.svg' : 'images/宝宝模式.svg';
      }
    }

    // Left Button [-] and Right Button [+]
    const leftBtn = this.root.querySelector('.btn-adjust-left');
    const rightBtn = this.root.querySelector('.btn-adjust-right');
    this.renderAdjustButtons(leftBtn, rightBtn, isOff, isRunning);

    // Bottom Composite Key icon states from images/时间:温度icon/
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      const compImg = compBtn.querySelector('img');
      if (isOff) {
        compBtn.style.opacity = '0.05';
        compBtn.style.pointerEvents = 'none';
        if (compImg) compImg.src = 'images/时间:温度icon/状态=全灭.svg';
      } else if (isRunning) {
        compBtn.style.opacity = '0';
        compBtn.style.pointerEvents = 'none';
      } else {
        compBtn.style.pointerEvents = 'auto';
        const isEditing = (this.editMode === 'temp' || this.editMode === 'time' || this.editMode === 'reservation');
        compBtn.style.opacity = isEditing ? '1' : '0.45';
        if (compImg) {
          const isTempFixed = this.mode === 'dry' || this.babyMode;
          if (isEditing) {
            compImg.src = 'images/时间:温度icon/状态=全亮.svg';
          } else if (isTempFixed) {
            compImg.src = 'images/时间:温度icon/状态=仅时间可调.svg';
          } else {
            compImg.src = 'images/时间:温度icon/状态=半亮.svg';
          }
        }
      }
    }

    // Status icons
    const iconWifi = this.root.querySelector('.s2-icon-wifi');
    const iconAlarm = this.root.querySelector('.s2-icon-alarm');
    const iconIon = this.root.querySelector('.s2-icon-ion');
    const iconF = this.root.querySelector('.s2-icon-f');
    const iconC = this.root.querySelector('.s2-icon-c');
    if (iconWifi) iconWifi.classList.toggle('active', !isOff);
    if (iconAlarm) {
      const showAlarm = this.editMode === 'reservation' || isReserved;
      iconAlarm.classList.toggle('active', showAlarm && !isOff);
    }
    const isOperating = (isRunning || isPaused);
    if (iconIon) iconIon.classList.toggle('active', isOperating && !isOff);
    if (iconF) iconF.classList.toggle('active', !isOff && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', !isOff && this.unit === 'C');

    this.renderTimeDigits();
    this.renderTempDigits();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 2,
        power: this.power,
        mode: this.mode,
        editMode: this.editMode,
        temp: this.currentTemp,
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit
      });
    }
  }

  renderTimeDigits() {
    const timeContainer = this.root.querySelector('.s23-time-digits');
    if (!timeContainer) return;
    const isPaused = this.power === 'paused';
    const isEditing = (this.editMode === 'time' || this.editMode === 'reservation');
    timeContainer.classList.toggle('blinking', isEditing && !isPaused);
    timeContainer.classList.toggle('pause-blink', isPaused);

    let str;
    if (this.power === 'running' || this.power === 'paused') {
      str = formatCountdown(this.remainingSec);
    } else if (this.power === 'reserved') {
      str = formatCountdown(this.remainingSec);
    } else if (this.editMode === 'reservation') {
      str = this.currentReserveStr;
    } else {
      str = this.currentTimeStr;
    }
    const [h, m] = str.split(':');

    timeContainer.innerHTML = `
      <img class="seg-digit-w16" src="${getDigitSvg(h[0])}" alt="${h[0]}">
      <img class="seg-digit-w16" src="${getDigitSvg(h[1])}" alt="${h[1]}">
      <img class="seg-colon" src="images/colon.svg" alt=":">
      <img class="seg-digit-w16" src="${getDigitSvg(m[0])}" alt="${m[0]}">
      <img class="seg-digit-w16" src="${getDigitSvg(m[1])}" alt="${m[1]}">
    `;
  }

  renderTempDigits() {
    const tempContainer = this.root.querySelector('.s2-temp-digits');
    if (!tempContainer) return;
    tempContainer.classList.toggle('blinking', this.editMode === 'temp');

    const tempNum = String(this.currentTemp);
    let d1 = ' ', d2 = ' ', d3 = ' ';
    if (tempNum.length === 3) {
      d1 = tempNum[0];
      d2 = tempNum[1];
      d3 = tempNum[2];
    } else if (tempNum.length === 2) {
      d1 = ' ';
      d2 = tempNum[0];
      d3 = tempNum[1];
    }

    tempContainer.innerHTML = `
      <img class="seg-digit-w16" src="${getDigitSvg(d1)}" alt="${d1}">
      <img class="seg-digit-w16" src="${getDigitSvg(d2)}" alt="${d2}">
      <img class="seg-digit-w16" src="${getDigitSvg(d3)}" alt="${d3}">
    `;
  }
}

// ==========================================
// 5. Scheme 3 Controller
// Dual Screen, Independent Temp & Time Buttons, Embedded Baby Pill, Standalone Bottom Power
// ==========================================
class Scheme3Controller {
  constructor(rootEl, onStateChange) {
    this.root = rootEl;
    this.onStateChange = onStateChange;

    this.power = 'standby';
    this.mode = 'heat';
    this.editMode = 'none'; // 'none', 'time', 'temp'
    this.babyMode = false;
    this.unit = 'F';
    this.tempIndex = 1;
    this.heatTimeIndex = 2; // 00:40
    this.dryTimeIndex = 0; // 01:00
    this.reserveIndex = 3; // 02:00
    this.savedPreBabyTempIndex = 1;

    this.remainingSec = 40 * 60;
    this.countdownTimer = null;
    this.inactivityTimer = null;
    this.lastTouchTime = 0;

    this.timePressTimer = null;
    this.timePressStartTime = 0;
    this.timeLongPressed = false;

    this.bindEvents();
    this.render();
  }

  get currentTemp() {
    if (this.babyMode) {
      if (this.mode === 'dry') {
        return this.unit === 'F' ? BABY_DRY_TEMP_F : BABY_DRY_TEMP_C;
      }
      return this.unit === 'F' ? BABY_TEMP_F : BABY_TEMP_C;
    }
    if (this.mode === 'dry') {
      return this.unit === 'F' ? DRY_TEMP_F : DRY_TEMP_C;
    }
    const list = this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C;
    return list[this.tempIndex];
  }

  get currentTimeStr() {
    return this.mode === 'heat' 
      ? HEAT_TIME_PRESETS[this.heatTimeIndex] 
      : DRY_TIME_PRESETS[this.dryTimeIndex];
  }

  get currentReserveStr() {
    return RESERVATION_PRESETS[this.reserveIndex];
  }

  bindEvents() {
    // Standalone Power Button at bottom
    const powerBtn = this.root.querySelector('.s3-power-btn');
    if (powerBtn) {
      powerBtn.addEventListener('mousedown', (e) => this.handlePowerPressStart(e));
      powerBtn.addEventListener('touchstart', (e) => this.handlePowerPressStart(e), { passive: true });
      powerBtn.addEventListener('mouseup', (e) => this.handlePowerPressEnd(e));
      powerBtn.addEventListener('mouseleave', () => {
        clearTimeout(this.powerPressTimer);
        this.powerPressStartTime = 0;
      });
      powerBtn.addEventListener('touchend', (e) => this.handlePowerPressEnd(e));
    }

    // Heat Pill Section
    const heatSection = this.root.querySelector('.pill-heat');
    if (heatSection) {
      heatSection.addEventListener('click', () => this.setMode('heat'));
    }

    // Dry Pill Section
    const drySection = this.root.querySelector('.pill-dry');
    if (drySection) {
      drySection.addEventListener('click', () => this.setMode('dry'));
    }

    // Baby Center Icon in Pill
    const babyCenter = this.root.querySelector('.pill-baby-center');
    if (babyCenter) {
      babyCenter.addEventListener('click', () => this.toggleBabyMode());
    }

    // Independent Time Button (left) (Short click: time edit; Long press 2s: Reservation)
    const timeBtn = this.root.querySelector('.s3-time-btn');
    if (timeBtn) {
      const startTime = (e) => this.handleTimePressStart(e);
      const endTime = (e) => this.handleTimePressEnd(e);
      const cancelTime = () => this.handleTimePressCancel();
      timeBtn.addEventListener('mousedown', startTime);
      timeBtn.addEventListener('touchstart', startTime, { passive: true });
      timeBtn.addEventListener('mouseup', endTime);
      timeBtn.addEventListener('mouseleave', cancelTime);
      timeBtn.addEventListener('touchend', endTime);
      timeBtn.addEventListener('touchcancel', cancelTime);
    }

    // Independent Temp Button (right)
    const tempBtn = this.root.querySelector('.s3-temp-btn');
    if (tempBtn) {
      tempBtn.addEventListener('click', () => this.toggleTempEdit());
    }

    // Left [-] Button
    const leftBtn = this.root.querySelector('.s3-adjust-left');
    if (leftBtn) {
      leftBtn.addEventListener('click', () => this.adjustParam(-1));
    }

    // Right [+] Button
    const rightBtn = this.root.querySelector('.s3-adjust-right');
    if (rightBtn) {
      rightBtn.addEventListener('click', () => this.adjustParam(1));
    }

    // Unit toggle on °F / °C click
    const unitF = this.root.querySelector('.s3-icon-f');
    const unitC = this.root.querySelector('.s3-icon-c');
    if (unitF) unitF.addEventListener('click', () => this.toggleUnit());
    if (unitC) unitC.addEventListener('click', () => this.toggleUnit());
  }

  isSyntheticMouseEvent(e) {
    if (!e) return false;
    if (e.type && e.type.startsWith('touch')) {
      this.lastTouchTime = Date.now();
      return false;
    }
    if (e.type && e.type.startsWith('mouse')) {
      if (Date.now() - this.lastTouchTime < 700) {
        return true;
      }
    }
    return false;
  }

  handlePowerPressStart(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    this.powerPressStartTime = Date.now();
    this.powerLongPressed = false;
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.toggleOnOff();
    }, 1200);
  }

  handlePowerPressEnd(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e && e.cancelable && e.type && e.type.startsWith('touch')) {
      e.preventDefault();
    }
    clearTimeout(this.powerPressTimer);
    if (!this.powerLongPressed && this.powerPressStartTime && Date.now() - this.powerPressStartTime < 1200) {
      this.toggleStartPause();
    }
    this.powerPressStartTime = 0;
  }

  toggleOnOff() {
    if (this.power === 'off') {
      this.power = 'standby';
      sound.playPower(true);
      this.resetInactivityTimer();
    } else {
      this.power = 'off';
      sound.playPower(false);
      this.stopRunning();
      this.editMode = 'none';
    }
    this.render();
  }

  toggleStartPause() {
    if (this.power === 'off') {
      this.toggleOnOff();
      return;
    }
    sound.playClick();
    if (this.editMode === 'reservation') {
      this.confirmReservation();
      return;
    }
    if (this.power === 'reserved') {
      this.startRunning();
      return;
    }
    if (this.power === 'standby') {
      this.startRunning();
    } else if (this.power === 'running') {
      this.pauseRunning();
    } else if (this.power === 'paused') {
      this.resumeRunning();
    }
    this.render();
  }

  startRunning() {
    this.power = 'running';
    this.editMode = 'none';
    this.remainingSec = timeStrToMinutes(this.currentTimeStr) * 60;
    this.startCountdown();
    this.render();
  }

  resumeRunning() {
    this.power = 'running';
    this.startCountdown();
    this.render();
  }

  pauseRunning() {
    this.power = 'paused';
    clearInterval(this.countdownTimer);
    this.render();
  }

  stopRunning() {
    clearInterval(this.countdownTimer);
  }

  startCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'running' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderTimeDigits();
        if (this.remainingSec <= 0) {
          this.power = 'standby';
          sound.playAlert();
          this.stopRunning();
          this.render();
        }
      }
    }, 1000);
  }

  // ==================== RESERVATION LOGIC ====================
  handleTimePressStart(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (this.power === 'off') return;
    this.timePressStartTime = Date.now();
    this.timeLongPressed = false;
    clearTimeout(this.timePressTimer);

    // Long press 2s triggers reservation setup or cancels reservation
    this.timePressTimer = setTimeout(() => {
      this.timeLongPressed = true;
      this.toggleReservation();
    }, 2000);
  }

  handleTimePressCancel() {
    clearTimeout(this.timePressTimer);
    this.timePressStartTime = 0;
  }

  handleTimePressEnd(e) {
    if (this.isSyntheticMouseEvent(e)) return;
    if (e && e.cancelable && e.type && e.type.startsWith('touch')) {
      e.preventDefault();
    }
    clearTimeout(this.timePressTimer);
    if (this.timeLongPressed) {
      this.timePressStartTime = 0;
      return;
    }

    if (this.timePressStartTime && Date.now() - this.timePressStartTime < 2000) {
      this.timePressStartTime = 0;
      // In reservation setup or reserved countdown, short click does nothing!
      if (this.editMode === 'reservation' || this.power === 'reserved') return;
      this.toggleTimeEdit();
    }
    this.timePressStartTime = 0;
  }

  toggleReservation() {
    sound.playClick();
    if (this.power === 'reserved' || this.editMode === 'reservation') {
      this.cancelReservation();
      return;
    }

    if (this.power === 'standby') {
      this.power = 'standby';
      this.editMode = 'reservation';
      this.reserveIndex = 3; // Default 02:00
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        this.cancelReservation();
      }, 60000);
      this.render();
    }
  }

  cancelReservation() {
    this.power = 'standby';
    this.editMode = 'none';
    clearInterval(this.countdownTimer);
    clearTimeout(this.inactivityTimer);
    this.render();
  }

  confirmReservation() {
    sound.playClick();
    this.power = 'reserved';
    this.editMode = 'none';
    clearTimeout(this.inactivityTimer);
    this.remainingSec = timeStrToMinutes(this.currentReserveStr) * 60;
    this.startReserveCountdown();
    this.render();
  }

  startReserveCountdown() {
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.power === 'reserved' && this.remainingSec > 0) {
        this.remainingSec--;
        this.renderTimeDigits();
        if (this.remainingSec <= 0) {
          sound.playAlert();
          this.startRunning();
        }
      }
    }, 1000);
  }

  toggleTimeEdit() {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playClick();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.editMode = this.editMode === 'time' ? 'none' : 'time';
    this.resetInactivityTimer();
    this.render();
  }

  toggleTempEdit() {
    if (this.power === 'off' || this.babyMode || this.mode === 'dry') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playClick();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.editMode = this.editMode === 'temp' ? 'none' : 'temp';
    this.resetInactivityTimer();
    this.render();
  }

  setMode(mode) {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    if (this.mode === mode && this.power !== 'paused') return;
    sound.playMode();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.mode = mode;
    this.editMode = 'none';
    this.babyMode = false;
    this.resetInactivityTimer();
    this.render();
  }

  toggleBabyMode() {
    if (this.power === 'off') return;
    if (this.editMode === 'reservation' || this.power === 'reserved') return;
    sound.playClick();
    if (this.power === 'paused') {
      this.power = 'standby';
      this.stopRunning();
    }
    this.babyMode = !this.babyMode;
    if (this.babyMode) {
      this.savedPreBabyTempIndex = this.tempIndex;
      this.editMode = 'none';
    } else {
      this.tempIndex = this.savedPreBabyTempIndex;
    }
    this.resetInactivityTimer();
    this.render();
  }

  toggleUnit() {
    if (this.power === 'off') return;
    sound.playClick();
    this.unit = this.unit === 'F' ? 'C' : 'F';
    this.render();
  }

  adjustParam(delta) {
    if (this.power === 'off' || this.power === 'running' || this.power === 'paused' || this.power === 'reserved') return;
    if (this.editMode === 'none') return;
    sound.playClick();
    this.resetInactivityTimer();

    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      const next = this.reserveIndex + delta;
      if (next >= 0 && next <= max) {
        this.reserveIndex = next;
      }
      this.render();
      return;
    }

    if (this.editMode === 'temp') {
      if (this.babyMode || this.mode === 'dry') return;
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      const next = this.tempIndex + delta;
      if (next >= 0 && next <= max) {
        this.tempIndex = next;
      }
    } else if (this.editMode === 'time') {
      if (this.mode === 'heat') {
        const max = HEAT_TIME_PRESETS.length - 1;
        const next = this.heatTimeIndex + delta;
        if (next >= 0 && next <= max) {
          this.heatTimeIndex = next;
        }
      } else {
        const max = DRY_TIME_PRESETS.length - 1;
        const next = this.dryTimeIndex + delta;
        if (next >= 0 && next <= max) {
          this.dryTimeIndex = next;
        }
      }
    }
    this.render();
  }

  renderAdjustButtons(leftBtn, rightBtn, isOff, isRunning) {
    if (!leftBtn || !rightBtn) return;

    const hide = (btn) => {
      btn.classList.remove('active');
      btn.classList.add('disabled');
      btn.style.setProperty('opacity', '0', 'important');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
    };

    const show = (btn) => {
      btn.classList.remove('disabled');
      btn.classList.add('active');
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
    };

    if (isOff || isRunning || this.power === 'reserved' || this.power === 'paused' || this.editMode === 'none') {
      hide(leftBtn);
      hide(rightBtn);
      return;
    }

    if (this.editMode === 'reservation') {
      const max = RESERVATION_PRESETS.length - 1;
      if (this.reserveIndex <= 0) hide(leftBtn);
      else show(leftBtn);

      if (this.reserveIndex >= max) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    if (this.editMode === 'temp') {
      // Fixed temp in dry mode or baby mode: cannot be adjusted at all!
      if (this.mode === 'dry' || this.babyMode) {
        hide(leftBtn);
        hide(rightBtn);
        return;
      }
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
      if (this.tempIndex <= 0) hide(leftBtn);
      else show(leftBtn);

      if (this.tempIndex >= max) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    if (this.editMode === 'time') {
      let atMin = false;
      let atMax = false;
      if (this.mode === 'heat') {
        atMin = this.heatTimeIndex <= 0;
        atMax = this.heatTimeIndex >= HEAT_TIME_PRESETS.length - 1;
      } else {
        atMin = this.dryTimeIndex <= 0;
        atMax = this.dryTimeIndex >= DRY_TIME_PRESETS.length - 1;
      }

      if (atMin) hide(leftBtn);
      else show(leftBtn);

      if (atMax) hide(rightBtn);
      else show(rightBtn);
      return;
    }

    hide(leftBtn);
    hide(rightBtn);
  }

  resetInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.editMode !== 'none') {
        this.editMode = 'none';
        this.render();
      }
    }, 5000);
  }

  render() {
    const isOff = this.power === 'off';
    const isRunning = this.power === 'running';
    const isPaused = this.power === 'paused';
    const isReserved = this.power === 'reserved';
    const isReservedOrSetting = (this.editMode === 'reservation' || isReserved);

    this.root.classList.toggle('device-off', isOff);
    this.root.classList.toggle('running', isRunning);
    this.root.classList.toggle('paused', isPaused);

    // Pill sections
    const heatEl = this.root.querySelector('.pill-heat');
    const dryEl = this.root.querySelector('.pill-dry');
    const babyCenter = this.root.querySelector('.pill-baby-center');
    if (heatEl) {
      if (isOff) {
        heatEl.style.opacity = '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0';
        heatEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'none';
      } else {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.25';
        heatEl.style.pointerEvents = 'auto';
      }
      heatEl.classList.toggle('active', this.mode === 'heat' && !isOff);
      heatEl.classList.toggle('baby-mode', this.mode === 'heat' && this.babyMode && !isOff);
    }
    if (dryEl) {
      if (isOff) {
        dryEl.style.opacity = '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isRunning) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0';
        dryEl.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'none';
      } else {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.25';
        dryEl.style.pointerEvents = 'auto';
      }
      dryEl.classList.toggle('active', this.mode === 'dry' && !isOff);
      dryEl.classList.toggle('baby-mode', this.mode === 'dry' && this.babyMode && !isOff);
    }
    if (babyCenter) {
      if (isOff) {
        babyCenter.style.opacity = '0.05';
        babyCenter.style.pointerEvents = 'none';
      } else if (isRunning) {
        if (this.babyMode) {
          babyCenter.style.opacity = '1';
          babyCenter.style.pointerEvents = 'none';
        } else {
          babyCenter.style.opacity = '0';
          babyCenter.style.pointerEvents = 'none';
        }
      } else if (isReservedOrSetting) {
        babyCenter.style.pointerEvents = 'none';
        babyCenter.style.opacity = '0.25';
      } else {
        babyCenter.style.pointerEvents = 'auto';
        babyCenter.style.opacity = this.babyMode ? '1' : '0.25';
      }
      const isBabyActive = this.babyMode && !isOff;
      babyCenter.classList.toggle('baby-active', isBabyActive);
      const babyImg = babyCenter.querySelector('img');
      if (babyImg) {
        babyImg.src = isBabyActive ? 'images/宝宝模式_绿.svg' : 'images/宝宝模式.svg';
      }
    }

    // Independent buttons
    const timeBtn = this.root.querySelector('.s3-time-btn');
    const tempBtn = this.root.querySelector('.s3-temp-btn');
    if (timeBtn) {
      if (isOff) {
        timeBtn.style.opacity = '0.05';
        timeBtn.style.pointerEvents = 'none';
      } else if (isRunning) {
        timeBtn.style.opacity = '0';
        timeBtn.style.pointerEvents = 'none';
      } else {
        const isEditingTime = (this.editMode === 'time' || this.editMode === 'reservation');
        timeBtn.style.opacity = isEditingTime ? '1' : '0.45';
        timeBtn.style.pointerEvents = 'auto';
      }
      timeBtn.classList.toggle('active', this.editMode === 'time' || this.editMode === 'reservation');
    }
    if (tempBtn) {
      const isTempFixed = this.mode === 'dry' || this.babyMode;
      if (isOff) {
        tempBtn.style.opacity = '0.05';
        tempBtn.style.pointerEvents = 'none';
      } else if (isRunning || isTempFixed) {
        tempBtn.style.opacity = '0';
        tempBtn.style.pointerEvents = 'none';
      } else if (isReservedOrSetting) {
        tempBtn.style.opacity = '0.25';
        tempBtn.style.pointerEvents = 'none';
      } else {
        tempBtn.style.opacity = this.editMode === 'temp' ? '1' : '0.45';
        tempBtn.style.pointerEvents = 'auto';
      }
      tempBtn.classList.toggle('active', this.editMode === 'temp' && !isTempFixed && !isReservedOrSetting);
    }

    // Standalone power button
    const powerBtn = this.root.querySelector('.s3-power-btn');
    if (powerBtn) {
      if (isOff) {
        powerBtn.style.opacity = '0.5';
        powerBtn.classList.remove('active', 'pause-blink');
      } else if (isPaused) {
        powerBtn.style.opacity = '1';
        powerBtn.classList.add('pause-blink');
      } else {
        powerBtn.style.opacity = '1';
        powerBtn.classList.remove('pause-blink');
        powerBtn.classList.add('active');
      }
    }

    // Adjust buttons
    const leftBtn = this.root.querySelector('.s3-adjust-left');
    const rightBtn = this.root.querySelector('.s3-adjust-right');
    this.renderAdjustButtons(leftBtn, rightBtn, isOff, isRunning);

    // Status icons
    const iconWifi = this.root.querySelector('.s3-icon-wifi');
    const iconAlarm = this.root.querySelector('.s3-icon-alarm');
    const iconIon = this.root.querySelector('.s3-icon-ion');
    const iconF = this.root.querySelector('.s3-icon-f');
    const iconC = this.root.querySelector('.s3-icon-c');
    if (iconWifi) iconWifi.classList.toggle('active', !isOff);
    if (iconAlarm) {
      const showAlarm = this.editMode === 'reservation' || isReserved;
      iconAlarm.classList.toggle('active', showAlarm && !isOff);
    }
    const isOperating = (isRunning || isPaused);
    if (iconIon) iconIon.classList.toggle('active', isOperating && !isOff);
    if (iconF) iconF.classList.toggle('active', !isOff && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', !isOff && this.unit === 'C');

    this.renderTimeDigits();
    this.renderTempDigits();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 3,
        power: this.power,
        mode: this.mode,
        editMode: this.editMode,
        temp: this.currentTemp,
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit
      });
    }
  }

  renderTimeDigits() {
    const timeContainer = this.root.querySelector('.s3-time-digits');
    if (!timeContainer) return;
    const isPaused = this.power === 'paused';
    const isEditing = (this.editMode === 'time' || this.editMode === 'reservation');
    timeContainer.classList.toggle('blinking', isEditing && !isPaused);
    timeContainer.classList.toggle('pause-blink', isPaused);

    let str;
    if (this.power === 'running' || this.power === 'paused') {
      str = formatCountdown(this.remainingSec);
    } else if (this.power === 'reserved') {
      str = formatCountdown(this.remainingSec);
    } else if (this.editMode === 'reservation') {
      str = this.currentReserveStr;
    } else {
      str = this.currentTimeStr;
    }
    const [h, m] = str.split(':');

    timeContainer.innerHTML = `
      <img class="seg-digit-w16" src="${getDigitSvg(h[0])}" alt="${h[0]}">
      <img class="seg-digit-w16" src="${getDigitSvg(h[1])}" alt="${h[1]}">
      <img class="seg-colon" src="images/colon.svg" alt=":">
      <img class="seg-digit-w16" src="${getDigitSvg(m[0])}" alt="${m[0]}">
      <img class="seg-digit-w16" src="${getDigitSvg(m[1])}" alt="${m[1]}">
    `;
  }

  renderTempDigits() {
    const tempContainer = this.root.querySelector('.s3-temp-digits');
    if (!tempContainer) return;
    tempContainer.classList.toggle('blinking', this.editMode === 'temp');

    const tempNum = String(this.currentTemp);
    let d1 = ' ', d2 = ' ', d3 = ' ';
    if (tempNum.length === 3) {
      d1 = tempNum[0];
      d2 = tempNum[1];
      d3 = tempNum[2];
    } else if (tempNum.length === 2) {
      d1 = ' ';
      d2 = tempNum[0];
      d3 = tempNum[1];
    }

    tempContainer.innerHTML = `
      <img class="seg-digit-w16" src="${getDigitSvg(d1)}" alt="${d1}">
      <img class="seg-digit-w16" src="${getDigitSvg(d2)}" alt="${d2}">
      <img class="seg-digit-w16" src="${getDigitSvg(d3)}" alt="${d3}">
    `;
  }
}

// Export globals
window.SoundEngine = sound;
window.Scheme1Controller = Scheme1Controller;
window.Scheme2Controller = Scheme2Controller;
window.Scheme3Controller = Scheme3Controller;
