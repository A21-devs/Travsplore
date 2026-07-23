// this is the plan tab. build and save full trips, then export to pdf.

(function () {
  const S = window.TStore;
  const UI = window.UI;
  const AI = window.AI;

  // module state: which plan is open in the editor (null = list view)
  let openId = null;

  function icon() {
    return (window.Icons && Icons.clipboard) ? Icons.clipboard() : "";
  }

  // small dom helper
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") n.className = attrs[k];
        else if (k === "text") n.textContent = attrs[k];
        else if (k === "html") n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") {
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function uid() {
    return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // normalize a stored plan so the editor never trips on missing fields
  function normalize(p) {
    p = p || {};
    return {
      id: p.id,
      title: typeof p.title === "string" ? p.title : "",
      placeId: p.placeId || "",
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      overview: typeof p.overview === "string" ? p.overview : "",
      packing: Array.isArray(p.packing) ? p.packing.slice() : [],
      itinerary: Array.isArray(p.itinerary) ? p.itinerary.slice() : [],
      included: Array.isArray(p.included) ? p.included : []
    };
  }

  // pull the explore bundle off a saved place, tolerant of shape
  function exploreOf(place) {
    const ex = (place && place.explore) || {};
    const arr = function (v) { return Array.isArray(v) ? v : []; };
    return {
      pros: arr(ex.pros).map(String),
      ideas: arr(ex.ideas).map(String),
      resources: arr(ex.resources).map(function (r) {
        if (r && typeof r === "object") {
          return { label: String(r.label || r.name || r.title || r.url || "resource"), url: String(r.url || "") };
        }
        return { label: String(r), url: "" };
      })
    };
  }

  function placeLabel(place) {
    if (!place) return "";
    const name = place.name || place.title || "Untitled place";
    return place.city ? name + " · " + place.city : name;
  }

  function save(patch) {
    if (!openId) return;
    S.plans.update(openId, patch);
  }

  // ----- list view -----

  function renderList(container) {
    container.innerHTML = "";
    const root = el("div", { class: "plan-wrap" });

    const head = el("div", { class: "plan-head" }, [
      el("div", {}, [
        el("h2", { class: "plan-title", text: "Plans" }),
        el("p", { class: "plan-sub", text: "Build a full trip, then save it as a PDF." })
      ]),
      el("button", { class: "plan-btn primary", onclick: newPlan }, ["New plan"])
    ]);
    root.appendChild(head);

    const plans = S.plans.list() || [];
    if (!plans.length) {
      const empty = el("div", {});
      UI.empty(empty, "No plans yet. Start one to map out a trip.");
      root.appendChild(empty);
      container.appendChild(root);
      return;
    }

    const grid = el("div", { class: "plan-grid" });
    plans.forEach(function (raw) {
      const p = normalize(raw);
      const place = p.placeId ? S.places.get(p.placeId) : null;
      const dates = fmtRange(p.startDate, p.endDate);
      const card = el("div", { class: "plan-card", onclick: function () { openId = raw.id; renderEditor(container); } }, [
        el("div", { class: "plan-card-title", text: p.title || "Untitled plan" }),
        place ? el("div", { class: "plan-card-meta", text: placeLabel(place) }) : null,
        dates ? el("div", { class: "plan-card-meta", text: dates }) : null,
        el("div", { class: "plan-card-foot" }, [
          el("span", { class: "plan-card-count", text: p.packing.length + " to pack · " + p.itinerary.length + " days" }),
          el("button", {
            class: "plan-icon-btn danger", title: "Delete plan",
            onclick: function (e) { e.stopPropagation(); confirmDelete(raw.id, p.title, container); }
          }, ["Delete"])
        ])
      ]);
      grid.appendChild(card);
    });
    root.appendChild(grid);
    container.appendChild(root);
  }

  function newPlan() {
    const seed = { title: "Untitled plan", placeId: "", startDate: "", endDate: "", overview: "", packing: [], itinerary: [], included: [] };
    const created = S.plans.add(seed);
    const id = typeof created === "string" ? created : (created && (created.id || created._id));
    if (id && typeof created !== "string") {
      // add returned the object; nothing more to do
    } else if (id) {
      S.plans.update(id, seed);
    }
    openId = id;
    const container = document.getElementById("tab-plan");
    if (container) renderEditor(container);
  }

  function confirmDelete(id, title, container) {
    UI.modal({
      title: "Delete plan",
      html: "<p>Delete “" + UI.escape(title || "Untitled plan") + "”? This can’t be undone.</p>",
      actions: [
        { label: "Cancel" },
        { label: "Delete", primary: true, onClick: function () {
          S.plans.remove(id);
          if (openId === id) openId = null;
          UI.toast("Plan deleted");
          renderList(container);
        } }
      ]
    });
  }

  // ----- editor view -----

  function renderEditor(container) {
    const raw = openId ? S.plans.get(openId) : null;
    if (!raw) { openId = null; return renderList(container); }
    const p = normalize(raw);

    container.innerHTML = "";
    const root = el("div", { class: "plan-wrap" });

    const head = el("div", { class: "plan-head" }, [
      el("button", { class: "plan-btn ghost", onclick: function () { openId = null; renderList(container); } }, ["← All plans"]),
      el("div", { class: "plan-head-actions" }, [
        el("button", { class: "plan-btn primary", onclick: function () { exportPdf(container); } }, ["Save as PDF"])
      ])
    ]);
    root.appendChild(head);

    // title
    const titleInput = el("input", {
      class: "plan-title-input", type: "text", value: p.title, placeholder: "Trip title",
      oninput: function () { save({ title: titleInput.value }); }
    });
    root.appendChild(titleInput);

    // place + dates row
    const places = S.places.list() || [];
    const sel = el("select", { class: "plan-input", onchange: function () { save({ placeId: sel.value }); renderIncludedControls(); } });
    sel.appendChild(el("option", { value: "", text: "No linked place" }));
    places.forEach(function (pl) {
      const opt = el("option", { value: pl.id, text: placeLabel(pl) });
      if (pl.id === p.placeId) opt.selected = true;
      sel.appendChild(opt);
    });

    const start = el("input", { class: "plan-input", type: "date", value: p.startDate, oninput: function () { save({ startDate: start.value }); } });
    const end = el("input", { class: "plan-input", type: "date", value: p.endDate, oninput: function () { save({ endDate: end.value }); } });

    root.appendChild(field("Linked place", sel));
    const dateRow = el("div", { class: "plan-row-2" }, [field("Start", start), field("End", end)]);
    root.appendChild(dateRow);

    // overview
    const overview = el("textarea", {
      class: "plan-input plan-area", rows: "3", placeholder: "What is this trip about?",
      oninput: function () { save({ overview: overview.value }); }
    });
    overview.value = p.overview;
    root.appendChild(field("Overview", overview));

    // packing
    root.appendChild(sectionHeader("Packing", packingAction()));
    const packList = el("div", { class: "plan-list", id: "plan-pack-list" });
    root.appendChild(packList);
    const packAdd = el("div", { class: "plan-add-row" });
    const packInput = el("input", { class: "plan-input", type: "text", placeholder: "Add an item…" });
    function addPack() {
      const t = packInput.value.trim();
      if (!t) return;
      const cur = normalize(S.plans.get(openId)).packing;
      cur.push({ id: uid(), text: t });
      save({ packing: cur });
      packInput.value = "";
      drawPacking(packList);
      packInput.focus();
    }
    packInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addPack(); } });
    packAdd.appendChild(packInput);
    packAdd.appendChild(el("button", { class: "plan-btn", onclick: addPack }, ["Add"]));
    root.appendChild(packAdd);
    drawPacking(packList);

    // itinerary
    root.appendChild(sectionHeader("Itinerary", el("button", { class: "plan-btn", onclick: function () { addDay(itinBox); } }, ["Add day"])));
    const itinBox = el("div", { class: "plan-days", id: "plan-itin" });
    root.appendChild(itinBox);
    drawItinerary(itinBox);

    // included from explore
    root.appendChild(sectionHeader("From Explore", el("button", { class: "plan-btn", id: "plan-pull-btn", onclick: function () { openPullModal(container); } }, ["Pull in items"])));
    const incBox = el("div", { class: "plan-inc", id: "plan-inc" });
    root.appendChild(incBox);
    drawIncluded(incBox);

    container.appendChild(root);

    function renderIncludedControls() {
      // place changed: refresh the pull button availability note
      drawIncluded(incBox);
    }
  }

  function field(label, control) {
    return el("label", { class: "plan-field" }, [el("span", { class: "plan-label", text: label }), control]);
  }

  function sectionHeader(title, action) {
    return el("div", { class: "plan-section" }, [el("h3", { class: "plan-h3", text: title }), action || null]);
  }

  // ----- packing -----

  function drawPacking(list) {
    list.innerHTML = "";
    const p = normalize(S.plans.get(openId));
    if (!p.packing.length) {
      list.appendChild(el("div", { class: "plan-muted", text: "Nothing packed yet." }));
      return;
    }
    p.packing.forEach(function (item) {
      const row = el("div", { class: "plan-item" }, [
        el("span", { class: "plan-item-text", text: item.text }),
        el("button", { class: "plan-icon-btn", title: "Remove", onclick: function () {
          const cur = normalize(S.plans.get(openId)).packing.filter(function (x) { return x.id !== item.id; });
          save({ packing: cur });
          drawPacking(list);
        } }, ["×"])
      ]);
      list.appendChild(row);
    });
  }

  function packingAction() {
    const btn = el("button", { class: "plan-btn", onclick: function () { suggestPacking(btn); } }, ["Suggest packing"]);
    return btn;
  }

  function suggestPacking(btn) {
    if (!AI || !AI.ready || !AI.ready()) {
      UI.toast("Add an API key in Configure to get suggestions");
      return;
    }
    const p = normalize(S.plans.get(openId));
    const place = p.placeId ? S.places.get(p.placeId) : null;
    const where = place ? placeLabel(place) : (p.title || "a trip");
    const dates = fmtRange(p.startDate, p.endDate);
    const stop = UI.spinner(btn);
    btn.disabled = true;
    AI.ask({
      system: "You help pack for trips. Reply with a JSON object {\"items\":[\"...\"]} of 8-12 short packing items. No sentences.",
      prompt: "Trip: " + where + (dates ? " (" + dates + ")" : "") + ". Suggest a short starter packing list.",
      json: true
    }).then(function (res) {
      stop(); btn.disabled = false;
      if (!res || !res.ok) { UI.toast((res && res.error) || "Could not get suggestions"); return; }
      const items = extractList(res.data, res.text);
      if (!items.length) { UI.toast("No items came back"); return; }
      mergePacking(items);
      const list = document.getElementById("plan-pack-list");
      if (list) drawPacking(list);
      UI.toast("Added " + items.length + " suggestions");
    }).catch(function () { stop(); btn.disabled = false; UI.toast("Something went wrong"); });
  }

  function extractList(data, text) {
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.items)) arr = data.items;
    else if (data && Array.isArray(data.packing)) arr = data.packing;
    else if (data && Array.isArray(data.list)) arr = data.list;
    else if (typeof text === "string") {
      arr = text.split(/\r?\n/).map(function (l) { return l.replace(/^[\s\-*•\d.\)]+/, "").trim(); });
    }
    return arr.map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 20);
  }

  function mergePacking(items) {
    const cur = normalize(S.plans.get(openId)).packing;
    const have = cur.map(function (x) { return String(x.text).toLowerCase(); });
    items.forEach(function (t) {
      const key = t.toLowerCase();
      if (have.indexOf(key) === -1) { cur.push({ id: uid(), text: t }); have.push(key); }
    });
    save({ packing: cur });
  }

  // ----- itinerary -----

  function drawItinerary(box) {
    box.innerHTML = "";
    const p = normalize(S.plans.get(openId));
    if (!p.itinerary.length) {
      box.appendChild(el("div", { class: "plan-muted", text: "No days yet. Add one to sketch the itinerary." }));
      return;
    }
    p.itinerary.forEach(function (day, idx) {
      const titleIn = el("input", { class: "plan-day-title", type: "text", value: day.title || ("Day " + (idx + 1)), oninput: function () {
        updateDay(day.id, { title: titleIn.value });
      } });
      const notes = el("textarea", { class: "plan-input plan-area", rows: "2", placeholder: "Plans for this day…", oninput: function () {
        updateDay(day.id, { notes: notes.value });
      } });
      notes.value = day.notes || "";
      const card = el("div", { class: "plan-day" }, [
        el("div", { class: "plan-day-head" }, [
          titleIn,
          el("button", { class: "plan-icon-btn", title: "Remove day", onclick: function () {
            const cur = normalize(S.plans.get(openId)).itinerary.filter(function (d) { return d.id !== day.id; });
            save({ itinerary: cur });
            drawItinerary(box);
          } }, ["×"])
        ]),
        notes
      ]);
      box.appendChild(card);
    });
  }

  function addDay(box) {
    const cur = normalize(S.plans.get(openId)).itinerary;
    cur.push({ id: uid(), title: "Day " + (cur.length + 1), notes: "" });
    save({ itinerary: cur });
    drawItinerary(box);
  }

  function updateDay(dayId, patch) {
    const cur = normalize(S.plans.get(openId)).itinerary.map(function (d) {
      return d.id === dayId ? Object.assign({}, d, patch) : d;
    });
    save({ itinerary: cur });
  }

  // ----- included explore items -----

  function drawIncluded(box) {
    box.innerHTML = "";
    const p = normalize(S.plans.get(openId));
    const place = p.placeId ? S.places.get(p.placeId) : null;
    const pullBtn = document.getElementById("plan-pull-btn");
    if (pullBtn) pullBtn.disabled = !place;

    if (!place) {
      box.appendChild(el("div", { class: "plan-muted", text: "Link a saved place to pull in its Explore ideas." }));
      return;
    }
    if (!p.included.length) {
      box.appendChild(el("div", { class: "plan-muted", text: "Nothing pulled in yet." }));
      return;
    }
    p.included.forEach(function (it) {
      const row = el("div", { class: "plan-inc-row" }, [
        el("span", { class: "plan-tag", text: it.kind }),
        it.url
          ? el("a", { class: "plan-inc-text link", href: it.url, target: "_blank", rel: "noopener", onclick: function (e) {
              e.preventDefault();
              if (window.api && window.api.openExternal) window.api.openExternal(it.url);
            } }, [it.text])
          : el("span", { class: "plan-inc-text", text: it.text }),
        el("button", { class: "plan-icon-btn", title: "Remove", onclick: function () {
          const cur = normalize(S.plans.get(openId)).included.filter(function (x) { return x.id !== it.id; });
          save({ included: cur });
          drawIncluded(box);
        } }, ["×"])
      ]);
      box.appendChild(row);
    });
  }

  function openPullModal(container) {
    const p = normalize(S.plans.get(openId));
    const place = p.placeId ? S.places.get(p.placeId) : null;
    if (!place) { UI.toast("Link a place first"); return; }
    const ex = exploreOf(place);

    const have = {};
    p.included.forEach(function (it) { have[it.kind + "|" + it.text] = true; });

    const body = el("div", { class: "plan-pull" });
    const rows = [];

    function group(kind, items, urlFor) {
      if (!items.length) return;
      body.appendChild(el("div", { class: "plan-pull-h", text: kind + "s" }));
      items.forEach(function (raw) {
        const text = typeof raw === "object" ? raw.label : raw;
        const url = urlFor ? urlFor(raw) : "";
        const key = kind + "|" + text;
        const cb = el("input", { type: "checkbox" });
        if (have[key]) { cb.checked = true; cb.disabled = true; }
        rows.push({ cb: cb, kind: kind, text: text, url: url, key: key });
        const line = el("label", { class: "plan-pull-row" }, [
          cb,
          el("span", { class: "plan-pull-text", text: text }),
          url ? el("span", { class: "plan-pull-url", text: "link" }) : null
        ]);
        body.appendChild(line);
      });
    }

    group("pro", ex.pros);
    group("idea", ex.ideas);
    group("resource", ex.resources, function (r) { return r.url; });

    if (!rows.length) {
      body.appendChild(el("div", { class: "plan-muted", text: "This place has no Explore items yet." }));
    }

    UI.modal({
      title: "Pull in from Explore",
      bodyEl: body,
      actions: [
        { label: "Cancel" },
        { label: "Add selected", primary: true, onClick: function () {
          const cur = normalize(S.plans.get(openId)).included;
          let added = 0;
          rows.forEach(function (r) {
            if (r.cb.checked && !r.cb.disabled && !have[r.key]) {
              cur.push({ id: uid(), kind: r.kind, text: r.text, url: r.url || "" });
              have[r.key] = true; added++;
            }
          });
          if (added) { save({ included: cur }); UI.toast("Added " + added + " item" + (added > 1 ? "s" : "")); }
          const box = document.getElementById("plan-inc");
          if (box) drawIncluded(box);
        } }
      ]
    });
  }

  // ----- dates -----

  function fmtRange(a, b) {
    if (a && b) return fmtDate(a) + " – " + fmtDate(b);
    if (a) return "from " + fmtDate(a);
    if (b) return "until " + fmtDate(b);
    return "";
  }

  function fmtDate(s) {
    const d = new Date(s + "T00:00:00");
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  // ----- pdf export -----

  function exportPdf(container) {
    const p = normalize(S.plans.get(openId));
    const place = p.placeId ? S.places.get(p.placeId) : null;
    const html = buildPdfHtml(p, place);
    const name = (p.title || "travsplore-plan").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "travsplore-plan";
    if (!window.api || !window.api.savePDF) { UI.toast("Export is unavailable"); return; }
    window.api.savePDF({ html: html, suggestedName: name + ".pdf" }).then(function (res) {
      if (res && res.ok) UI.toast("Saved PDF");
      else if (res && res.error) UI.toast(res.error);
    }).catch(function () { UI.toast("Could not save PDF"); });
  }

  function buildPdfHtml(p, place) {
    const e = UI.escape;
    const dates = fmtRange(p.startDate, p.endDate);
    let body = "";

    body += '<h1>' + e(p.title || "Untitled plan") + '</h1>';
    const sub = [];
    if (place) sub.push(e(placeLabel(place)));
    if (dates) sub.push(e(dates));
    if (sub.length) body += '<p class="sub">' + sub.join(" &middot; ") + '</p>';

    if (p.overview.trim()) {
      body += '<h2>Overview</h2><p>' + e(p.overview).replace(/\n/g, "<br>") + '</p>';
    }

    if (p.packing.length) {
      body += '<h2>Packing</h2><ul>';
      p.packing.forEach(function (i) { body += '<li>' + e(i.text) + '</li>'; });
      body += '</ul>';
    }

    if (p.itinerary.length) {
      body += '<h2>Itinerary</h2>';
      p.itinerary.forEach(function (d, idx) {
        body += '<h3>' + e(d.title || ("Day " + (idx + 1))) + '</h3>';
        if (d.notes && d.notes.trim()) body += '<p>' + e(d.notes).replace(/\n/g, "<br>") + '</p>';
      });
    }

    if (p.included.length) {
      body += '<h2>From Explore</h2><ul>';
      p.included.forEach(function (it) {
        let line = '<span class="tag">' + e(it.kind) + '</span> ';
        if (it.url) line += '<a href="' + e(it.url) + '">' + e(it.text) + '</a>';
        else line += e(it.text);
        body += '<li>' + line + '</li>';
      });
      body += '</ul>';
    }

    const css = 'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#12212b;margin:48px;line-height:1.5;}' +
      'h1{font-size:26px;margin:0 0 4px;color:#0f6d63;}' +
      '.sub{color:#5a6b74;margin:0 0 20px;font-size:14px;}' +
      'h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #dfe7ea;padding-bottom:4px;color:#123;}' +
      'h3{font-size:14px;margin:14px 0 4px;color:#0f6d63;}' +
      'p{margin:0 0 8px;}' +
      'ul{margin:0 0 8px;padding-left:20px;}' +
      'li{margin:3px 0;}' +
      'a{color:#1a73c0;text-decoration:none;}' +
      '.tag{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#0f6d63;background:#e6f4f1;border-radius:4px;padding:1px 6px;margin-right:4px;}';

    return '<!doctype html><html><head><meta charset="utf-8"><title>' + e(p.title || "Plan") +
      '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
  }

  // ----- tab wiring -----

  function render(container) {
    if (openId && S.plans.get(openId)) renderEditor(container);
    else { openId = null; renderList(container); }
  }

  function onShow(container) {
    render(container);
  }

  window.App.registerTab("plan", { label: "Plan", icon: icon(), render: render, onShow: onShow });
})();
