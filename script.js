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

const TEMP_PRESETS_F = [120, 140, 160];
const TEMP_PRESETS_C = [50, 60, 70];
const BABY_TEMP_F = 105;
const BABY_TEMP_C = 40;

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

    // State
    this.power = 'standby'; // 'off', 'standby', 'running', 'paused'
    this.mode = 'heat'; // 'heat', 'dry'
    this.displayMode = 'temp'; // 'temp', 'time'
    this.editMode = 'none'; // 'none', 'temp', 'time'
    this.babyMode = false;
    this.unit = 'F'; // 'F' or 'C'
    this.tempIndex = 1; // 140°F
    this.heatTimeIndex = 2; // 00:40
    this.dryTimeIndex = 0; // 01:00
    this.savedPreBabyTempIndex = 1;

    // Countdown / Timers
    this.remainingSec = 40 * 60;
    this.countdownTimer = null;
    this.inactivityTimer = null;
    this.dotCycle = 0;
    this.dotInterval = null;

    // Long press detection
    this.powerPressTimer = null;
    this.compPressTimer = null;

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
      powerBtn.addEventListener('mousedown', (e) => this.handlePowerPressStart(e));
      powerBtn.addEventListener('touchstart', (e) => this.handlePowerPressStart(e), { passive: true });
      powerBtn.addEventListener('mouseup', () => this.handlePowerPressEnd());
      powerBtn.addEventListener('mouseleave', () => this.handlePowerPressEnd());
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

    // Time/Temp Composite Key
    const compBtn = this.root.querySelector('.btn-composite-key');
    if (compBtn) {
      compBtn.addEventListener('mousedown', (e) => this.handleCompPressStart(e));
      compBtn.addEventListener('touchstart', (e) => this.handleCompPressStart(e), { passive: true });
      compBtn.addEventListener('mouseup', (e) => this.handleCompPressEnd(e));
      compBtn.addEventListener('mouseleave', () => this.clearCompPress());
      compBtn.addEventListener('touchend', (e) => this.handleCompPressEnd(e));
    }

    // Baby Mode Key
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      babyBtn.addEventListener('click', () => this.toggleBabyMode());
    }

    // Left [-] Adjust Button
    const leftBtn = this.root.querySelector('.btn-adjust-left');
    if (leftBtn) {
      leftBtn.addEventListener('click', () => this.adjustParam(-1));
    }

    // Right [+] Adjust Button
    const rightBtn = this.root.querySelector('.btn-adjust-right');
    if (rightBtn) {
      rightBtn.addEventListener('click', () => this.adjustParam(1));
    }

    // Time & Temp direct tabs at top
    const timeTab = this.root.querySelector('.pos-time-tab');
    if (timeTab) {
      timeTab.addEventListener('click', () => this.switchToDisplay('time'));
    }
    const tempTab = this.root.querySelector('.pos-temp-tab');
    if (tempTab) {
      tempTab.addEventListener('click', () => this.switchToDisplay('temp'));
    }

    // Unit toggle on °F / °C click
    const unitF = this.root.querySelector('.s1-icon-f');
    const unitC = this.root.querySelector('.s1-icon-c');
    if (unitF) unitF.addEventListener('click', () => this.toggleUnit());
    if (unitC) unitC.addEventListener('click', () => this.toggleUnit());
  }

  handlePowerPressStart(e) {
    this.powerPressStartTime = Date.now();
    this.powerLongPressed = false;
    this.powerPressTimer = setTimeout(() => {
      this.powerLongPressed = true;
      this.toggleOnOff();
    }, 1200);
  }

  handlePowerPressEnd() {
    clearTimeout(this.powerPressTimer);
    if (!this.powerLongPressed && Date.now() - this.powerPressStartTime < 1200) {
      // Short press: Start or Pause
      this.toggleStartPause();
    }
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
    this.startDotAnimation();
    this.render();
  }

  pauseRunning() {
    this.power = 'paused';
    clearInterval(this.countdownTimer);
    clearInterval(this.dotInterval);
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
        if (this.displayMode === 'time') {
          this.renderDigits();
        }
        if (this.remainingSec <= 0) {
          // Completed
          this.power = 'standby';
          sound.playAlert();
          this.stopRunning();
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
      // 8 dots total: indices 0..3 left, 4..7 right
      // Center-outward ripple:
      // Pair 0: index 3 & 4 (closest to center)
      // Pair 1: index 2 & 5
      // Pair 2: index 1 & 6
      // Pair 3: index 0 & 7 (outermost)
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

  handleCompPressStart(e) {
    this.compPressStartTime = Date.now();
    this.compLongPressed = false;
    this.compPressTimer = setTimeout(() => {
      this.compLongPressed = true;
      this.toggleUnit();
    }, 1200);
  }

  handleCompPressEnd(e) {
    clearTimeout(this.compPressTimer);
    if (!this.compLongPressed && Date.now() - this.compPressStartTime < 1200) {
      this.cycleCompositeKey();
    }
  }

  clearCompPress() {
    clearTimeout(this.compPressTimer);
  }

  cycleCompositeKey() {
    if (this.power === 'off') return;
    sound.playClick();
    this.resetInactivityTimer();

    // Q2 logic confirmed by user:
    // "第一次点复合键切到时间，第二次切到温度，第三次回时间。5s没操作就会到默认状态"
    if (this.mode === 'dry') {
      // Dry mode only has time adjustment
      this.displayMode = 'time';
      this.editMode = 'time';
    } else if (this.editMode === 'none') {
      this.displayMode = 'time';
      this.editMode = 'time';
    } else if (this.editMode === 'time') {
      if (this.babyMode) {
        // In baby mode temp is locked!
        this.editMode = 'none';
        this.displayMode = 'temp';
      } else {
        this.displayMode = 'temp';
        this.editMode = 'temp';
      }
    } else if (this.editMode === 'temp') {
      this.displayMode = 'time';
      this.editMode = 'time';
    }
    this.render();
  }

  switchToDisplay(type) {
    if (this.power === 'off') return;
    sound.playClick();
    this.displayMode = type;
    this.editMode = type;
    this.resetInactivityTimer();
    this.render();
  }

  setMode(mode) {
    if (this.power === 'off') return;
    if (this.mode === mode) return;
    sound.playMode();
    this.mode = mode;
    if (mode === 'dry') {
      this.babyMode = false;
      this.displayMode = 'time';
      this.editMode = 'none';
    } else {
      this.displayMode = 'temp';
      this.editMode = 'none';
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
      this.displayMode = 'temp';
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

    // If not in edit mode, entering adjustment defaults to editing current display
    if (this.editMode === 'none') {
      this.editMode = this.displayMode;
    }

    if (this.editMode === 'temp') {
      if (this.babyMode) return; // locked
      const max = (this.unit === 'F' ? TEMP_PRESETS_F : TEMP_PRESETS_C).length;
      this.tempIndex = (this.tempIndex + delta + max) % max;
    } else if (this.editMode === 'time') {
      if (this.mode === 'heat') {
        const max = HEAT_TIME_PRESETS.length;
        this.heatTimeIndex = (this.heatTimeIndex + delta + max) % max;
      } else {
        // DRY mode has min & max bounds per spec!
        // "到达最低值时【-】熄灭，不可点击；到达最高值时【+】熄灭，不可点击"
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

    // Time & Temp tabs
    const timeTab = this.root.querySelector('.pos-time-tab .tab-label');
    const timeLine = this.root.querySelector('.pos-time-tab .tab-indicator-line');
    const tempTab = this.root.querySelector('.pos-temp-tab .tab-label');
    const tempLine = this.root.querySelector('.pos-temp-tab .tab-indicator-line');
    const isShowingTime = this.displayMode === 'time';
    if (timeTab) timeTab.classList.toggle('active', isShowingTime);
    if (timeLine) timeLine.classList.toggle('active', isShowingTime);
    if (tempTab) tempTab.classList.toggle('active', !isShowingTime);
    if (tempLine) tempLine.classList.toggle('active', !isShowingTime);

    // Baby mode key
    const babyBtn = this.root.querySelector('.btn-baby-key');
    if (babyBtn) {
      babyBtn.classList.toggle('baby-active', this.babyMode);
    }

    // Adjust button disabled states (Dry mode limits)
    const leftBtn = this.root.querySelector('.btn-adjust-left');
    const rightBtn = this.root.querySelector('.btn-adjust-right');
    if (leftBtn && rightBtn) {
      if (this.mode === 'dry' && this.editMode === 'time') {
        leftBtn.classList.toggle('disabled', this.dryTimeIndex === 0);
        rightBtn.classList.toggle('disabled', this.dryTimeIndex === DRY_TIME_PRESETS.length - 1);
      } else if (this.babyMode && this.editMode === 'temp') {
        leftBtn.classList.add('disabled');
        rightBtn.classList.add('disabled');
      } else {
        leftBtn.classList.remove('disabled');
        rightBtn.classList.remove('disabled');
      }
    }

    // Status icons
    const iconWifi = this.root.querySelector('.s1-icon-wifi');
    const iconF = this.root.querySelector('.s1-icon-f');
    const iconC = this.root.querySelector('.s1-icon-c');
    if (iconWifi) iconWifi.classList.add('active');
    if (iconF) iconF.classList.toggle('active', !isShowingTime && this.unit === 'F');
    if (iconC) iconC.classList.toggle('active', !isShowingTime && this.unit === 'C');

    // Render 7-segment Digits
    this.renderDigits();

    // Render Flame & Dots
    this.renderDots();

    if (this.onStateChange) {
      this.onStateChange({
        scheme: 1,
        power: this.power,
        mode: this.mode,
        displayMode: this.displayMode,
        editMode: this.editMode,
        temp: this.currentTemp,
        time: this.currentTimeStr,
        babyMode: this.babyMode,
        unit: this.unit
      });
    }
  }

  renderDigits() {
    const digitContainer = this.root.querySelector('.s1-digits');
    if (!digitContainer) return;

    digitContainer.classList.toggle('blinking', this.editMode !== 'none');

    let d1 = ' ', d2 = ' ', d3 = ' ', d4 = ' ';
    let showColon = false;

    if (this.displayMode === 'time') {
      showColon = true;
      const str = this.power === 'running' 
        ? formatCountdown(this.remainingSec) 
        : this.currentTimeStr;
      const [h, m] = str.split(':');
      d1 = h[0];
      d2 = h[1];
      d3 = m[0];
      d4 = m[1];
    } else {
      // Temperature display
      showColon = false;
      const tempNum = String(this.currentTemp);
      if (tempNum.length === 3) {
        d1 = ' '; // dim
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
      powerBtn.addEventListener('mouseleave', () => clearTimeout(this.powerPressTimer));
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
    if (!this.powerLongPressed && Date.now() - this.powerPressStartTime < 1200) {
      this.toggleStartPause();
    }
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
      powerBtn.addEventListener('mouseleave', () => clearTimeout(this.powerPressTimer));
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
    if (!this.powerLongPressed && Date.now() - this.powerPressStartTime < 1200) {
      this.toggleStartPause();
    }
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
