/*
 * GlassInstrument.js
 * Lightweight instrumentation/observer layer on top of FlightGear's
 * existing fgfs.js PropertyListener without using the legacy FGFS.Instrument
 * (SVG/JSON) pattern.
 *
 * Usage Example:
 *   class MyGlassPanel {
 *     constructor() {
 *       GlassInstrument.define(this, {
 *         Engine: { rpm: '/engines/engine/rpm', cht: '/engines/engine/cht-degf' },
 *         Fuel:   { left: '/consumables/fuel/tank/left/level-gal', right: '/consumables/fuel/tank/right/level-gal' }
 *       });
 *     }
 *     Engine(rpm, cht) { // update UI }
 *     Fuel(left, right) { // update UI }
 *   }
 *   new MyGlassPanel();
 *
 * Design Goals:
 *  - Minimal API surface.
 *  - Order of callback arguments == insertion order of properties in the map.
 *  - No dependency on FGFS.Instrument / animations.
 *  - Immediate dispatch per property update (can be extended with debounce/RAF batching).
 *
 * Extensibility points (future):
 *  - options: { debounce: ms, raf: true }
 *  - automatic smoothing / interpolation hooks.
 */
(function(global) {
  'use strict';

  if (!global.FGFS || !global.FGFS.PropertyListener || !global.FGFS.Property) {
    console.warn('[GlassInstrument] FGFS core (fgfs.js) not loaded yet. Include fgfs.js first.');
  }

  function ensureAbsolute(path) {
    if (path == null) throw new Error('Property path is null');
    return path.lastIndexOf('/', 0) === 0 ? path : '/' + path;
  }

  class GIRegistry {
    constructor() {
      this.instruments = new Map(); // name -> instrument record
      this.listener = null;         // FGFS.PropertyListener
      this._open = false;
    }

    _initListener() {
      if (this.listener) return;
      const self = this;
      this.listener = new FGFS.PropertyListener({
        onopen: function() {
          self._open = true;
          // Subscribe any instruments registered before open
            self.instruments.forEach(inst => {
              inst.props.forEach(p => self._subscribe(p));
            });
        }
      });
    }

    register(name, propertyMap, targetObj, options) {
      if (typeof name !== 'string') throw new Error('Instrument name must be string');
      if (this.instruments.has(name)) throw new Error('Instrument already registered: ' + name);
      if (!propertyMap || typeof propertyMap !== 'object') throw new Error('propertyMap must be object');
      this._initListener();

      const order = [];
      const props = [];
      Object.keys(propertyMap).forEach(key => {
        const path = ensureAbsolute(propertyMap[key]);
        order.push(key);
        props.push({
          alias: key,
          path: path,
          propObj: new FGFS.Property(path),
          value: null,
          num: 0
        });
      });

      const inst = {
        name,
        target: targetObj,
        method: (typeof targetObj[name] === 'function') ? targetObj[name].bind(targetObj) : null,
        props,
        order,
        options: options || {},
        dispatchScheduled: false
      };

      if (!inst.method) {
        console.warn('[GlassInstrument] No method named ' + name + ' found on target object. Updates will be ignored until added.');
      }

      this.instruments.set(name, inst);

      // Subscribe now if socket already open; else onopen handler will do it.
      if (this._open) {
        inst.props.forEach(p => this._subscribe(p));
      }
      return inst;
    }

    _subscribe(propRec) {
      const self = this;
      this.listener.addProperty(propRec.propObj, function(node) {
        if (typeof node.value !== 'undefined') {
          propRec.value = node.value;
          const asNum = Number(node.value);
          propRec.num = isNaN(asNum) ? 0 : asNum;
          self._onPropertyUpdate(propRec);
        }
      });
    }

    _findInstrumentByPath(path) {
      // Linear search acceptable for small sets; can optimize with map if needed.
      for (const inst of this.instruments.values()) {
        for (const p of inst.props) {
          if (p.path === path) return inst;
        }
      }
      return null;
    }

    _onPropertyUpdate(propRec) {
      // Determine instrument
      const inst = this._findInstrumentByPath(propRec.path);
      if (!inst || !inst.method) return;

      const mode = inst.options && inst.options.mode;
      if (mode === 'raf') {
        if (!inst.dispatchScheduled) {
          inst.dispatchScheduled = true;
          requestAnimationFrame(() => {
            inst.dispatchScheduled = false;
            this._dispatch(inst);
          });
        }
      } else if (typeof inst.options.debounce === 'number') {
        const wait = inst.options.debounce;
        clearTimeout(inst._debounceTimer);
        inst._debounceTimer = setTimeout(() => this._dispatch(inst), wait);
      } else {
        this._dispatch(inst); // immediate
      }
    }

    _dispatch(inst) {
      const args = inst.order.map(alias => {
        const rec = inst.props.find(p => p.alias === alias);
        return rec ? rec.num : 0;
      });
      try {
        inst.method && inst.method.apply(inst.target, args);
      } catch (e) {
        console.error('[GlassInstrument] Error invoking instrument method', inst.name, e);
      }
    }
  }

  const _registry = new GIRegistry();

  const GlassInstrument = {
    /**
     * Define multiple instruments in a single call.
     * descriptor example:
     * {
     *   Engine: { rpm:'/engines/engine/rpm', cht:'/engines/engine/cht-degf' },
     *   Fuel:   { left:'/consumables/fuel/tank/left/level-gal', right:'/consumables/fuel/tank/right/level-gal' }
     * }
     */
    define(targetObj, descriptor, optionsPerInstrument) {
      Object.keys(descriptor).forEach(name => {
        const propMap = descriptor[name];
        const opts = optionsPerInstrument && optionsPerInstrument[name];
        _registry.register(name, propMap, targetObj, opts);
      });
    },
    /** Register a single instrument */
    register(name, propMap, targetObj, options) { return _registry.register(name, propMap, targetObj, options); },
    /** Internal/testing access */
    _registry
  };

  global.GlassInstrument = GlassInstrument;
})(window);
