/*
 * GlassInstrumentExample.js
 * Standalone example demonstrating how to use GlassInstrument without
 * the legacy FGFS.Instrument JSON/SVG gauge system.
 *
 * Prerequisites (include in HTML, in this order):
 *   <script src="Phi/lib/fgfs.js"></script>
 *   <script src="Phi/lib/GlassInstrument.js"></script>
 *   <script src="Phi/lib/GlassInstrumentExample.js"></script>
 *
 * This will start logging Engine & Fuel updates as property values arrive.
 */

class MyGlassPanel {
  constructor(options) {
    this.opts = Object.assign({
      maxRPM: 2700,
      maxCHT: 500,        // deg F
      maxFuel: 21.5,      // gal per tank (C172P typical)
      smoothFactor: 0.18  // exponential smoothing factor
    }, options || {});

    this.state = {
      rpm: 0,
      cht: 0,
      left: 0,
      right: 0,
      rpmSmoothed: 0,
      chtSmoothed: 0,
      leftSmoothed: 0,
      rightSmoothed: 0,
      initialized: false
    };

    GlassInstrument.define(this, {
      Engine: { rpm: '/engines/engine/rpm', cht: '/engines/engine/cht-degf' },
      Fuel:   { left: '/consumables/fuel/tank/left/level-gal', right: '/consumables/fuel/tank/right/level-gal' }
    });

    // Build UI when DOM ready.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._buildUI());
    } else {
      this._buildUI();
    }
  }

  _buildUI() {
    console.log('[MyGlassPanel] Building UI');
    const host = document.getElementById('glasspanel');
    if (!host) {
      console.warn('[MyGlassPanel] #glasspanel not found');
      return;
    }
    host.classList.add('glass-host');
    host.innerHTML = this._template();
    this._cacheElements(host);
    this._injectStyles();
    this.state.initialized = true;
    this._renderFrame(true);
  }

  _template() {
    return `
      <div class="glass-dashboard">
        <div class="gd-row">
          <div class="gd-card wide">
            <div class="gd-label">RPM</div>
            <div class="gd-value" id="gd-rpm-val">----</div>
            <div class="gd-bar"><div class="gd-bar-fill" id="gd-rpm-bar"></div></div>
          </div>
          <div class="gd-card">
            <div class="gd-label">CHT</div>
            <div class="gd-value" id="gd-cht-val">---°F</div>
            <div class="gd-bar"><div class="gd-bar-fill grad-hot" id="gd-cht-bar"></div></div>
          </div>
          <div class="gd-card radial">
            <svg id="gd-engine-radial" viewBox="0 0 140 140">
              <defs>
                <linearGradient id="rpmGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#00f6ff" />
                  <stop offset="100%" stop-color="#007bff" />
                </linearGradient>
                <linearGradient id="chtGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#2bff5e" />
                  <stop offset="70%" stop-color="#ffb300" />
                  <stop offset="100%" stop-color="#ff2b2b" />
                </linearGradient>
              </defs>
              <circle class="radial-bg" cx="70" cy="70" r="62" />
              <circle class="radial-track" cx="70" cy="70" r="54" />
              <circle class="radial-arc rpm"   cx="70" cy="70" r="54" stroke="url(#rpmGrad)" />
              <circle class="radial-track inner" cx="70" cy="70" r="40" />
              <circle class="radial-arc cht"   cx="70" cy="70" r="40" stroke="url(#chtGrad)" />
              <text x="70" y="66" text-anchor="middle" class="radial-text" id="gd-rpm-center">RPM</text>
              <text x="70" y="86" text-anchor="middle" class="radial-subtext" id="gd-cht-center">CHT</text>
            </svg>
          </div>
        </div>
        <div class="gd-row">
          <div class="gd-card">
            <div class="gd-label">FUEL L</div>
            <div class="gd-value" id="gd-fuel-left-val">--.- gal</div>
            <div class="gd-bar small"><div class="gd-bar-fill grad-fuel" id="gd-fuel-left-bar"></div></div>
          </div>
            <div class="gd-card">
            <div class="gd-label">FUEL R</div>
            <div class="gd-value" id="gd-fuel-right-val">--.- gal</div>
            <div class="gd-bar small"><div class="gd-bar-fill grad-fuel" id="gd-fuel-right-bar"></div></div>
          </div>
          <div class="gd-card span2">
            <div class="gd-label">STATUS</div>
            <div class="gd-status-grid" id="gd-status">
              <div class="gd-status" id="gd-status-rpm">RPM</div>
              <div class="gd-status" id="gd-status-cht">CHT</div>
              <div class="gd-status" id="gd-status-fuel">FUEL</div>
            </div>
          </div>
        </div>
      </div></div>`;
  }

  _cacheElements(host) {
    this.el = {
      rpmVal: host.querySelector('#gd-rpm-val'),
      rpmBar: host.querySelector('#gd-rpm-bar'),
      chtVal: host.querySelector('#gd-cht-val'),
      chtBar: host.querySelector('#gd-cht-bar'),
      fuelLeftVal: host.querySelector('#gd-fuel-left-val'),
      fuelLeftBar: host.querySelector('#gd-fuel-left-bar'),
      fuelRightVal: host.querySelector('#gd-fuel-right-val'),
      fuelRightBar: host.querySelector('#gd-fuel-right-bar'),
      rpmCenter: host.querySelector('#gd-rpm-center'),
      chtCenter: host.querySelector('#gd-cht-center'),
      radialRPM: host.querySelector('.radial-arc.rpm'),
      radialCHT: host.querySelector('.radial-arc.cht'),
      statusRPM: host.querySelector('#gd-status-rpm'),
      statusCHT: host.querySelector('#gd-status-cht'),
      statusFuel: host.querySelector('#gd-status-fuel')
    };

    // Prepare stroke lengths
    this.radial = {
      rpmCirc: 2 * Math.PI * 54,
      chtCirc: 2 * Math.PI * 40
    };
    this.el.radialRPM.setAttribute('stroke-dasharray', this.radial.rpmCirc.toString());
    this.el.radialCHT.setAttribute('stroke-dasharray', this.radial.chtCirc.toString());
    // Initialize offset fully hidden
    this.el.radialRPM.setAttribute('stroke-dashoffset', this.radial.rpmCirc.toString());
    this.el.radialCHT.setAttribute('stroke-dashoffset', this.radial.chtCirc.toString());
  }

  _injectStyles() {
    if (document.getElementById('glass-dashboard-styles')) return;
    const css = `
      #glasspanel.glass-host { background:#05060a; position:relative; overflow:hidden; font-family: 'Segoe UI', Arial, sans-serif; }
      .glass-dashboard { display:flex; flex-direction:column; gap:0.75rem; color:#e6f8ff; }
      .gd-row { display:flex; flex-wrap:wrap; gap:0.75rem; }
      .gd-card { flex:1 1 0; min-width:140px; background:linear-gradient(135deg, rgba(0,40,60,0.6), rgba(0,15,25,0.9)); border:1px solid rgba(0,255,255,0.15); border-radius:12px; padding:10px 12px; position:relative; backdrop-filter:blur(6px); box-shadow:0 0 12px -2px #00c6ff40 inset, 0 0 24px -6px #00e6ff70; }
      .gd-card.wide { flex:2 1 0; }
      .gd-card.radial { display:flex; align-items:center; justify-content:center; max-width:200px; }
      .gd-card.span2 { flex:2 1 0; }
      .gd-label { font-size:0.70rem; letter-spacing:1px; color:#6ddfff; opacity:0.85; }
      .gd-value { font-size:1.4rem; font-weight:600; margin-top:2px; text-shadow:0 0 6px #00eaff; }
      .gd-bar { height:10px; margin-top:6px; background:#101820; border-radius:6px; overflow:hidden; position:relative; box-shadow:0 0 0 1px #0b2730 inset; }
      .gd-bar.small { height:8px; }
      .gd-bar-fill { height:100%; width:0%; background:linear-gradient(90deg,#00ffc8,#00b0ff); box-shadow:0 0 6px 1px #00f6ff80; transition:width 0.18s ease, background 0.3s; }
      .gd-bar-fill.grad-hot { background:linear-gradient(90deg,#2bff5e,#ffcf00,#ff2b2b); }
      .gd-bar-fill.grad-fuel { background:linear-gradient(90deg,#5eff8e,#00d8ff); }
      svg#gd-engine-radial { width:100%; height:auto; }
      .radial-bg { fill:rgba(0,10,20,0.6); stroke:#062a33; stroke-width:2; }
      .radial-track { fill:none; stroke:#0d2e38; stroke-width:10; stroke-linecap:round; }
      .radial-track.inner { stroke-width:8; }
      .radial-arc { fill:none; stroke-width:10; stroke-linecap:round; transform:rotate(-90deg); transform-origin:70px 70px; transition:stroke-dashoffset 0.25s ease; filter:drop-shadow(0 0 4px #00eaff); }
      .radial-arc.cht { stroke-width:8; filter:drop-shadow(0 0 4px #ff8a00); }
      .radial-text { font-size:14px; fill:#c7f7ff; font-weight:600; }
      .radial-subtext { font-size:11px; fill:#ffe2d0; font-weight:500; }
      .gd-status-grid { display:flex; gap:0.5rem; margin-top:0.5rem; }
      .gd-status { flex:1 1 0; text-align:center; padding:6px 4px; font-size:0.75rem; border:1px solid #0b4250; border-radius:8px; background:linear-gradient(145deg,#041c24,#082d38); box-shadow:0 0 0 1px #0a4c5d inset; transition:background 0.3s, color 0.3s, box-shadow 0.3s; }
      .gd-status.ok { color:#6dffb1; box-shadow:0 0 0 1px #0a5d3a inset; }
      .gd-status.warn { color:#ffe27a; box-shadow:0 0 0 1px #5d4e0a inset; }
      .gd-status.alarm { color:#ff7878; box-shadow:0 0 0 1px #5d0a0a inset; animation:pulse 1.1s infinite; }
      @keyframes pulse { 0%,100% { filter:drop-shadow(0 0 2px #ff3a3a);} 50% { filter:drop-shadow(0 0 8px #ff3a3a);} }
    `;
    const style = document.createElement('style');
    style.id = 'glass-dashboard-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Instrument callbacks from GlassInstrument
  Engine(rpm, cht) {
    this.state.rpm = rpm;
    this.state.cht = cht;
    this._scheduleRender();
  }
  Fuel(left, right) {
    this.state.left = left;
    this.state.right = right;
    this._scheduleRender();
  }

  _scheduleRender() {
    if (!this.state.initialized) return;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._renderFrame();
    });
  }

  _renderFrame(initial) {
    const s = this.state;
    const o = this.opts;
    // Exponential smoothing
    const f = initial ? 1 : o.smoothFactor;
    s.rpmSmoothed   = s.rpmSmoothed   + (s.rpm   - s.rpmSmoothed)   * f;
    s.chtSmoothed   = s.chtSmoothed   + (s.cht   - s.chtSmoothed)   * f;
    s.leftSmoothed  = s.leftSmoothed  + (s.left  - s.leftSmoothed)  * f;
    s.rightSmoothed = s.rightSmoothed + (s.right - s.rightSmoothed) * f;

    // Percentages
    const rpmPct = Math.max(0, Math.min(1, s.rpmSmoothed / o.maxRPM));
    const chtPct = Math.max(0, Math.min(1, s.chtSmoothed / o.maxCHT));
    const leftPct = Math.max(0, Math.min(1, s.leftSmoothed / o.maxFuel));
    const rightPct = Math.max(0, Math.min(1, s.rightSmoothed / o.maxFuel));

    // Text values
    this.el.rpmVal.textContent = Math.round(s.rpmSmoothed).toString();
    this.el.chtVal.textContent = Math.round(s.chtSmoothed) + '°F';
    this.el.fuelLeftVal.textContent = leftPct * o.maxFuel < 10 ? (s.leftSmoothed.toFixed(1) + ' gal') : s.leftSmoothed.toFixed(1) + ' gal';
    this.el.fuelRightVal.textContent = s.rightSmoothed.toFixed(1) + ' gal';
    this.el.rpmCenter.textContent = Math.round(s.rpmSmoothed);
    this.el.chtCenter.textContent = Math.round(s.chtSmoothed) + '°F';

    // Bars
    this.el.rpmBar.style.width = (rpmPct * 100).toFixed(1) + '%';
    this.el.chtBar.style.width = (chtPct * 100).toFixed(1) + '%';
    this.el.fuelLeftBar.style.width = (leftPct * 100).toFixed(1) + '%';
    this.el.fuelRightBar.style.width = (rightPct * 100).toFixed(1) + '%';

    // Radial arcs (stroke-dashoffset = remaining length)
    const rpmOffset = this.radial.rpmCirc * (1 - rpmPct);
    const chtOffset = this.radial.chtCirc * (1 - chtPct);
    this.el.radialRPM.setAttribute('stroke-dashoffset', rpmOffset.toFixed(2));
    this.el.radialCHT.setAttribute('stroke-dashoffset', chtOffset.toFixed(2));

    // Status classification
    this._applyStatus(this.el.statusRPM, rpmPct, [0.85, 0.95]);
    this._applyStatus(this.el.statusCHT, chtPct, [0.75, 0.90]);
    const fuelAvgPct = (leftPct + rightPct) / 2;
    // Lower thresholds invert logic (low fuel dangerous)
    const fuelStatus = fuelAvgPct > 0.35 ? (fuelAvgPct > 0.20 ? 'ok' : 'warn') : 'alarm';
    this.el.statusFuel.className = 'gd-status ' + fuelStatus;
  }

  _applyStatus(el, pct, thresholds) {
    const [warn, alarm] = thresholds; // actually alarm is higher threshold here
    let cls = 'ok';
    if (pct >= alarm) cls = 'alarm'; else if (pct >= warn) cls = 'warn';
    el.className = 'gd-status ' + cls;
  }
}

// Instantiate panel
window.myGlassPanel = new MyGlassPanel();
