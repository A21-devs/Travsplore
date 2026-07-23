// this is the shared icon set — each function returns an inline svg string that
// paints with currentColor, so buttons and nav just set a text color

(function () {
  "use strict";

  // wrap a set of path markup in a stroke-style svg
  function stroke(inner, size) {
    var s = size || 18;
    return (
      '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner +
      "</svg>"
    );
  }

  var Icons = {
    plane: function (size) {
      return stroke('<path d="M10.5 13.5 3 11l18-7-7 18-2.5-7.5-1-1z"/>', size);
    },
    compass: function (size) {
      return stroke(
        '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
        size
      );
    },
    clipboard: function (size) {
      return stroke(
        '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/>' +
          '<path d="M8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2"/>' +
          '<path d="M9 12h6M9 16h4"/>',
        size
      );
    },
    scale: function (size) {
      return stroke(
        '<path d="M12 4v16M7 20h10M6 8h12"/>' +
          '<path d="M6 8l-3 5a3 3 0 0 0 6 0z"/>' +
          '<path d="M18 8l-3 5a3 3 0 0 0 6 0z"/>' +
          '<path d="M9 5.5 12 4l3 1.5"/>',
        size
      );
    },
    gear: function (size) {
      return stroke(
        '<circle cx="12" cy="12" r="3"/>' +
          '<path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
        size
      );
    },
    plus: function (size) {
      return stroke('<path d="M12 5v14M5 12h14"/>', size);
    },
    download: function (size) {
      return stroke('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', size);
    },
    upload: function (size) {
      return stroke('<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>', size);
    },
    external: function (size) {
      return stroke(
        '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>' +
          '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
        size
      );
    },
    sun: function (size) {
      return stroke(
        '<circle cx="12" cy="12" r="4"/>' +
          '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        size
      );
    },
    moon: function (size) {
      return stroke('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', size);
    },
    search: function (size) {
      return stroke('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', size);
    },
    check: function (size) {
      return stroke('<path d="M5 12.5 10 17.5 19 6.5"/>', size);
    },
    x: function (size) {
      return stroke('<path d="M6 6l12 12M18 6L6 18"/>', size);
    },
    chevron: function (size) {
      return stroke('<path d="M9 6l6 6-6 6"/>', size);
    }
  };

  window.Icons = Icons;
})();
