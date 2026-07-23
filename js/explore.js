// this is the explore tab — pick a saved place or type any hotel, then gather
// everything about it (analysis + real walkthrough/floor-plan/map links) inside the app

(function () {
  "use strict";

  if (!window.App || !App.registerTab) return;

  // per-render working state
  var refs = {};
  var selectedPlaceId = "";   // id of the saved place being explored, "" when ad-hoc
  var current = null;         // last gathered bundle in memory { hotel, city, summary, pros, cons, ideas, resources }
  var previewUrl = "";        // url currently loaded in the embed
  var zoom = 1;               // zoom factor applied to the embedded site
  // present a normal desktop-chrome user agent so sites do not deny an "electron" client
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // read a friendly name / city off a saved place, tolerant of shape
  function placeName(p) {
    return String(p.name || p.hotel || p.title || p.destination || "Saved place");
  }
  function placeCity(p) {
    return String(p.city || p.destination || p.region || p.location || p.country || "");
  }
  function placeLabel(p) {
    var city = placeCity(p);
    return city ? placeName(p) + " · " + city : placeName(p);
  }

  // ---- deterministic resources -----------------------------------------
  // every url here is built by app code from the hotel + city and encoded.
  // nothing is invented by the model.

  function q(s) {
    return encodeURIComponent(String(s || "").trim());
  }

  // lucky-search url — lands straight on the top real result for a query. it is
  // grounded (never a hallucinated / unrelated domain) and location-specific, so
  // for a big chain like ritz-carlton it hits the exact property page, not the
  // generic corporate homepage.
  function lucky(query) {
    return "https://duckduckgo.com/?q=" + encodeURIComponent("!ducky " + query);
  }

  function buildResources(hotel, city) {
    var base = hotel + (city ? " " + city : "");
    var bImg = "https://www.bing.com/images/search?q=";
    return [
      { kind: "site", label: "Website", url: lucky(base + " official website") },
      { kind: "site", label: "Accommodations", url: lucky(base + " rooms accommodation") },
      { kind: "site", label: "Booking", url: lucky(base + " booking reserve a room") },
      { kind: "images", label: "Photos", url: bImg + q(base) },
      { kind: "site", label: "Map", url: "https://www.google.com/maps/search/?api=1&query=" + q(base) },
      { kind: "floorplan", label: "Floor plan", url: bImg + q(base + " floor plan") }
    ];
  }

  // ---- the analysis call -----------------------------------------------

  function exclusionNote() {
    try {
      if (!window.TStore || !TStore.getExclusions) return "";
      var x = TStore.getExclusions() || {};
      var parts = [].concat(x.continents || [], x.countries || [], x.places || []).filter(Boolean);
      if (x.notes) parts.push(String(x.notes));
      if (!parts.length) return "";
      return "Traveler avoids: " + parts.join(", ") + ".";
    } catch (e) {
      return "";
    }
  }

  function analysisPrompt(hotel, city) {
    var lines = [];
    lines.push("Hotel / stay: " + hotel + ".");
    if (city) lines.push("City / area: " + city + ".");
    var ex = exclusionNote();
    if (ex) lines.push(ex);
    lines.push(
      'Return JSON: {"summary": "one or two short lines", "pros": [..], "cons": [..], "ideas": [..]}. ' +
      '"ideas" are short tips on how to make the rooms/space work for a stay. ' +
      "3 to 4 items per list, each a few words. No preamble."
    );
    return lines.join("\n");
  }

  function pickArr(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return String(x == null ? "" : x).trim(); }).filter(Boolean);
  }

  // ---- rendering the tab -----------------------------------------------

  function render(container) {
    container.textContent = "";
    refs = {};

    var head = el("div", "ex-header");
    head.appendChild(el("h2", "ex-title", "Explore"));
    head.appendChild(el("p", "ex-sub", "Pick a saved place — or name any hotel — and pull everything about it into one view."));
    container.appendChild(head);

    var note = el("div", "ex-note", "Add an API key in Configure to run an analysis.");
    refs.note = note;
    container.appendChild(note);

    // picker card
    var card = el("div", "ex-card");

    var pickField = el("label", "ex-field");
    pickField.appendChild(el("span", "ex-label", "Saved place"));
    var sel = el("select", "ex-input");
    refs.sel = sel;
    pickField.appendChild(sel);
    card.appendChild(pickField);

    card.appendChild(el("div", "ex-or", "or explore any hotel"));

    var grid = el("div", "ex-grid");

    var nameField = el("label", "ex-field");
    nameField.appendChild(el("span", "ex-label", "Hotel name"));
    var nameIn = el("input", "ex-input");
    nameIn.type = "text";
    nameIn.placeholder = "e.g. The Brando";
    refs.name = nameIn;
    nameField.appendChild(nameIn);
    grid.appendChild(nameField);

    var cityField = el("label", "ex-field");
    cityField.appendChild(el("span", "ex-label", "City / area"));
    var cityIn = el("input", "ex-input");
    cityIn.type = "text";
    cityIn.placeholder = "e.g. Tetiaroa";
    refs.city = cityIn;
    cityField.appendChild(cityIn);
    grid.appendChild(cityField);

    card.appendChild(grid);

    // typing a name by hand means we are no longer tied to the saved place
    nameIn.addEventListener("input", function () {
      selectedPlaceId = "";
      if (sel.value) sel.value = "";
    });

    sel.addEventListener("change", function () {
      selectedPlaceId = sel.value || "";
      if (selectedPlaceId) {
        var p = TStore.places.get(selectedPlaceId);
        if (p) {
          nameIn.value = placeName(p);
          cityIn.value = placeCity(p);
        }
      }
    });

    var actions = el("div", "ex-actions");
    var goBtn = el("button", "ex-btn ex-btn-primary", "Explore");
    goBtn.type = "button";
    goBtn.addEventListener("click", runExplore);
    refs.go = goBtn;
    actions.appendChild(goBtn);
    card.appendChild(actions);

    container.appendChild(card);

    // results host
    var result = el("div", "ex-result");
    refs.result = result;
    container.appendChild(result);

    fillPlaces();
    updateReadyNote();
  }

  function fillPlaces() {
    var sel = refs.sel;
    if (!sel) return;
    sel.textContent = "";
    var none = el("option", null, "— none —");
    none.value = "";
    sel.appendChild(none);
    var places = [];
    try {
      places = (TStore.places && TStore.places.list()) || [];
    } catch (e) {
      places = [];
    }
    places.forEach(function (p) {
      var o = el("option", null, placeLabel(p));
      o.value = p.id;
      sel.appendChild(o);
    });
    if (selectedPlaceId) sel.value = selectedPlaceId;
  }

  function updateReadyNote() {
    if (!refs.note) return;
    var ready = window.AI && AI.ready && AI.ready();
    refs.note.style.display = ready ? "none" : "block";
  }

  // ---- run --------------------------------------------------------------

  function runExplore() {
    var hotel = (refs.name.value || "").trim();
    var city = (refs.city.value || "").trim();
    if (!hotel) {
      UI.toast("Name a hotel or pick a saved place");
      refs.name.focus();
      return;
    }
    if (!window.AI || !AI.ready || !AI.ready()) {
      UI.toast("Add an API key in Configure first");
      return;
    }

    var resources = buildResources(hotel, city);
    var host = refs.result;
    host.textContent = "";
    var stop = UI.spinner(host);
    refs.go.disabled = true;

    AI.ask({
      json: true,
      system: "You analyze a specific hotel or stay for a traveler. Be concise and honest. No preamble.",
      prompt: analysisPrompt(hotel, city)
    }).then(function (res) {
      stop();
      refs.go.disabled = false;
      if (!res || !res.ok) {
        showError(res && res.error);
        // still show resources even if the analysis failed
        current = { hotel: hotel, city: city, summary: "", pros: [], cons: [], ideas: [], resources: resources };
        renderResources(host, resources);
        return;
      }
      var d = res.data || {};
      var enriched = buildResources(hotel, city);
      current = {
        hotel: hotel,
        city: city,
        summary: typeof d.summary === "string" ? d.summary : "",
        pros: pickArr(d.pros),
        cons: pickArr(d.cons),
        ideas: pickArr(d.ideas),
        resources: enriched
      };
      renderResult(host);
      persistBundle();
    }).catch(function () {
      stop();
      refs.go.disabled = false;
      showError("Something went wrong reaching the model.");
    });
  }

  function showError(msg) {
    var box = el("div", "ex-inline-err", msg ? String(msg) : "Something went wrong. Try again.");
    refs.result.appendChild(box);
  }

  // ---- result rendering -------------------------------------------------

  function renderResult(host) {
    host.textContent = "";

    var title = el("div", "ex-result-head");
    title.appendChild(el("h3", "ex-h3", current.hotel));
    if (current.city) title.appendChild(el("span", "ex-result-city", current.city));
    host.appendChild(title);

    if (current.summary) {
      host.appendChild(el("p", "ex-summary", current.summary));
    }

    var lists = el("div", "ex-lists");
    lists.appendChild(listBlock("Pros", "ex-pros", current.pros));
    lists.appendChild(listBlock("Cons", "ex-cons", current.cons));
    lists.appendChild(listBlock("Ideas", "ex-ideas", current.ideas));
    refs.lists = lists;
    host.appendChild(lists);

    // ask more — deepens pros / cons / ideas
    var moreRow = el("div", "ex-more-row");
    var moreBtn = el("button", "ex-btn ex-btn-ghost", "Ask more");
    moreBtn.type = "button";
    moreBtn.addEventListener("click", function () { askMore(moreBtn); });
    refs.more = moreBtn;
    moreRow.appendChild(moreBtn);

    if (selectedPlaceId) {
      var savedTag = el("span", "ex-saved-tag", "Saved to this place");
      moreRow.appendChild(savedTag);
    } else {
      var saveBtn = el("button", "ex-btn ex-btn-ghost", "Save as place");
      saveBtn.type = "button";
      saveBtn.addEventListener("click", function () { saveAsPlace(saveBtn); });
      moreRow.appendChild(saveBtn);
    }
    host.appendChild(moreRow);

    renderResources(host, current.resources);
  }

  function listBlock(title, cls, items) {
    var block = el("div", "ex-block " + cls);
    block.appendChild(el("h4", "ex-block-title", title));
    var ul = el("ul", "ex-list");
    block._ul = ul;
    if (!items.length) {
      ul.appendChild(el("li", "ex-list-empty", "—"));
    } else {
      items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    }
    block.appendChild(ul);
    return block;
  }

  // ---- resources + preview ---------------------------------------------

  function renderResources(host, resources) {
    var wrap = el("div", "ex-resources");
    wrap.appendChild(el("h4", "ex-block-title", "Look inside"));

    var chips = el("div", "ex-chips");
    resources.forEach(function (r) {
      var chip = el("button", "ex-chip", r.label);
      chip.type = "button";
      chip.setAttribute("data-kind", r.kind);
      chip.addEventListener("click", function () {
        setActiveChip(chips, chip);
        openPreview(r.url);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    host.appendChild(wrap);

    // preview pane
    var pane = el("div", "ex-preview");
    var bar = el("div", "ex-preview-bar");
    var urlLabel = el("span", "ex-preview-url", "Pick a resource above to preview it here.");
    refs.previewUrlLabel = urlLabel;
    bar.appendChild(urlLabel);

    var zoomGroup = el("div", "ex-zoom");
    var zoomOut = el("button", "ex-btn ex-btn-ghost ex-btn-sm ex-zoom-btn", "−");
    zoomOut.type = "button";
    zoomOut.title = "Zoom out";
    zoomOut.addEventListener("click", function () { setZoom(-0.15); });
    var zoomLabel = el("span", "ex-zoom-label", "100%");
    refs.zoomLabel = zoomLabel;
    var zoomIn = el("button", "ex-btn ex-btn-ghost ex-btn-sm ex-zoom-btn", "+");
    zoomIn.type = "button";
    zoomIn.title = "Zoom in";
    zoomIn.addEventListener("click", function () { setZoom(0.15); });
    zoomGroup.appendChild(zoomOut);
    zoomGroup.appendChild(zoomLabel);
    zoomGroup.appendChild(zoomIn);
    bar.appendChild(zoomGroup);

    var openBtn = el("button", "ex-btn ex-btn-ghost ex-btn-sm", "Open externally");
    openBtn.type = "button";
    openBtn.disabled = true;
    openBtn.addEventListener("click", function () {
      if (previewUrl && window.api && window.api.openExternal) window.api.openExternal(previewUrl);
    });
    refs.openBtn = openBtn;
    bar.appendChild(openBtn);
    pane.appendChild(bar);

    var stage = el("div", "ex-stage");
    refs.stage = stage;
    stage.appendChild(el("div", "ex-stage-empty", "No preview loaded yet."));
    pane.appendChild(stage);

    var blocked = el("div", "ex-preview-note");
    blocked.style.display = "none";
    refs.blockedNote = blocked;
    pane.appendChild(blocked);

    host.appendChild(pane);

    // lead with the property's own site so everything from it is right there
    var firstChip = chips.querySelector(".ex-chip");
    if (firstChip && resources.length) {
      setActiveChip(chips, firstChip);
      openPreview(resources[0].url);
    }
  }

  function setActiveChip(chips, active) {
    chips.querySelectorAll(".ex-chip").forEach(function (c) { c.classList.remove("is-active"); });
    active.classList.add("is-active");
  }

  // everything loads in a webview (a real browser view). maps use the full google
  // maps page too, so scrolling zooms the map instead of the whole tab.
  function openPreview(url) {
    previewUrl = url;
    if (refs.previewUrlLabel) refs.previewUrlLabel.textContent = url;
    if (refs.openBtn) refs.openBtn.disabled = false;
    if (refs.blockedNote) refs.blockedNote.style.display = "none";

    var stage = refs.stage;
    if (!stage) return;
    stage.textContent = "";
    refs.wv = null;

    // no in-app browser available — fall back to the OS browser
    if (!window.api) {
      showBlocked("Preview needs the desktop app. Use Open externally.");
      return;
    }

    var wv = document.createElement("webview");
    wv.className = "ex-embed";
    wv.setAttribute("allowpopups", "");
    wv.setAttribute("useragent", UA);
    refs.wv = wv;
    var loading = el("div", "ex-stage-empty", "Loading…");
    stage.appendChild(loading);

    wv.addEventListener("dom-ready", applyZoom);
    wv.addEventListener("did-stop-loading", function () {
      if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    });
    wv.addEventListener("did-fail-load", function (e) {
      // -3 is an aborted load (redirects), not a real failure
      if (e && e.errorCode === -3) return;
      showBlocked("This site declined to load in the preview. Use Open externally.");
    });

    stage.appendChild(wv);
    // set src after it is in the dom so the guest process attaches cleanly
    wv.setAttribute("src", url);
  }

  // zoom the embedded site (helps get around cookie/newsletter popups that block
  // scrolling); persists across previews
  function applyZoom() {
    if (refs.wv && typeof refs.wv.setZoomFactor === "function") {
      try { refs.wv.setZoomFactor(zoom); } catch (e) {}
    }
    if (refs.zoomLabel) refs.zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  function setZoom(delta) {
    zoom = Math.max(0.5, Math.min(2.5, Math.round((zoom + delta) * 100) / 100));
    applyZoom();
  }

  function showBlocked(msg) {
    if (!refs.blockedNote) return;
    refs.blockedNote.textContent = msg;
    refs.blockedNote.style.display = "block";
  }

  // ---- ask more ---------------------------------------------------------

  function askMore(btn) {
    if (!current || !window.AI || !AI.ready || !AI.ready()) return;
    btn.disabled = true;
    var stop = UI.spinner(btn);
    var prompt =
      "Hotel / stay: " + current.hotel + (current.city ? " (" + current.city + ")" : "") + ".\n" +
      "Already noted pros: " + (current.pros.join("; ") || "none") + ".\n" +
      "Already noted cons: " + (current.cons.join("; ") || "none") + ".\n" +
      "Already noted ideas: " + (current.ideas.join("; ") || "none") + ".\n" +
      'Add 2 to 3 NEW short items to each. Return JSON {"pros":[..],"cons":[..],"ideas":[..]} only.';
    AI.ask({
      json: true,
      system: "You extend a hotel analysis. Return only JSON with new short items. No repeats.",
      prompt: prompt
    }).then(function (res) {
      stop();
      btn.disabled = false;
      if (!res || !res.ok) {
        UI.toast((res && res.error) || "Could not load more");
        return;
      }
      var d = res.data || {};
      mergeInto("pros", pickArr(d.pros));
      mergeInto("cons", pickArr(d.cons));
      mergeInto("ideas", pickArr(d.ideas));
      redrawLists();
      persistBundle();
    }).catch(function () {
      stop();
      btn.disabled = false;
      UI.toast("Something went wrong");
    });
  }

  function mergeInto(key, extra) {
    var have = current[key].map(function (x) { return x.toLowerCase(); });
    extra.forEach(function (t) {
      if (have.indexOf(t.toLowerCase()) === -1) {
        current[key].push(t);
        have.push(t.toLowerCase());
      }
    });
  }

  function redrawLists() {
    if (!refs.lists) return;
    var pairs = [[".ex-pros", current.pros], [".ex-cons", current.cons], [".ex-ideas", current.ideas]];
    pairs.forEach(function (pair) {
      var block = refs.lists.querySelector(pair[0]);
      if (!block || !block._ul) return;
      var ul = block._ul;
      ul.textContent = "";
      if (!pair[1].length) {
        ul.appendChild(el("li", "ex-list-empty", "—"));
      } else {
        pair[1].forEach(function (t) { ul.appendChild(el("li", null, t)); });
      }
    });
  }

  // ---- persistence ------------------------------------------------------

  // the bundle plan reads is place.explore = { summary, pros, cons, ideas, resources }
  function bundle() {
    return {
      summary: current.summary,
      pros: current.pros.slice(),
      cons: current.cons.slice(),
      ideas: current.ideas.slice(),
      resources: current.resources.map(function (r) {
        return { label: r.label, url: r.url, kind: r.kind };
      }),
      updatedAt: Date.now()
    };
  }

  function persistBundle() {
    if (!selectedPlaceId || !current) return;
    try {
      TStore.places.update(selectedPlaceId, { explore: bundle() });
    } catch (e) {}
  }

  function saveAsPlace(btn) {
    if (!current) return;
    try {
      var id = TStore.places.add({
        name: current.hotel,
        city: current.city,
        destination: current.city,
        savedAt: Date.now(),
        explore: bundle()
      });
      if (typeof id === "string") selectedPlaceId = id;
      else if (id && id.id) selectedPlaceId = id.id;
      fillPlaces();
      if (refs.sel) refs.sel.value = selectedPlaceId;
      btn.textContent = "Saved";
      btn.disabled = true;
      UI.toast("Saved to your places");
    } catch (e) {
      UI.toast("Could not save");
    }
  }

  // ---- tab wiring -------------------------------------------------------

  function onShow() {
    fillPlaces();
    updateReadyNote();
  }

  App.registerTab("explore", {
    label: "Explore",
    icon: window.Icons && Icons.compass ? Icons.compass() : "",
    render: render,
    onShow: onShow
  });
})();
