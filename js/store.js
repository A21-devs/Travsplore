// this owns all persistent state under one localStorage key
(function () {
  "use strict";

  var KEY = "travsplore.v1";

  var DEFAULT_MODELS = {
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-sonnet-latest",
    gemini: "gemini-2.5-flash"
  };

  // this bumps model ids the providers have retired (or that have no free tier) so
  // a saved config keeps working
  var RETIRED_MODELS = {
    gemini: [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
      "gemini-1.5-pro-latest",
      "gemini-1.0-pro",
      "gemini-pro"
    ]
  };

  function liveModel(provider, model) {
    var dead = RETIRED_MODELS[provider];
    if (dead && dead.indexOf(model) !== -1) return DEFAULT_MODELS[provider];
    return model;
  }

  // this is the shape every load falls back to
  function freshState() {
    return {
      config: {
        provider: "openai",
        keys: { openai: [], anthropic: [], gemini: [] },
        models: {
          openai: DEFAULT_MODELS.openai,
          anthropic: DEFAULT_MODELS.anthropic,
          gemini: DEFAULT_MODELS.gemini
        },
        onboarded: false,
        theme: "light",
        lastOrigin: ""
      },
      exclusions: { continents: [], countries: [], places: [], notes: "" },
      places: [],
      plans: [],
      compares: []
    };
  }

  var listeners = [];
  var state = load();

  // this makes an id that is unique enough for local records
  function makeId() {
    return (
      "id_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function isObj(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function asStringArray(v) {
    return asArray(v).filter(function (x) {
      return typeof x === "string";
    });
  }

  // keys can arrive as a single string (legacy / onboarding) or a list — coerce
  // either into a clean array of non-empty keys
  function toKeyList(v) {
    if (typeof v === "string") return v.trim() ? [v.trim()] : [];
    if (Array.isArray(v)) {
      return v.map(function (x) { return typeof x === "string" ? x.trim() : ""; }).filter(Boolean);
    }
    return [];
  }

  // this repairs whatever we read so callers always see the full shape
  function normalize(raw) {
    var base = freshState();
    if (!isObj(raw)) return base;

    if (isObj(raw.config)) {
      var c = raw.config;
      if (c.provider === "openai" || c.provider === "anthropic" || c.provider === "gemini") {
        base.config.provider = c.provider;
      }
      if (isObj(c.keys)) {
        base.config.keys.openai = toKeyList(c.keys.openai);
        base.config.keys.anthropic = toKeyList(c.keys.anthropic);
        base.config.keys.gemini = toKeyList(c.keys.gemini);
      }
      if (isObj(c.models)) {
        base.config.models.openai = liveModel("openai",
          typeof c.models.openai === "string" && c.models.openai ? c.models.openai : DEFAULT_MODELS.openai);
        base.config.models.anthropic = liveModel("anthropic",
          typeof c.models.anthropic === "string" && c.models.anthropic ? c.models.anthropic : DEFAULT_MODELS.anthropic);
        base.config.models.gemini = liveModel("gemini",
          typeof c.models.gemini === "string" && c.models.gemini ? c.models.gemini : DEFAULT_MODELS.gemini);
      }
      base.config.onboarded = !!c.onboarded;
      base.config.theme = c.theme === "dark" ? "dark" : "light";
      base.config.lastOrigin = typeof c.lastOrigin === "string" ? c.lastOrigin : "";
    }

    if (isObj(raw.exclusions)) {
      base.exclusions.continents = asStringArray(raw.exclusions.continents);
      base.exclusions.countries = asStringArray(raw.exclusions.countries);
      base.exclusions.places = asStringArray(raw.exclusions.places);
      base.exclusions.notes = typeof raw.exclusions.notes === "string" ? raw.exclusions.notes : "";
    }

    base.places = asArray(raw.places).filter(isObj);
    base.plans = asArray(raw.plans).filter(isObj);
    base.compares = asArray(raw.compares).filter(isObj);

    // make sure every record carries an id
    ["places", "plans", "compares"].forEach(function (k) {
      base[k].forEach(function (rec) {
        if (typeof rec.id !== "string" || !rec.id) rec.id = makeId();
      });
    });

    return base;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return freshState();
      return normalize(JSON.parse(raw));
    } catch (_) {
      return freshState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {
      // storage full or unavailable — keep running on the in-memory copy
    }
  }

  // this saves then notifies every subscriber
  function commit() {
    persist();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (_) {}
    }
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // this is a generic crud collection backed by state[name]
  function collection(name) {
    return {
      list: function () {
        return clone(state[name]);
      },
      get: function (id) {
        var found = state[name].filter(function (r) {
          return r.id === id;
        })[0];
        return found ? clone(found) : null;
      },
      add: function (obj) {
        var rec = isObj(obj) ? clone(obj) : {};
        rec.id = makeId();
        if (!rec.createdAt) rec.createdAt = Date.now();
        state[name].push(rec);
        commit();
        return rec.id;
      },
      update: function (id, patch) {
        var rec = state[name].filter(function (r) {
          return r.id === id;
        })[0];
        if (!rec) return false;
        if (isObj(patch)) {
          Object.keys(patch).forEach(function (k) {
            if (k === "id") return;
            rec[k] = patch[k];
          });
        }
        rec.updatedAt = Date.now();
        commit();
        return true;
      },
      remove: function (id) {
        var before = state[name].length;
        state[name] = state[name].filter(function (r) {
          return r.id !== id;
        });
        if (state[name].length !== before) {
          commit();
          return true;
        }
        return false;
      }
    };
  }

  var placesCol = collection("places");
  var plansCol = collection("plans");
  var comparesCol = collection("compares");

  var TStore = {
    // config
    getConfig: function () {
      return clone(state.config);
    },
    setConfig: function (patch) {
      if (!isObj(patch)) return clone(state.config);
      if (patch.provider === "openai" || patch.provider === "anthropic" || patch.provider === "gemini") {
        state.config.provider = patch.provider;
      }
      if (isObj(patch.keys)) {
        ["openai", "anthropic", "gemini"].forEach(function (p) {
          if (p in patch.keys) state.config.keys[p] = toKeyList(patch.keys[p]);
        });
      }
      if (isObj(patch.models)) {
        ["openai", "anthropic", "gemini"].forEach(function (p) {
          if (typeof patch.models[p] === "string" && patch.models[p]) state.config.models[p] = patch.models[p];
        });
      }
      if (typeof patch.onboarded === "boolean") state.config.onboarded = patch.onboarded;
      if (patch.theme === "light" || patch.theme === "dark") state.config.theme = patch.theme;
      if (typeof patch.lastOrigin === "string") state.config.lastOrigin = patch.lastOrigin;
      commit();
      return clone(state.config);
    },

    // exclusions
    getExclusions: function () {
      return clone(state.exclusions);
    },
    setExclusions: function (obj) {
      if (!isObj(obj)) return clone(state.exclusions);
      if ("continents" in obj) state.exclusions.continents = asStringArray(obj.continents);
      if ("countries" in obj) state.exclusions.countries = asStringArray(obj.countries);
      if ("places" in obj) state.exclusions.places = asStringArray(obj.places);
      if ("notes" in obj && typeof obj.notes === "string") state.exclusions.notes = obj.notes;
      commit();
      return clone(state.exclusions);
    },

    // collections
    places: placesCol,
    plans: plansCol,
    compares: comparesCol,

    // active provider snapshot the AI wrapper consumes
    activeProvider: function () {
      var p = state.config.provider;
      var keys = toKeyList(state.config.keys[p]);
      if (!keys.length) return null;
      return { provider: p, apiKey: keys[0], keys: keys, model: state.config.models[p] };
    },

    // export / import everything as json text
    exportAll: function () {
      return JSON.stringify(state, null, 2);
    },
    importAll: function (jsonString) {
      try {
        var parsed = JSON.parse(jsonString);
        state = normalize(parsed);
        commit();
        return true;
      } catch (_) {
        return false;
      }
    },

    // change subscription
    on: function (fn) {
      if (typeof fn === "function" && listeners.indexOf(fn) === -1) listeners.push(fn);
    },
    off: function (fn) {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },

    // exposed for callers that want the shipped defaults
    DEFAULT_MODELS: clone(DEFAULT_MODELS)
  };

  window.TStore = TStore;
})();
