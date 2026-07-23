// this is the compare tab — put travel options side by side
(function () {
  "use strict";

  if (!window.App || !App.registerTab) return;

  var TYPES = ["hotel", "resort", "villa", "room", "airline"];

  // this is the working set for the comparison currently being built
  var items = [];
  var origin = "";
  var lastResult = null; // { rows, pros, cons, pick }
  var currentId = null; // id of a loaded saved comparison
  var refs = {};

  function uid() {
    return "c" + Math.random().toString(36).slice(2, 9);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // this reads a friendly label off a saved place, whatever its shape is
  function placeName(p) {
    return String(
      p.name || p.hotel || p.title || p.destination || p.place || "Saved place"
    );
  }
  function placeCity(p) {
    var c = p.city || p.location || p.region || p.country || "";
    return c ? String(c) : "";
  }

  // this pulls the origin Travel last searched from, so the field pre-fills
  function defaultOrigin() {
    try {
      if (window.TStore && TStore.getConfig) {
        var cfg = TStore.getConfig() || {};
        if (cfg.lastOrigin) return String(cfg.lastOrigin);
      }
    } catch (e) {}
    return "";
  }

  // this turns the exclusions into a short line for the model
  function exclusionsNote() {
    try {
      if (!window.TStore || !TStore.getExclusions) return "";
      var x = TStore.getExclusions() || {};
      var parts = []
        .concat(x.continents || [], x.countries || [], x.places || [])
        .filter(Boolean);
      if (x.notes) parts.push(String(x.notes));
      if (!parts.length) return "";
      return "Avoid / the traveler excludes: " + parts.join(", ") + ".";
    } catch (e) {
      return "";
    }
  }

  function idOf(r) {
    if (typeof r === "string") return r;
    if (r && r.id) return r.id;
    return null;
  }

  // this describes one item to the model
  function itemDesc(it, n) {
    if (it.source === "place") {
      return (
        n +
        ". " +
        it.name +
        (it.city ? " in " + it.city : "") +
        " (hotel)"
      );
    }
    return (
      n +
      ". " +
      it.name +
      " (" +
      it.type +
      (it.context ? ", at " + it.context : "") +
      ")"
    );
  }

  function titleFromItems() {
    var names = items.map(function (it) {
      return it.name;
    });
    if (!names.length) return "Comparison";
    if (names.length <= 3) return names.join(" vs ");
    return names.slice(0, 2).join(" vs ") + " +" + (names.length - 2);
  }

  // ---- item management -------------------------------------------------

  function addPlace(p) {
    var pid = p.id != null ? String(p.id) : null;
    if (
      pid &&
      items.some(function (it) {
        return it.source === "place" && it.placeId === pid;
      })
    ) {
      UI.toast("Already added");
      return;
    }
    items.push({
      id: uid(),
      source: "place",
      placeId: pid,
      name: placeName(p),
      city: placeCity(p),
      type: "hotel"
    });
    renderItems();
  }

  function addCustom() {
    var name = (refs.cName.value || "").trim();
    var type = refs.cType.value || "hotel";
    var context = (refs.cCtx.value || "").trim();
    if (!name) {
      UI.toast("Name the item first");
      refs.cName.focus();
      return;
    }
    items.push({
      id: uid(),
      source: "custom",
      name: name,
      type: type,
      context: context
    });
    refs.cName.value = "";
    refs.cCtx.value = "";
    refs.cName.focus();
    renderItems();
  }

  function removeItem(id) {
    items = items.filter(function (it) {
      return it.id !== id;
    });
    renderItems();
  }

  function renderItems() {
    var box = refs.itemsList;
    box.textContent = "";
    if (!items.length) {
      box.appendChild(el("p", "cmp-hint", "No items yet — add at least two."));
      return;
    }
    items.forEach(function (it) {
      var row = el("div", "cmp-item");
      var main = el("div", "cmp-item-main");
      main.appendChild(el("span", "cmp-item-name", it.name));
      var meta = it.source === "place" ? (it.city || "hotel") : it.type;
      main.appendChild(el("span", "cmp-badge", meta));
      if (it.source === "custom" && it.context) {
        main.appendChild(el("span", "cmp-item-sub", "at " + it.context));
      }
      row.appendChild(main);
      var x = el("button", "cmp-x", "");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + it.name);
      x.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      x.addEventListener("click", function () {
        removeItem(it.id);
      });
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  // ---- add-from-saved picker ------------------------------------------

  function openPicker() {
    var body = el("div", "cmp-picker");
    var places = [];
    try {
      places = (window.TStore && TStore.places && TStore.places.list()) || [];
    } catch (e) {
      places = [];
    }
    if (!places.length) {
      body.appendChild(
        el("p", "cmp-hint", "No saved places yet. Save some in Travel first.")
      );
    } else {
      places.forEach(function (p) {
        var b = el("button", "cmp-pick-row");
        b.type = "button";
        b.appendChild(el("span", "cmp-item-name", placeName(p)));
        var city = placeCity(p);
        if (city) b.appendChild(el("span", "cmp-badge", city));
        b.addEventListener("click", function () {
          addPlace(p);
          UI.toast("Added " + placeName(p));
        });
        body.appendChild(b);
      });
    }
    UI.modal({
      title: "Add from saved",
      bodyEl: body,
      actions: [{ label: "Done", primary: true }]
    });
  }

  // ---- the comparison call --------------------------------------------

  function padArr(a, n) {
    var out = [];
    if (Array.isArray(a)) {
      for (var i = 0; i < a.length; i++) out.push(a[i] == null ? "" : String(a[i]));
    }
    while (out.length < n) out.push("");
    return out.slice(0, n);
  }

  function normalize(data, n) {
    var out = { rows: [], pros: [], cons: [], pick: "" };
    if (!data || typeof data !== "object") return out;
    if (Array.isArray(data.rows)) {
      data.rows.forEach(function (r) {
        if (!r) return;
        var attr = String(r.attr || r.name || r.label || "").trim();
        if (!attr) return;
        var cells = Array.isArray(r.cells) ? r.cells : [];
        cells = cells.map(function (c) {
          return c == null ? "" : String(c);
        });
        while (cells.length < n) cells.push("—");
        out.rows.push({ attr: attr, cells: cells.slice(0, n) });
      });
    }
    out.pros = padArr(data.pros, n);
    out.cons = padArr(data.cons, n);
    out.pick = data.pick
      ? String(data.pick)
      : data.verdict
      ? String(data.verdict)
      : "";
    return out;
  }

  function buildPrompt() {
    var lines = ["Compare these travel items side by side:"];
    items.forEach(function (it, i) {
      lines.push(itemDesc(it, i + 1));
    });
    if (origin) lines.push("Traveler departs from: " + origin + ".");
    var ex = exclusionsNote();
    if (ex) lines.push(ex);
    lines.push(
      "Return JSON: {rows:[{attr, cells:[...]}], pros:[...], cons:[...], pick}. " +
        "Give one cell per item in item order. Cover price tier, capacity, location/setting, standout, and a con. " +
        "pros and cons are one short phrase per item. pick is one short line naming the best overall. Keep every cell to a few words."
    );
    return lines.join("\n");
  }

  function runCompare() {
    if (items.length < 2) {
      UI.toast("Add at least two items");
      return;
    }
    if (!window.AI || !AI.ready || !AI.ready()) {
      UI.toast("Add an API key in Configure first");
      return;
    }
    var n = items.length;
    var stop = UI.spinner(refs.result);
    refs.compareBtn.disabled = true;
    AI.ask({
      system:
        "You compare travel options. Return a compact JSON comparison matrix. Every cell is at most a few words. No preamble.",
      prompt: buildPrompt(),
      json: true
    })
      .then(function (res) {
        stop();
        refs.compareBtn.disabled = false;
        if (!res || !res.ok) {
          showError(res && res.error);
          return;
        }
        var data = res.data;
        if (!data && res.text) {
          try {
            data = JSON.parse(res.text);
          } catch (e) {
            data = null;
          }
        }
        var norm = normalize(data, n);
        if (!norm.rows.length) {
          showError("The model did not return a usable comparison.");
          return;
        }
        lastResult = norm;
        renderResult();
      })
      .catch(function (err) {
        stop();
        refs.compareBtn.disabled = false;
        showError(err && err.message ? err.message : "Comparison failed.");
      });
  }

  function showError(msg) {
    refs.result.textContent = "";
    refs.result.appendChild(
      el("p", "cmp-error", msg || "Something went wrong. Try again.")
    );
  }

  // ---- rendering the result -------------------------------------------

  function renderResult() {
    var host = refs.result;
    host.textContent = "";
    if (!lastResult) return;
    var n = items.length;

    var scroll = el("div", "cmp-scroll");
    var table = el("table", "cmp-table");

    var thead = el("thead");
    var htr = el("tr");
    htr.appendChild(el("th", "cmp-corner", "Attribute"));
    items.forEach(function (it) {
      var th = el("th", "cmp-head");
      th.appendChild(el("span", "cmp-head-name", it.name));
      th.appendChild(
        el("span", "cmp-head-type", it.source === "place" ? "hotel" : it.type)
      );
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el("tbody");
    lastResult.rows.forEach(function (r) {
      var tr = el("tr");
      var rh = el("th", "cmp-rowh", r.attr);
      rh.scope = "row";
      tr.appendChild(rh);
      for (var i = 0; i < n; i++) {
        tr.appendChild(el("td", "cmp-cell", r.cells[i] || "—"));
      }
      tbody.appendChild(tr);
    });

    if (lastResult.pros.some(Boolean)) {
      var pr = el("tr", "cmp-pros");
      var ph = el("th", "cmp-rowh", "Pros");
      ph.scope = "row";
      pr.appendChild(ph);
      lastResult.pros.forEach(function (v) {
        pr.appendChild(el("td", "cmp-cell", v || "—"));
      });
      tbody.appendChild(pr);
    }
    if (lastResult.cons.some(Boolean)) {
      var cr = el("tr", "cmp-cons");
      var ch = el("th", "cmp-rowh", "Cons");
      ch.scope = "row";
      cr.appendChild(ch);
      lastResult.cons.forEach(function (v) {
        cr.appendChild(el("td", "cmp-cell", v || "—"));
      });
      tbody.appendChild(cr);
    }

    table.appendChild(tbody);
    scroll.appendChild(table);
    host.appendChild(scroll);

    if (lastResult.pick) {
      var pick = el("div", "cmp-pick");
      pick.appendChild(el("span", "cmp-pick-label", "Bottom line"));
      pick.appendChild(el("span", "cmp-pick-text", lastResult.pick));
      host.appendChild(pick);
    }

    var actions = el("div", "cmp-result-actions");
    var more = el("button", "cmp-btn cmp-btn-ghost", "Ask more");
    more.type = "button";
    more.addEventListener("click", function () {
      askMore(more);
    });
    actions.appendChild(more);

    var save = el("button", "cmp-btn cmp-btn-primary", "Save comparison");
    save.type = "button";
    save.addEventListener("click", saveCurrent);
    actions.appendChild(save);

    host.appendChild(actions);
  }

  function askMore(btn) {
    if (!lastResult || !window.AI || !AI.ready || !AI.ready()) return;
    var n = items.length;
    var used = lastResult.rows.map(function (r) {
      return r.attr;
    });
    btn.disabled = true;
    var stop = UI.spinner(refs.result);
    var prompt =
      buildPrompt() +
      "\nAdd 3-4 MORE comparison rows with different attributes not already covered. " +
      "Already covered: " +
      used.join(", ") +
      ". Return JSON {rows:[{attr, cells:[...]}]} only, cells in item order, short cells.";
    AI.ask({
      system:
        "You extend a travel comparison. Return only JSON with new rows. Short cells.",
      prompt: prompt,
      json: true
    })
      .then(function (res) {
        stop();
        btn.disabled = false;
        if (!res || !res.ok) return;
        var data = res.data;
        if (!data && res.text) {
          try {
            data = JSON.parse(res.text);
          } catch (e) {
            data = null;
          }
        }
        var extra = normalize(data, n);
        var lower = used.map(function (a) {
          return a.toLowerCase();
        });
        extra.rows.forEach(function (r) {
          if (lower.indexOf(r.attr.toLowerCase()) === -1) {
            lastResult.rows.push(r);
            lower.push(r.attr.toLowerCase());
          }
        });
        renderResult();
      })
      .catch(function () {
        stop();
        btn.disabled = false;
      });
  }

  // ---- saving and reopening -------------------------------------------

  function saveCurrent() {
    if (!window.TStore || !TStore.compares) return;
    var obj = {
      title: titleFromItems(),
      origin: origin,
      items: items.map(function (it) {
        return it;
      }),
      result: lastResult,
      savedAt: Date.now()
    };
    try {
      if (currentId) {
        TStore.compares.update(currentId, obj);
      } else {
        var r = TStore.compares.add(obj);
        currentId = idOf(r) || currentId;
      }
      UI.toast("Comparison saved");
      renderSaved();
    } catch (e) {
      UI.toast("Could not save");
    }
  }

  function newComparison() {
    items = [];
    origin = refs.origin ? refs.origin.value.trim() : "";
    lastResult = null;
    currentId = null;
    renderItems();
    refs.result.textContent = "";
  }

  function openSaved(id) {
    var c = null;
    try {
      c = TStore.compares.get(id);
    } catch (e) {
      c = null;
    }
    if (!c) return;
    items = Array.isArray(c.items) ? c.items.slice() : [];
    origin = c.origin || "";
    lastResult = c.result || null;
    currentId = id;
    if (refs.origin) refs.origin.value = origin;
    renderItems();
    if (lastResult) renderResult();
    else refs.result.textContent = "";
    try {
      refs.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {}
  }

  function renderSaved() {
    var box = refs.saved;
    if (!box) return;
    box.textContent = "";
    var list = [];
    try {
      list = (window.TStore && TStore.compares && TStore.compares.list()) || [];
    } catch (e) {
      list = [];
    }
    if (!list.length) {
      box.appendChild(el("p", "cmp-hint", "No saved comparisons yet."));
      return;
    }
    list
      .slice()
      .reverse()
      .forEach(function (c) {
        var row = el("div", "cmp-saved-row");
        var open = el("button", "cmp-saved-open");
        open.type = "button";
        open.appendChild(el("span", "cmp-item-name", c.title || "Comparison"));
        var count = Array.isArray(c.items) ? c.items.length : 0;
        open.appendChild(el("span", "cmp-badge", count + " items"));
        open.addEventListener("click", function () {
          openSaved(c.id);
        });
        row.appendChild(open);

        var del = el("button", "cmp-x", "");
        del.type = "button";
        del.setAttribute("aria-label", "Delete comparison");
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        del.addEventListener("click", function () {
          try {
            TStore.compares.remove(c.id);
          } catch (e) {}
          if (currentId === c.id) currentId = null;
          renderSaved();
        });
        row.appendChild(del);
        box.appendChild(row);
      });
  }

  function updateReadyNote() {
    if (!refs.note) return;
    var ready = window.AI && AI.ready && AI.ready();
    refs.note.style.display = ready ? "none" : "block";
  }

  // ---- layout ----------------------------------------------------------

  function render(container) {
    container.textContent = "";
    refs = {};

    var head = el("div", "cmp-header");
    head.appendChild(el("h2", "cmp-title", "Compare"));
    head.appendChild(
      el(
        "p",
        "cmp-sub",
        "Line up hotels, resorts, villas, rooms or airlines side by side."
      )
    );
    container.appendChild(head);

    var note = el(
      "div",
      "cmp-note",
      "Add an API key in Configure to run comparisons."
    );
    refs.note = note;
    container.appendChild(note);

    var builder = el("div", "cmp-card");

    // items
    builder.appendChild(el("h3", "cmp-h3", "Items"));
    var itemsList = el("div", "cmp-items");
    refs.itemsList = itemsList;
    builder.appendChild(itemsList);

    var addRow = el("div", "cmp-addrow");
    var fromSaved = el("button", "cmp-btn cmp-btn-ghost", "Add from saved");
    fromSaved.type = "button";
    fromSaved.addEventListener("click", openPicker);
    addRow.appendChild(fromSaved);
    builder.appendChild(addRow);

    // custom item
    var custom = el("div", "cmp-custom");
    var cName = el("input", "cmp-input");
    cName.type = "text";
    cName.placeholder = "Name (e.g. Ocean Suite, Delta)";
    refs.cName = cName;
    custom.appendChild(cName);

    var cType = el("select", "cmp-input cmp-select");
    TYPES.forEach(function (t) {
      var o = el("option", null, t === "room" ? "room (in a hotel)" : t);
      o.value = t;
      cType.appendChild(o);
    });
    refs.cType = cType;
    custom.appendChild(cType);

    var cCtx = el("input", "cmp-input");
    cCtx.type = "text";
    cCtx.placeholder = "Details / which hotel (optional)";
    refs.cCtx = cCtx;
    custom.appendChild(cCtx);

    var addCustomBtn = el("button", "cmp-btn cmp-btn-ghost", "Add");
    addCustomBtn.type = "button";
    addCustomBtn.addEventListener("click", addCustom);
    custom.appendChild(addCustomBtn);
    builder.appendChild(custom);

    cName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addCustom();
    });

    // origin
    var originWrap = el("div", "cmp-origin");
    var oLabel = el("label", "cmp-label", "From where? (for airlines/routes)");
    oLabel.setAttribute("for", "cmp-origin-input");
    originWrap.appendChild(oLabel);
    var oInput = el("input", "cmp-input");
    oInput.type = "text";
    oInput.id = "cmp-origin-input";
    oInput.placeholder = "e.g. New York (JFK)";
    oInput.addEventListener("input", function () {
      origin = oInput.value.trim();
    });
    refs.origin = oInput;
    originWrap.appendChild(oInput);
    builder.appendChild(originWrap);

    // actions
    var actions = el("div", "cmp-actions");
    var compareBtn = el("button", "cmp-btn cmp-btn-primary", "Compare");
    compareBtn.type = "button";
    compareBtn.addEventListener("click", runCompare);
    refs.compareBtn = compareBtn;
    actions.appendChild(compareBtn);

    var clearBtn = el("button", "cmp-btn cmp-btn-ghost", "New");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", newComparison);
    actions.appendChild(clearBtn);
    builder.appendChild(actions);

    container.appendChild(builder);

    // result
    var result = el("div", "cmp-result");
    refs.result = result;
    container.appendChild(result);

    // saved
    var savedWrap = el("div", "cmp-saved");
    savedWrap.appendChild(el("h3", "cmp-h3", "Saved comparisons"));
    var savedList = el("div", "cmp-saved-list");
    refs.saved = savedList;
    savedWrap.appendChild(savedList);
    container.appendChild(savedWrap);

    origin = defaultOrigin();
    oInput.value = origin;
    renderItems();
    renderSaved();
    updateReadyNote();
  }

  function onShow() {
    if (refs.origin && !refs.origin.value) {
      origin = defaultOrigin();
      refs.origin.value = origin;
    }
    renderSaved();
    updateReadyNote();
  }

  App.registerTab("compare", {
    label: "Compare",
    icon: window.Icons && Icons.scale ? Icons.scale() : "",
    render: render,
    onShow: onShow
  });
})();
