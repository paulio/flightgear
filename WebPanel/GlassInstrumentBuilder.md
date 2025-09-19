
## "Building and Integrating a GlassInstrument Panel"

This guide shows how to embed a dynamic JavaScript “glass” engine/fuel (or any custom) display into the existing FlightGear webpanel that currently uses legacy SVG + JSON gauge definitions (e.g. `ASI.json`, `ALT.json`).  
The new approach uses `GlassInstrument.js` for direct property subscription—no JSON animation spec required.

## When To Use GlassInstrument

Use GlassInstrument when:
- You want richer, composite or data‑dense UI (bars, radial gauges, status tiles) not easily expressed with simple SVG rotations/translations.
- You prefer direct JavaScript rendering (DOM/SVG/Canvas) instead of multiple small JSON spec files.
- You need smoothing, batching (`requestAnimationFrame`), or custom logic per update.

Keep legacy JSON gauges for “steam” instruments (needles) where rotation/translation suffices.

## Key Files

- `c172p-webpanel.html`: Existing panel layout that loads instruments via `data-fgpanel-instrument`.
- `GlassInstrument.js`: Lightweight registry + property listener wrapper.
- `GlassInstrumentExample.js`: Example class (`MyGlassPanel`) demonstrating usage and UI build.
- (Optional placeholder) `Empty.json`: Used to reserve a grid cell without legacy animations.

## High-Level Integration Steps

1. Add script tags for `GlassInstrument.js` and your custom panel script after `fgfs.js`.
2. Add a placeholder panel cell (`div`) in the HTML grid for the glass component.
3. Implement a JavaScript class that calls `GlassInstrument.define(...)` to subscribe to FlightGear properties.
4. Build and inject custom HTML/CSS into the placeholder element.
5. Render/update UI inside the subscribed callback methods (one per “instrument group”).
6. (Optional) Tune performance with `raf` or `debounce` options.

## Step 1: Include Scripts

Ensure the following order (simplified excerpt from `c172p-webpanel.html`):

```html
<script src="/lib/fgfs.js"></script>
<script src="/lib/GlassInstrument.js"></script>
<script src="/lib/GlassInstrumentExample.js"></script>
```

If you create your own panel script, include it after `GlassInstrument.js`.

## Step 2: Add a Placeholder Container

In the panel layout, reserve a cell. You can keep `data-fgpanel-instrument="Empty.json"` so legacy loader ignores animations:

```html
<div id="glasspanel" class="instrument col-xs-2" data-fgpanel-instrument="Empty.json"></div>
```

You can add additional ones (e.g., `glassnavigation`) for separate composite displays or navigation status.

## Step 3: Define a GlassInstrument Mapping

Use `GlassInstrument.define(targetObject, descriptor)` where descriptor groups logical “instruments”:

```javascript
GlassInstrument.define(this, {
  Engine: { rpm: '/engines/engine/rpm', cht: '/engines/engine/cht-degf' },
  Fuel:   { left: '/consumables/fuel/tank/left/level-gal', right: '/consumables/fuel/tank/right/level-gal' }
});
```

Rules:
- Keys (`Engine`, `Fuel`) must correspond to methods on your class with identical names.
- Property paths may omit the leading slash; the helper ensures they become absolute.

## Step 4: Implement Update Handlers

Each method receives arguments in the insertion order of properties:

```javascript
Engine(rpm, cht) {
  // Update state, schedule re-render
}

Fuel(left, right) {
  // Update state, schedule re-render
}
```

## Step 5: Build the UI Once

On DOM ready, create your structure and cache element refs:

```javascript
_buildUI() {
  const host = document.getElementById('glasspanel');
  host.innerHTML = `<div class="glass-dashboard"> ... </div>`;
  this._cacheElements(host);
  this._injectStyles();
}
```

You can lift the full template and style injection pattern from `GlassInstrumentExample.js`.

## Step 6: Rendering Loop & Smoothing

Recommended pattern (already in example):

- Accumulate latest numeric values in `this.state`.
- Use `requestAnimationFrame` to coalesce multiple property updates into a single frame render.
- Apply exponential smoothing if desired.

```javascript
_scheduleRender() {
  if (this._raf) return;
  this._raf = requestAnimationFrame(() => {
    this._raf = null;
    this._renderFrame();
  });
}
```

## Step 7: Options (Debounce / RAF Mode)

`GlassInstrument` supports per‑instrument options:

```javascript
GlassInstrument.define(this, {
  Engine: { rpm: '/engines/engine/rpm', cht: '/engines/engine/cht-degf' }
}, {
  Engine: { mode: 'raf' }   // group-level batching
});
```

Available (current) inferred options:
- `mode: 'raf'` — schedule a single dispatch per animation frame.
- `debounce: <ms>` — wait for quiet period before dispatch (use for very noisy or low-priority properties).

## Minimal From-Scratch Example

```html
<!-- Add to panel HTML if not present -->
<div id="glasspanel" class="instrument col-xs-2" data-fgpanel-instrument="Empty.json"></div>

<script src="/lib/fgfs.js"></script>
<script src="/lib/GlassInstrument.js"></script>
<script>
class SimpleGlass {
  constructor() {
    this.state = { rpm:0, fuelL:0, fuelR:0 };
    GlassInstrument.define(this, {
      Engine: { rpm: '/engines/engine/rpm' },
      Fuel:   { left:'/consumables/fuel/tank/left/level-gal', right:'/consumables/fuel/tank/right/level-gal' }
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init());
    } else { this._init(); }
  }
  _init() {
    const host = document.getElementById('glasspanel');
    host.innerHTML = `
      <div style="font:12px Segoe UI,Arial;color:#cfe">
        <h3 style="margin:0 0 4px;font-size:14px;">Simple Glass</h3>
        <div>RPM: <span id="sg-rpm">0</span></div>
        <div>Fuel L/R: <span id="sg-fuel">0 / 0</span></div>
      </div>`;
    this.el = {
      rpm: host.querySelector('#sg-rpm'),
      fuel: host.querySelector('#sg-fuel')
    };
  }
  Engine(rpm) {
    this.state.rpm = rpm;
    this._render();
  }
  Fuel(left, right) {
    this.state.fuelL = left;
    this.state.fuelR = right;
    this._render();
  }
  _render() {
    if (!this.el) return;
    this.el.rpm.textContent = Math.round(this.state.rpm);
    this.el.fuel.textContent = `${this.state.fuelL.toFixed(1)} / ${this.state.fuelR.toFixed(1)}`;
  }
}
new SimpleGlass();
</script>
```

## Coexistence With Legacy JSON Instruments

- The legacy loader will still parse all `data-fgpanel-instrument="*.json"` cells and animate their SVGs.
- Your glass panel cell uses `Empty.json` (no transforms) so it remains under your sole control.
- Property subscriptions do not conflict: both systems read from the same FlightGear property service.

## Common Pitfalls & Debugging

| Issue | Cause | Fix |
|-------|-------|-----|
| `[GlassInstrument] FGFS core not loaded` | Script order incorrect | Ensure `fgfs.js` precedes `GlassInstrument.js` |
| No updates arriving | Property path typo | Validate path with FlightGear property browser |
| UI flicker | Redundant full DOM rebuild | Only update text / attributes, not innerHTML each frame |
| High CPU | Rendering on every property update | Use `raf` batching or lightweight diffing |

## Extending Further

Ideas:
- Add navigation data group: heading, CDI deflection, GPS ground speed.
- Integrate warning logic (e.g., RPM over-redline triggers flashing).
- Add trend indicators (delta per 5 seconds).
- Export a TypeScript definition for stronger typing if you build a module bundle.

## Migration Tips (Legacy → Glass)

| Legacy Pattern | GlassInstrument Equivalent |
|----------------|----------------------------|
| JSON rotation + interpolation XML | Direct numeric property + JavaScript mapping |
| Multiple needle JSON files | Single composite class with sections/cards |
| Static pivot coords | Free layout in HTML/CSS/SVG |
| Interpolation XML | Inline JS function or lookup array |

## Checklist

- [ ] Added scripts in correct order
- [ ] Inserted container div with stable id
- [ ] Created class with `GlassInstrument.define`
- [ ] Implemented instrument callback methods
- [ ] Built initial UI on DOM ready
- [ ] Verified property values update display
- [ ] (Optional) Added smoothing or status logic

## Glossary

- Property Listener: WebSocket/HTTP push interface in `fgfs.js` delivering property changes.
- Instrument Group: A named set of properties mapped to one callback (e.g. `Engine`).
- Smoothing: A simple low-pass filter to reduce jitter in visual presentation.

