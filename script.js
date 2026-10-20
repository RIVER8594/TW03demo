/**
 * Momcozy TW03 Towel Warmer Interactive Demos - Engine
 * Pure Vanilla ES6 Engine supporting Scheme 1, 2, and 3
 */

// ==========================================
// 1. Audio Synthesizer (Realistic Appliance Sound)
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBeep(freq = 1400, duration = 0.035, type = 'sine', gainVal = 0.15) {
    if (this.muted) return;
    try {
      this.init();
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
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  playClick() {
    this.playBeep(1600, 0.025, 'sine', 0.12);
  }

  playPower(on = true) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      if (on) {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
      } else {
        osc.frequency.setValueAtTime(1760, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
      }
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  playMode() {
    this.playBeep(1200, 0.04, 'sine', 0.15);
  }

  playAlert() {
    this.playBeep(2200, 0.08, 'square', 0.15);
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
    this.reserveIndex = 1; // Reservation: '01:00'

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
      const endM = () => this.handleAdjustUp();
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
      const endP = () => this.handleAdjustUp();
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

  // ==================== POWER & START / PAUSE LOGIC ====================
  handlePowerDown(e) {
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
    if (e) e.stopPropagation();
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
    if (this.power === 'standby') {
      // Start Running
      this.startRunning();
    } else if (this.power === 'running') {
      // Pause
      this.pauseRunning();
    } else if (this.power === 'paused') {
      // Resume Running
      this.resumeRunning();
    } else if (this.power === 'standby' && this.editMode === 'reservation') {
      // Confirm Reservation
      this.confirmReservation();
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
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
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
    if (e) e.stopPropagation();
    clearTimeout(this.heatPressTimer);
    if (this.heatLongPressed) {
      this.heatPressStart = 0;
      return;
    }
    if (this.heatPressStart && Date.now() - this.heatPressStart < 2000) {
      this.heatPressStart = 0;
      this.selectMode('heat');
    }
    this.heatPressStart = 0;
  }

  selectMode(newMode) {
    if (this.power === 'off') return;
    sound.playMode();

    if (this.power === 'paused') {
      // Per spec: changing mode during pause immediately returns to standby!
      this.power = 'standby';
      this.stopRunning();
      this.startStandbyCarousel();
    }

    this.mode = newMode;
    if (newMode === 'dry') {
      this.babyMode = false;
    }

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
    if (e) e.stopPropagation();
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
    } else if (this.editMode === 'reservation') {
      // Already in reservation, click cycle
      this.editMode = 'time';
      this.render();
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
      this.power = 'standby';
      this.exitEditMode();
      return;
    }

    // Enter reservation editing
    this.power = 'standby';
    this.editMode = 'reservation';
    this.stopStandbyCarousel();

    // 1-minute auto-cancel if start not pressed
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      this.exitEditMode();
    }, 60000);

    this.render();
  }

  confirmReservation() {
    sound.playClick();
    this.power = 'reserved';
    this.editMode = 'none';
    clearTimeout(this.inactivityTimer);
    this.stopStandbyCarousel();
    this.render();
  }

  // ==================== BABY MODE & CHILD LOCK ====================
  handleBabyDown(e) {
    if (e) e.stopPropagation();
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
    if (e) e.stopPropagation();
    clearTimeout(this.babyPressTimer);
    if (this.babyLongPressed) {
      this.babyPressStart = 0;
      return;
    }

    if (this.babyPressStart && Date.now() - this.babyPressStart < 2000) {
      this.babyPressStart = 0;
      if (this.interceptLockedOrLowPower()) return;
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
    if (this.babyMode) {
      this.mode = 'heat';
    }

    if (this.power === 'standby') {
      this.exitEditMode();
    }
    this.render();
  }

  // ==================== PARAMETER ADJUSTMENT (+ / -) ====================
  handleAdjustDown(e, delta) {
    if (e) e.stopPropagation();
    if (this.interceptLockedOrLowPower()) return;
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

  handleAdjustUp() {
    clearTimeout(this.adjustHoldTimer);
    clearInterval(this.adjustStepInterval);
  }

  adjustValue(delta) {
    sound.playClick();
    this.resetEditInactivityTimer();

    // In reservation mode
    if (this.editMode === 'reservation') {
      const len = RESERVATION_PRESETS.length;
      this.reserveIndex = (this.reserveIndex + delta + len) % len;
      this.render();
      return;
    }

    // If in standby and not editing, start editing current display
    if (this.editMode === 'none') {
      this.editMode = this.standbyParam;
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

    if (heatEl) {
      if (isOff) {
        heatEl.style.opacity = '0';
      } else if (isRunning) {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.05';
      } else {
        heatEl.style.opacity = this.mode === 'heat' ? '1' : '0.45';
      }
      heatEl.classList.toggle('active', this.mode === 'heat' && !isOff);
    }

    if (dryEl) {
      if (isOff) {
        dryEl.style.opacity = '0';
      } else if (isRunning) {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.05';
      } else {
        dryEl.style.opacity = this.mode === 'dry' ? '1' : '0.45';
      }
      dryEl.classList.toggle('active', this.mode === 'dry' && !isOff);
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
      if (isOff || isRunning) {
        compBtn.style.opacity = '0.05';
        compBtn.style.pointerEvents = 'none';
        compBtn.style.filter = 'none';
        compBtn.classList.remove('editing-glow');
        if (compImg) compImg.src = 'images/时间:温度icon/状态=全灭.svg';
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
      if (isOff || isRunning) {
        babyBtn.style.opacity = '0.05';
        babyBtn.style.pointerEvents = 'none';
      } else {
        babyBtn.style.pointerEvents = 'auto';
        babyBtn.style.opacity = this.babyMode ? '1' : '0.45';
      }
      babyBtn.classList.toggle('baby-active', this.babyMode && !isOff);
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
    if (isOff || isRunning || this.power === 'reserved') {
      minusBtn.classList.add('disabled');
      plusBtn.classList.add('disabled');
      return;
    }

    // In reservation edit
    if (this.editMode === 'reservation') {
      minusBtn.classList.remove('disabled');
      plusBtn.classList.remove('disabled');
      minusBtn.classList.add('active');
      plusBtn.classList.add('active');
      minusBtn.style.opacity = '';
      plusBtn.style.opacity = '';
      minusBtn.style.pointerEvents = '';
      plusBtn.style.pointerEvents = '';
      return;
    }

    // If editing temp
    if (this.editMode === 'temp') {
      minusBtn.classList.add('active');
      plusBtn.classList.add('active');
      minusBtn.style.opacity = '';
      plusBtn.style.opacity = '';
      minusBtn.style.pointerEvents = '';
      plusBtn.style.pointerEvents = '';
      if (this.mode === 'dry' || this.babyMode) {
        minusBtn.classList.add('disabled');
        plusBtn.classList.add('disabled');
      } else {
        const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length - 1;
        minusBtn.classList.toggle('disabled', this.tempIndex === 0);
        plusBtn.classList.toggle('disabled', this.tempIndex === max);
      }
      return;
    }

    // If editing time
    if (this.editMode === 'time') {
      minusBtn.classList.add('active');
      plusBtn.classList.add('active');
      minusBtn.style.opacity = '';
      plusBtn.style.opacity = '';
      minusBtn.style.pointerEvents = '';
      plusBtn.style.pointerEvents = '';
      if (this.babyMode) {
        if (this.mode === 'heat') {
          minusBtn.classList.toggle('disabled', this.babyHeatTimeIndex === 0);
          plusBtn.classList.toggle('disabled', this.babyHeatTimeIndex === BABY_HEAT_TIME_PRESETS.length - 1);
        } else {
          minusBtn.classList.toggle('disabled', this.babyDryTimeIndex === 0);
          plusBtn.classList.toggle('disabled', this.babyDryTimeIndex === BABY_DRY_TIME_PRESETS.length - 1);
        }
      } else {
        if (this.mode === 'heat') {
          minusBtn.classList.toggle('disabled', this.heatTimeIndex === 0);
          plusBtn.classList.toggle('disabled', this.heatTimeIndex === HEAT_TIME_PRESETS.length - 1);
        } else {
          minusBtn.classList.toggle('disabled', this.dryTimeIndex === 0);
          plusBtn.classList.toggle('disabled', this.dryTimeIndex === DRY_TIME_PRESETS.length - 1);
        }
      }
      return;
    }

    // In normal standby (non-editing), buttons should be off
    minusBtn.classList.remove('disabled', 'active');
    plusBtn.classList.remove('disabled', 'active');
    minusBtn.style.opacity = '0';
    plusBtn.style.opacity = '0';
    minusBtn.style.pointerEvents = 'none';
    plusBtn.style.pointerEvents = 'none';
  }

  renderTabs(isOff, isRunning) {
    const timeTab = this.root.querySelector('.pos-time-tab .tab-label');
    const timeLine = this.root.querySelector('.pos-time-tab .tab-indicator-line');
    const tempTab = this.root.querySelector('.pos-temp-tab .tab-label');
    const tempLine = this.root.querySelector('.pos-temp-tab .tab-indicator-line');

    if (!timeTab || !tempTab) return;

    if (isOff) {
      timeTab.classList.remove('active');
      tempTab.classList.remove('active');
      if (timeLine) timeLine.classList.remove('active');
      if (tempLine) tempLine.classList.remove('active');
      return;
    }

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
    const iconF = this.root.querySelector('.s1-icon-f');
    const iconC = this.root.querySelector('.s1-icon-c');

    if (iconWifi) iconWifi.classList.toggle('active', !isOff);

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

    // Blinking styles
    const shouldBlink = (this.editMode !== 'none') || (this.power === 'paused');
    digitContainer.classList.toggle('blinking', shouldBlink);

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
    else if (this.editMode === 'reservation' || this.power === 'reserved') {
      showColon = true;
      const str = this.currentReserveStr;
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
      ${showColon ? `<img class="seg-colon" src="images/colon.svg" alt=":">` : ''}
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
    this.savedPreBabyTempIndex = 1;

    this.remainingSec = 40 * 60;
    this.countdownTimer = null;
    this.inactivityTimer = null;

    this.bindEvents();
    this.render();
  }

  get currentTemp() {
    if (this.babyMode) {
      return this.unit === 'F' ? BABY_TEMP_F : BABY_TEMP_C;
    }
    const list = this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C;
    return list[this.tempIndex];
  }

  get currentTimeStr() {
    return this.mode === 'heat' 
      ? HEAT_TIME_PRESETS[this.heatTimeIndex] 
      : DRY_TIME_PRESETS[this.dryTimeIndex];
  }

  bindEvents() {
    // Power button in pill center
    const powerBtn = this.root.querySelector('.pill-power-center');
    if (powerBtn) {
      powerBtn.addEventListener('mousedown', () => this.handlePowerPressStart());
      powerBtn.addEventListener('touchstart', () => this.handlePowerPressStart(), { passive: true });
      powerBtn.addEventListener('mouseup', () => this.handlePowerPressEnd());
      powerBtn.addEventListener('mouseleave', () => {
        clearTimeout(this.powerPressTimer);
        this.powerPressStartTime = 0;
      });
      powerBtn.addEventListener('touchend', () => this.handlePowerPressEnd());
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

    // Bottom Composite Key
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      compBtn.addEventListener('click', () => this.cycleCompositeKey());
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

  handlePowerPressStart() {
    this.powerPressStartTime = Date.now();
    this.powerLongPressed = false;
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.toggleOnOff();
    }, 1200);
  }

  handlePowerPressEnd() {
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
    if (this.power === 'standby' || this.power === 'paused') {
      this.startRunning();
    } else if (this.power === 'running') {
      this.pauseRunning();
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

  cycleCompositeKey() {
    if (this.power === 'off') return;
    sound.playClick();
    this.resetInactivityTimer();

    // User confirmed Q1:
    // In default state: both left and right are [+]
    // Once in edit mode: left changes to [-], right stays [+]
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
    if (type === 'temp' && (this.babyMode || this.mode === 'dry')) return;
    sound.playClick();
    this.editMode = type;
    this.resetInactivityTimer();
    this.render();
  }

  setMode(mode) {
    if (this.power === 'off') return;
    if (this.mode === mode) return;
    sound.playMode();
    this.mode = mode;
    this.editMode = 'none';
    if (mode === 'dry') {
      this.babyMode = false;
    }
    this.resetInactivityTimer();
    this.render();
  }

  toggleBabyMode() {
    if (this.power === 'off') return;
    sound.playClick();
    this.babyMode = !this.babyMode;
    if (this.babyMode) {
      this.savedPreBabyTempIndex = this.tempIndex;
      this.mode = 'heat';
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
    if (this.power === 'off') return;
    if (this.editMode === 'none') {
      this.editMode = 'time';
    }
    this.adjustParam(-1);
  }

  adjustParam(delta) {
    if (this.power === 'off') return;
    sound.playClick();
    this.resetInactivityTimer();

    if (this.editMode === 'none') {
      this.editMode = 'time';
    }

    if (this.editMode === 'temp') {
      if (this.babyMode) return;
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length;
      this.tempIndex = (this.tempIndex + delta + max) % max;
    } else if (this.editMode === 'time') {
      if (this.mode === 'heat') {
        const max = HEAT_TIME_PRESETS.length;
        this.heatTimeIndex = (this.heatTimeIndex + delta + max) % max;
      } else {
        const next = this.dryTimeIndex + delta;
        if (next >= 0 && next < DRY_TIME_PRESETS.length) {
          this.dryTimeIndex = next;
        }
      }
    }
    this.render();
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

    this.root.classList.toggle('device-off', isOff);
    this.root.classList.toggle('running', isRunning);
    this.root.classList.toggle('paused', isPaused);

    // Pill sections
    const heatEl = this.root.querySelector('.pill-heat');
    const dryEl = this.root.querySelector('.pill-dry');
    const powerCenter = this.root.querySelector('.pill-power-center');
    if (heatEl) heatEl.classList.toggle('active', this.mode === 'heat');
    if (dryEl) dryEl.classList.toggle('active', this.mode === 'dry');
    if (powerCenter) powerCenter.classList.toggle('active', isRunning || this.power === 'standby');

    // Baby Mode Button
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) babyBtn.classList.toggle('baby-active', this.babyMode);

    // Left Button: [-] per Figma specification
    const leftBtnImg = this.root.querySelector('.btn-adjust-left img');
    if (leftBtnImg) {
      leftBtnImg.src = 'images/减号.svg';
      leftBtnImg.alt = '-';
    }

    // Bottom Composite Key icon states from images/时间:温度icon/
    const compImg = this.root.querySelector('.btn-composite-key img');
    if (compImg) {
      if (isOff) {
        compImg.src = 'images/时间:温度icon/状态=全灭.svg';
      } else if (this.editMode === 'time') {
        compImg.src = 'images/时间:温度icon/状态=仅时间可调.svg';
      } else if (this.editMode === 'temp') {
        compImg.src = 'images/时间:温度icon/状态=全亮.svg';
      } else {
        compImg.src = 'images/时间:温度icon/状态=半亮.svg';
      }
    }

    // Status icons
    const iconWifi = this.root.querySelector('.s2-icon-wifi');
    const iconF = this.root.querySelector('.s2-icon-f');
    const iconC = this.root.querySelector('.s2-icon-c');
    if (iconWifi) iconWifi.classList.add('active');
    if (iconF) iconF.classList.toggle('active', this.mode === 'heat' && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', this.mode === 'heat' && this.unit === 'C');

    this.renderTimeDigits();
    this.renderTempDigits();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 2,
        power: this.power,
        mode: this.mode,
        editMode: this.editMode,
        temp: this.mode === 'heat' ? this.currentTemp : '--',
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit
      });
    }
  }

  renderTimeDigits() {
    const timeContainer = this.root.querySelector('.s23-time-digits');
    if (!timeContainer) return;
    timeContainer.classList.toggle('blinking', this.editMode === 'time');

    const str = this.power === 'running' 
      ? formatCountdown(this.remainingSec) 
      : this.currentTimeStr;
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

    if (this.mode === 'dry') {
      tempContainer.innerHTML = `
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
      `;
      return;
    }

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
    this.savedPreBabyTempIndex = 1;

    this.remainingSec = 40 * 60;
    this.countdownTimer = null;
    this.inactivityTimer = null;

    this.bindEvents();
    this.render();
  }

  get currentTemp() {
    if (this.babyMode) {
      return this.unit === 'F' ? BABY_TEMP_F : BABY_TEMP_C;
    }
    const list = this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C;
    return list[this.tempIndex];
  }

  get currentTimeStr() {
    return this.mode === 'heat' 
      ? HEAT_TIME_PRESETS[this.heatTimeIndex] 
      : DRY_TIME_PRESETS[this.dryTimeIndex];
  }

  bindEvents() {
    // Standalone Power Button at bottom
    const powerBtn = this.root.querySelector('.s3-power-btn');
    if (powerBtn) {
      powerBtn.addEventListener('mousedown', () => this.handlePowerPressStart());
      powerBtn.addEventListener('touchstart', () => this.handlePowerPressStart(), { passive: true });
      powerBtn.addEventListener('mouseup', () => this.handlePowerPressEnd());
      powerBtn.addEventListener('mouseleave', () => {
        clearTimeout(this.powerPressTimer);
        this.powerPressStartTime = 0;
      });
      powerBtn.addEventListener('touchend', () => this.handlePowerPressEnd());
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

    // Independent Time Button (left)
    const timeBtn = this.root.querySelector('.s3-time-btn');
    if (timeBtn) {
      timeBtn.addEventListener('click', () => this.toggleTimeEdit());
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

  handlePowerPressStart() {
    this.powerPressStartTime = Date.now();
    this.powerLongPressed = false;
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.toggleOnOff();
    }, 1200);
  }

  handlePowerPressEnd() {
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
    if (this.power === 'standby' || this.power === 'paused') {
      this.startRunning();
    } else if (this.power === 'running') {
      this.pauseRunning();
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

  toggleTimeEdit() {
    if (this.power === 'off') return;
    sound.playClick();
    this.editMode = this.editMode === 'time' ? 'none' : 'time';
    this.resetInactivityTimer();
    this.render();
  }

  toggleTempEdit() {
    if (this.power === 'off' || this.babyMode || this.mode === 'dry') return;
    sound.playClick();
    this.editMode = this.editMode === 'temp' ? 'none' : 'temp';
    this.resetInactivityTimer();
    this.render();
  }

  setMode(mode) {
    if (this.power === 'off') return;
    if (this.mode === mode) return;
    sound.playMode();
    this.mode = mode;
    this.editMode = 'none';
    if (mode === 'dry') {
      this.babyMode = false;
    }
    this.resetInactivityTimer();
    this.render();
  }

  toggleBabyMode() {
    if (this.power === 'off') return;
    sound.playClick();
    this.babyMode = !this.babyMode;
    if (this.babyMode) {
      this.savedPreBabyTempIndex = this.tempIndex;
      this.mode = 'heat';
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
    if (this.power === 'off') return;
    sound.playClick();
    this.resetInactivityTimer();

    if (this.editMode === 'none') {
      this.editMode = 'time';
    }

    if (this.editMode === 'temp') {
      if (this.babyMode) return;
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length;
      this.tempIndex = (this.tempIndex + delta + max) % max;
    } else if (this.editMode === 'time') {
      if (this.mode === 'heat') {
        const max = HEAT_TIME_PRESETS.length;
        this.heatTimeIndex = (this.heatTimeIndex + delta + max) % max;
      } else {
        const next = this.dryTimeIndex + delta;
        if (next >= 0 && next < DRY_TIME_PRESETS.length) {
          this.dryTimeIndex = next;
        }
      }
    }
    this.render();
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

    this.root.classList.toggle('device-off', isOff);
    this.root.classList.toggle('running', isRunning);
    this.root.classList.toggle('paused', isPaused);

    // Pill sections
    const heatEl = this.root.querySelector('.pill-heat');
    const dryEl = this.root.querySelector('.pill-dry');
    const babyCenter = this.root.querySelector('.pill-baby-center');
    if (heatEl) heatEl.classList.toggle('active', this.mode === 'heat');
    if (dryEl) dryEl.classList.toggle('active', this.mode === 'dry');
    if (babyCenter) babyCenter.classList.toggle('baby-active', this.babyMode);

    // Independent buttons
    const timeBtn = this.root.querySelector('.s3-time-btn');
    const tempBtn = this.root.querySelector('.s3-temp-btn');
    if (timeBtn) timeBtn.classList.toggle('active', this.editMode === 'time');
    if (tempBtn) tempBtn.classList.toggle('active', this.editMode === 'temp');

    // Standalone power button
    const powerBtn = this.root.querySelector('.s3-power-btn');
    if (powerBtn) powerBtn.classList.toggle('active', isRunning || this.power === 'standby');

    // Status icons
    const iconWifi = this.root.querySelector('.s3-icon-wifi');
    const iconF = this.root.querySelector('.s3-icon-f');
    const iconC = this.root.querySelector('.s3-icon-c');
    if (iconWifi) iconWifi.classList.add('active');
    if (iconF) iconF.classList.toggle('active', this.mode === 'heat' && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', this.mode === 'heat' && this.unit === 'C');

    this.renderTimeDigits();
    this.renderTempDigits();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 3,
        power: this.power,
        mode: this.mode,
        editMode: this.editMode,
        temp: this.mode === 'heat' ? this.currentTemp : '--',
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit
      });
    }
  }

  renderTimeDigits() {
    const timeContainer = this.root.querySelector('.s23-time-digits');
    if (!timeContainer) return;
    timeContainer.classList.toggle('blinking', this.editMode === 'time');

    const str = this.power === 'running' 
      ? formatCountdown(this.remainingSec) 
      : this.currentTimeStr;
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

    if (this.mode === 'dry') {
      tempContainer.innerHTML = `
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
        <img class="seg-digit-w16" src="${getDigitSvg('-')}" alt="-">
      `;
      return;
    }

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
