/* In-app dialog to replace native alert/confirm (2026-08-15 site-wide directive —
   native browser popups clash with the app's look).
   UIDialog.alert(msg[, cb])           — single-button message box
   UIDialog.confirm(msg, onOk[, onCancel]) — two-step OK / Cancel
   Enter = primary button, Esc = cancel; message set via textContent, \n wraps. */
(function () {
  if (typeof document === 'undefined') return;
  var overlay = null, primaryCb = null, cancelCb = null;

  function close() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey, true);
    overlay.parentNode && overlay.parentNode.removeChild(overlay);
    overlay = null; primaryCb = null; cancelCb = null;
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); var c = cancelCb; close(); if (c) c(); }
    else if (e.key === 'Enter') { e.preventDefault(); var p = primaryCb; close(); if (p) p(); }
  }
  function open(msg, btns) {
    close();
    overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    var card = document.createElement('div');
    card.className = 'dlg-card';
    var body = document.createElement('div');
    body.className = 'dlg-msg';
    body.textContent = msg;
    card.appendChild(body);
    var row = document.createElement('div');
    row.className = 'dlg-btns';
    btns.forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = b.primary ? 'primary-btn' : 'ghost-btn';
      el.textContent = b.label;
      el.addEventListener('click', function () { close(); if (b.cb) b.cb(); });
      row.appendChild(el);
      if (b.primary) primaryCb = b.cb || null;
      if (b.cancel) cancelCb = b.cb || null;
    });
    card.appendChild(row);
    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) {
      if (e.target !== overlay) return;
      var c = cancelCb; close(); if (c) c();
    });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    var pb = card.querySelector('.primary-btn');
    if (pb) pb.focus();
  }

  window.UIDialog = {
    alert: function (msg, cb) {
      open(msg, [{ label: 'OK', primary: true, cancel: true, cb: cb }]);
    },
    confirm: function (msg, onOk, onCancel) {
      open(msg, [
        { label: 'Cancel', cancel: true, cb: onCancel },
        { label: 'OK', primary: true, cb: onOk }
      ]);
    }
  };
})();
