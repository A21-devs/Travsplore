// this is the shared ui kit every tab leans on — toasts, spinners, modals,
// the short "answer + ask more" block, and a few small builders

(function () {
  "use strict";

  // escape anything before it touches innerHTML — model and user text included
  function escape(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function elem(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // find (or lazily make) the mount points from index.html
  function toastHost() {
    var h = document.getElementById("toast-root");
    if (!h) {
      h = elem("div");
      h.id = "toast-root";
      document.body.appendChild(h);
    }
    return h;
  }
  function modalHost() {
    var h = document.getElementById("modal-root");
    if (!h) {
      h = elem("div");
      h.id = "modal-root";
      document.body.appendChild(h);
    }
    return h;
  }

  // short-lived toast in the corner
  function toast(msg, ms) {
    var host = toastHost();
    var t = elem("div", "ui-toast", String(msg == null ? "" : msg));
    host.appendChild(t);
    // let the transition catch
    requestAnimationFrame(function () {
      t.classList.add("show");
    });
    var life = typeof ms === "number" ? ms : 2600;
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 220);
    }, life);
  }

  // drop a spinner into target, hand back a stop() that removes it once
  function spinner(target) {
    var sp = elem("span", "ui-spinner");
    sp.setAttribute("role", "status");
    sp.setAttribute("aria-label", "Loading");
    if (target && target.appendChild) target.appendChild(sp);
    var stopped = false;
    return function stop() {
      if (stopped) return;
      stopped = true;
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    };
  }

  // a centered modal. opts: { title, html | bodyEl, actions:[{label,primary,onClick}] }
  function modal(opts) {
    var o = opts || {};
    var host = modalHost();

    var back = elem("div", "ui-modal-back");
    var box = elem("div", "ui-modal");

    if (o.title) {
      box.appendChild(elem("div", "ui-modal-title", o.title));
    }

    var body = elem("div", "ui-modal-body");
    if (o.bodyEl) {
      body.appendChild(o.bodyEl);
    } else if (typeof o.html === "string") {
      body.innerHTML = o.html;
    }
    box.appendChild(body);

    function close() {
      if (!back.parentNode) return;
      document.removeEventListener("keydown", onKey);
      back.classList.remove("show");
      setTimeout(function () {
        if (back.parentNode) back.parentNode.removeChild(back);
      }, 160);
    }

    var actions = Array.isArray(o.actions) ? o.actions : [];
    if (actions.length) {
      var foot = elem("div", "ui-modal-foot");
      actions.forEach(function (a) {
        var b = elem("button", "ui-btn" + (a.primary ? " primary" : " quiet"), a.label || "OK");
        b.type = "button";
        b.addEventListener("click", function () {
          // close first so an onClick that reopens a modal still works
          close();
          if (typeof a.onClick === "function") {
            try {
              a.onClick();
            } catch (e) {}
          }
        });
        foot.appendChild(b);
      });
      box.appendChild(foot);
    }

    // click the backdrop or press escape to dismiss
    back.addEventListener("mousedown", function (e) {
      if (e.target === back) close();
    });
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);

    back.appendChild(box);
    host.appendChild(back);
    requestAnimationFrame(function () {
      back.classList.add("show");
    });

    return { close: close, el: box };
  }

  // short answer shown now, with an "Ask more" button that loads deeper detail
  // once. onMore(appendEl) is handed a container to fill; it fires a single time.
  function answer(container, shortText, onMore) {
    var wrap = elem("div", "ui-answer");

    if (shortText) {
      var lines = String(shortText).split(/\r?\n/);
      var head = elem("div", "ui-answer-short");
      lines.forEach(function (ln) {
        var t = ln.trim();
        if (!t) return;
        head.appendChild(elem("div", "ui-answer-line", t));
      });
      wrap.appendChild(head);
    }

    if (typeof onMore === "function") {
      var more = elem("div", "ui-answer-more");
      var btn = elem("button", "ui-btn quiet ui-ask-more", "Ask more");
      btn.type = "button";
      var fired = false;
      btn.addEventListener("click", function () {
        if (fired) return;
        fired = true;
        btn.disabled = true;
        // hand the caller its own slot; it owns any spinner it wants
        var slot = elem("div", "ui-answer-slot");
        more.appendChild(slot);
        if (btn.parentNode) btn.parentNode.removeChild(btn);
        try {
          onMore(slot);
        } catch (e) {
          slot.appendChild(elem("div", "ui-answer-line", "Could not load more."));
        }
      });
      more.appendChild(btn);
      wrap.appendChild(more);
    }

    if (container && container.appendChild) container.appendChild(wrap);
    return wrap;
  }

  // a simple card element. opts: { title, subtitle, body(string|node), footEl }
  function card(opts) {
    var o = opts || {};
    var c = elem("div", "ui-card" + (o.className ? " " + o.className : ""));
    if (o.title) c.appendChild(elem("div", "ui-card-title", o.title));
    if (o.subtitle) c.appendChild(elem("div", "ui-card-sub", o.subtitle));
    if (o.body != null) {
      var b = elem("div", "ui-card-body");
      if (typeof o.body === "string") b.textContent = o.body;
      else b.appendChild(o.body);
      c.appendChild(b);
    }
    if (o.footEl) c.appendChild(o.footEl);
    return c;
  }

  // a rounded chip. onRemove, if given, adds a little x
  function chip(text, opts) {
    var o = opts || {};
    var c = elem("span", "ui-chip" + (o.className ? " " + o.className : ""));
    c.appendChild(elem("span", "ui-chip-text", String(text == null ? "" : text)));
    if (typeof o.onRemove === "function") {
      var x = elem("button", "ui-chip-x", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Remove");
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        o.onRemove();
      });
      c.appendChild(x);
    }
    return c;
  }

  // a labelled field wrapper around any control
  function field(labelText, control) {
    var wrap = elem("label", "ui-field");
    if (labelText) wrap.appendChild(elem("span", "ui-label", labelText));
    if (control) wrap.appendChild(control);
    return wrap;
  }

  // fill a container with a quiet empty state
  function empty(container, text) {
    if (!container) return null;
    container.innerHTML = "";
    var box = elem("div", "ui-empty");
    box.appendChild(elem("div", "ui-empty-text", text || "Nothing here yet."));
    container.appendChild(box);
    return box;
  }

  window.UI = {
    escape: escape,
    toast: toast,
    spinner: spinner,
    modal: modal,
    answer: answer,
    card: card,
    chip: chip,
    field: field,
    empty: empty
  };
})();
