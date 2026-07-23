// this is the configure tab: providers, exclusions, data backup, preferences

(function () {
  var PROVIDERS = [
    { id: 'openai', name: 'OpenAI', hint: 'sk-...' },
    { id: 'anthropic', name: 'Anthropic', hint: 'sk-ant-...' },
    { id: 'gemini', name: 'Gemini', hint: 'AIza...' }
  ];
  var DEFAULT_MODELS = (window.TStore && window.TStore.DEFAULT_MODELS) || {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-latest',
    gemini: 'gemini-2.5-flash'
  };

  // small dom helper
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    if (window.Icons && typeof Icons[name] === 'function') return Icons[name]();
    return '';
  }

  function cfg() {
    var c = (window.TStore && TStore.getConfig && TStore.getConfig()) || {};
    return {
      provider: c.provider || 'openai',
      keys: c.keys || {},
      models: c.models || {},
      onboarded: !!c.onboarded,
      theme: c.theme || 'light'
    };
  }

  function saveConfig(patch) {
    if (window.TStore && TStore.setConfig) TStore.setConfig(patch);
  }

  // section scaffolding
  function section(title, sub) {
    var s = el('section', 'cfg-section');
    var head = el('div', 'cfg-section-head');
    head.appendChild(el('h2', 'cfg-section-title', title));
    if (sub) head.appendChild(el('p', 'cfg-section-sub', sub));
    s.appendChild(head);
    return s;
  }

  // this is the provider + key + model block
  function renderProviders(root) {
    var s = section(
      'AI provider',
      'Pick which service answers your questions. Add more than one key for a provider and it rotates to the next when one is rate-limited.'
    );

    var current = cfg();

    // segmented active-provider picker
    var seg = el('div', 'cfg-seg');
    var segButtons = {};
    PROVIDERS.forEach(function (p) {
      var b = el('button', 'cfg-seg-btn', p.name);
      b.type = 'button';
      if (current.provider === p.id) b.classList.add('is-active');
      b.addEventListener('click', function () {
        saveConfig({ provider: p.id });
        Object.keys(segButtons).forEach(function (id) {
          segButtons[id].classList.toggle('is-active', id === p.id);
        });
        Object.keys(rows).forEach(function (id) {
          rows[id].classList.toggle('is-active', id === p.id);
        });
        refreshTest();
      });
      segButtons[p.id] = b;
      seg.appendChild(b);
    });
    s.appendChild(seg);

    // per-provider fields
    var rows = {};
    PROVIDERS.forEach(function (p) {
      var row = el('div', 'cfg-provider');
      if (current.provider === p.id) row.classList.add('is-active');

      var top = el('div', 'cfg-provider-top');
      top.appendChild(el('span', 'cfg-provider-name', p.name));
      var badge = el('span', 'cfg-active-badge', 'active');
      top.appendChild(badge);
      row.appendChild(top);

      // one or more api keys — the wrapper rotates to the next when one is busy
      row.appendChild(keyField(
        Array.isArray(current.keys[p.id]) ? current.keys[p.id] : (current.keys[p.id] ? [current.keys[p.id]] : []),
        p.hint,
        function (keysArr) {
          var now = cfg();
          var keys = Object.assign({}, now.keys);
          keys[p.id] = keysArr;
          saveConfig({ keys: keys });
          refreshTest();
        }
      ));

      // editable model
      var modelWrap = el('label', 'cfg-field');
      modelWrap.appendChild(el('span', 'cfg-label', 'Model'));
      var model = el('input', 'cfg-input');
      model.type = 'text';
      model.spellcheck = false;
      model.placeholder = DEFAULT_MODELS[p.id];
      model.value = current.models[p.id] || DEFAULT_MODELS[p.id];
      model.addEventListener('input', function () {
        var now = cfg();
        var models = Object.assign({}, now.models);
        models[p.id] = model.value.trim();
        saveConfig({ models: models });
      });
      modelWrap.appendChild(model);
      row.appendChild(modelWrap);

      rows[p.id] = row;
      s.appendChild(row);
    });

    // test connection for the active provider
    var testRow = el('div', 'cfg-test-row');
    var testBtn = el('button', 'cfg-btn cfg-btn-primary', 'Test connection');
    testBtn.type = 'button';
    var testOut = el('span', 'cfg-test-out');

    function refreshTest() {
      testOut.className = 'cfg-test-out';
      testOut.textContent = '';
    }

    testBtn.addEventListener('click', function () {
      if (!window.AI || !AI.ready || !AI.ready()) {
        testOut.className = 'cfg-test-out is-bad';
        testOut.textContent = 'Add a key for the active provider first.';
        return;
      }
      testBtn.disabled = true;
      testOut.className = 'cfg-test-out is-wait';
      testOut.textContent = 'Pinging the model...';
      var done = false;
      AI.ask({
        system: 'Reply with exactly the word: ok',
        prompt: 'ping',
        json: false
      }).then(function (res) {
        done = true;
        testBtn.disabled = false;
        if (res && res.ok) {
          testOut.className = 'cfg-test-out is-good';
          testOut.textContent = 'Connected.';
        } else {
          testOut.className = 'cfg-test-out is-bad';
          testOut.textContent = 'Failed: ' + short((res && res.error) || 'no response');
        }
      }).catch(function (err) {
        done = true;
        testBtn.disabled = false;
        testOut.className = 'cfg-test-out is-bad';
        testOut.textContent = 'Failed: ' + short(err && err.message ? err.message : 'unknown error');
      });
      // safety so the button never sticks disabled forever
      setTimeout(function () {
        if (!done) {
          testBtn.disabled = false;
        }
      }, 30000);
    });

    testRow.appendChild(testBtn);
    testRow.appendChild(testOut);
    s.appendChild(testRow);

    root.appendChild(s);
  }

  function short(str) {
    str = String(str || '');
    return str.length > 120 ? str.slice(0, 117) + '...' : str;
  }

  function maskKey(k) {
    k = String(k || '');
    if (k.length <= 10) return '••••' + k.slice(-3);
    return k.slice(0, 5) + '…' + k.slice(-4);
  }

  // a list of api keys with an explicit "Add key" button. add several, remove
  // any; the wrapper rotates through them when one is rate-limited. stores the
  // real keys, shows them masked.
  function keyField(keys, hint, onChange) {
    var list = Array.isArray(keys) ? keys.slice() : (keys ? [keys] : []);
    var wrap = el('div', 'cfg-field');
    wrap.appendChild(el('span', 'cfg-label', 'API keys'));

    var box = el('div', 'cfg-keys');

    function commit() { onChange(list.slice()); }

    function paintChips() {
      box.innerHTML = '';
      if (!list.length) {
        box.appendChild(el('span', 'cfg-keys-empty', 'No keys yet — add one below.'));
      }
      list.forEach(function (val, i) {
        var chip = el('span', 'cfg-tag');
        chip.appendChild(el('span', 'cfg-tag-text', maskKey(val)));
        var x = el('button', 'cfg-tag-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove key');
        x.addEventListener('click', function () { list.splice(i, 1); paintChips(); commit(); });
        chip.appendChild(x);
        box.appendChild(chip);
      });
    }

    var addRow = el('div', 'cfg-key-add');
    var input = el('input', 'cfg-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Paste an API key (' + (hint || '') + ')';
    var addBtn = el('button', 'cfg-btn cfg-btn-primary cfg-key-add-btn', 'Add key');
    addBtn.type = 'button';

    function add() {
      var parts = String(input.value || '').split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var added = false;
      parts.forEach(function (k) { if (list.indexOf(k) === -1) { list.push(k); added = true; } });
      if (added) commit();
      input.value = '';
      paintChips();
      input.focus();
    }

    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    addRow.appendChild(input);
    addRow.appendChild(addBtn);

    wrap.appendChild(box);
    wrap.appendChild(addRow);
    paintChips();
    return wrap;
  }

  // this is a reusable tag/chip input backed by an array
  function tagField(labelText, values, onChange) {
    var list = Array.isArray(values) ? values.slice() : [];
    var wrap = el('div', 'cfg-field');
    wrap.appendChild(el('span', 'cfg-label', labelText));
    var box = el('div', 'cfg-tags');

    function commit() {
      onChange(list.slice());
    }

    function paint() {
      box.innerHTML = '';
      list.forEach(function (val, i) {
        var chip = el('span', 'cfg-tag');
        chip.appendChild(el('span', 'cfg-tag-text', val));
        var x = el('button', 'cfg-tag-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove ' + val);
        x.addEventListener('click', function () {
          list.splice(i, 1);
          paint();
          commit();
        });
        chip.appendChild(x);
        box.appendChild(chip);
      });
      box.appendChild(input);
      input.value = '';
    }

    var input = el('input', 'cfg-tag-input');
    input.type = 'text';
    input.placeholder = list.length ? 'Add another...' : 'Type and press Enter';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addFromInput();
      } else if (e.key === 'Backspace' && input.value === '' && list.length) {
        list.pop();
        paint();
        commit();
      }
    });
    input.addEventListener('blur', addFromInput);

    function addFromInput() {
      var raw = input.value.trim().replace(/,+$/, '').trim();
      if (!raw) return;
      var exists = list.some(function (v) {
        return v.toLowerCase() === raw.toLowerCase();
      });
      if (!exists) {
        list.push(raw);
        commit();
      }
      paint();
    }

    box.addEventListener('click', function (e) {
      if (e.target === box) input.focus();
    });

    wrap.appendChild(box);
    paint();
    return wrap;
  }

  // this is the "places i won't go" limits section
  function renderExclusions(root) {
    var s = section(
      'Places to avoid',
      'These limits quietly steer every AI suggestion in the other tabs.'
    );

    var ex = (window.TStore && TStore.getExclusions && TStore.getExclusions()) || {};
    var state = {
      continents: Array.isArray(ex.continents) ? ex.continents : [],
      countries: Array.isArray(ex.countries) ? ex.countries : [],
      places: Array.isArray(ex.places) ? ex.places : [],
      notes: ex.notes || ''
    };

    function persist() {
      if (window.TStore && TStore.setExclusions) TStore.setExclusions(state);
    }

    s.appendChild(tagField('Continents', state.continents, function (v) {
      state.continents = v;
      persist();
    }));
    s.appendChild(tagField('Countries', state.countries, function (v) {
      state.countries = v;
      persist();
    }));
    s.appendChild(tagField('Specific places', state.places, function (v) {
      state.places = v;
      persist();
    }));

    var notesWrap = el('label', 'cfg-field');
    notesWrap.appendChild(el('span', 'cfg-label', 'Other limitations'));
    var notes = el('textarea', 'cfg-input cfg-textarea');
    notes.rows = 3;
    notes.placeholder = 'e.g. no long-haul flights, avoid winter, keep it under a 5 hour drive';
    notes.value = state.notes;
    notes.addEventListener('input', function () {
      state.notes = notes.value;
      persist();
    });
    notesWrap.appendChild(notes);
    s.appendChild(notesWrap);

    root.appendChild(s);
  }

  // this lets you view and remove the places saved from Travel / Explore
  function renderSavedPlaces(root) {
    var s = section('Saved places', 'Places you saved from Travel and Explore. Remove any you no longer want.');
    var list = el('div', 'cfg-places');

    function paint() {
      list.innerHTML = '';
      var places = [];
      try { places = (window.TStore && TStore.places && TStore.places.list()) || []; } catch (e) { places = []; }
      if (!places.length) {
        list.appendChild(el('p', 'cfg-note', 'No saved places yet.'));
        return;
      }
      places.forEach(function (p) {
        var row = el('div', 'cfg-place-row');
        var name = String(p.name || p.hotel || p.title || p.destination || 'Place');
        var area = String(p.city || p.destination || p.region || p.country || '');
        row.appendChild(el('span', 'cfg-place-name', area && area !== name ? name + ' · ' + area : name));
        var rm = el('button', 'cfg-btn cfg-btn-sm cfg-btn-danger', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () {
          try { TStore.places.remove(p.id); } catch (e) {}
          paint();
        });
        row.appendChild(rm);
        list.appendChild(row);
      });
    }

    paint();
    s.appendChild(list);
    root.appendChild(s);
  }

  // this is the export / import section
  function renderData(root) {
    var s = section(
      'Your data',
      'Everything lives on this machine. Back it up or move it to another computer.'
    );

    var hasApi = !!(window.api && window.TStore);
    var btnRow = el('div', 'cfg-btn-row');

    var exportBtn = el('button', 'cfg-btn', 'Export everything');
    exportBtn.type = 'button';
    exportBtn.disabled = !hasApi;
    exportBtn.addEventListener('click', function () {
      if (!window.api || !window.TStore) return;
      var json;
      try {
        json = TStore.exportAll();
      } catch (err) {
        toast('Could not build the backup.');
        return;
      }
      Promise.resolve(api.exportFile({
        suggestedName: 'travsplore-backup.json',
        contents: json
      })).then(function (res) {
        if (res && res.ok) toast('Backup saved.');
        else if (res && res.error) toast('Export failed: ' + short(res.error));
      }).catch(function () {
        toast('Export failed.');
      });
    });

    var importBtn = el('button', 'cfg-btn', 'Import');
    importBtn.type = 'button';
    importBtn.disabled = !hasApi;
    importBtn.addEventListener('click', function () {
      if (!window.api || !window.TStore) return;
      Promise.resolve(api.importFile({ extensions: ['json'] })).then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error) toast('Import failed: ' + short(res.error));
          return;
        }
        var ok = false;
        try {
          ok = TStore.importAll(res.contents);
        } catch (err) {
          ok = false;
        }
        if (ok) {
          toast('Data imported.');
          if (window.App && App.refresh) App.refresh('configure');
        } else {
          toast('That file was not a valid backup.');
        }
      }).catch(function () {
        toast('Import failed.');
      });
    });

    btnRow.appendChild(exportBtn);
    btnRow.appendChild(importBtn);
    s.appendChild(btnRow);

    s.appendChild(el(
      'p',
      'cfg-note',
      hasApi
        ? 'API keys are stored locally on this machine only and are never sent anywhere except the provider you choose.'
        : 'File access is unavailable right now, so backup and import are disabled.'
    ));

    root.appendChild(s);
  }

  // this is theme + onboarding preferences
  function renderPreferences(root) {
    var s = section('Preferences', 'Look and feel, plus a way to see the intro again.');

    var current = cfg();

    var themeWrap = el('div', 'cfg-field');
    themeWrap.appendChild(el('span', 'cfg-label', 'Theme'));
    var themeSeg = el('div', 'cfg-seg cfg-seg-sm');
    var themes = [['light', 'Light'], ['dark', 'Dark']];
    var themeBtns = {};
    themes.forEach(function (t) {
      var b = el('button', 'cfg-seg-btn', t[1]);
      b.type = 'button';
      if (current.theme === t[0]) b.classList.add('is-active');
      b.addEventListener('click', function () {
        setTheme(t[0]);
        Object.keys(themeBtns).forEach(function (id) {
          themeBtns[id].classList.toggle('is-active', id === t[0]);
        });
      });
      themeBtns[t[0]] = b;
      themeSeg.appendChild(b);
    });
    themeWrap.appendChild(themeSeg);
    s.appendChild(themeWrap);

    var replayWrap = el('div', 'cfg-field');
    replayWrap.appendChild(el('span', 'cfg-label', 'Onboarding'));
    var replay = el('button', 'cfg-btn', 'Replay onboarding');
    replay.type = 'button';
    replay.addEventListener('click', function () {
      saveConfig({ onboarded: false });
      if (window.Onboarding && typeof Onboarding.maybeShow === 'function') {
        Onboarding.maybeShow();
      } else {
        toast('Onboarding will show next launch.');
      }
    });
    replayWrap.appendChild(replay);
    s.appendChild(replayWrap);

    root.appendChild(s);
  }

  function setTheme(theme) {
    saveConfig({ theme: theme });
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  }

  function toast(msg) {
    if (window.UI && UI.toast) UI.toast(msg);
  }

  // wire the tab
  if (window.App && App.registerTab) {
    window.App.registerTab('configure', {
      label: 'Configure',
      icon: icon('gear'),
      render: function (container) {
        container.innerHTML = '';
        var root = el('div', 'cfg');
        renderProviders(root);
        renderExclusions(root);
        renderSavedPlaces(root);
        renderData(root);
        renderPreferences(root);
        container.appendChild(root);
      }
    });
  }
})();
