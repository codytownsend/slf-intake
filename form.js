/* Simple Little Flowers — event inquiry form
 * Multi-step navigation, conditional reveals, blur validation, JSON submit. */
(function () {
  'use strict';

  var form = document.getElementById('inquiryForm');
  if (!form) return;

  /* ---------- Items needed (with quantity inputs) ---------- */
  var ITEMS = [
    'Bridal or primary bouquet',
    'Bridesmaid or attendant bouquets',
    'Boutonnieres',
    'Corsages (pin-on or wrist)',
    'Flower crowns or hair flowers',
    'Flower girl petals or basket',
    'Ceremony arch, arbor, or large installation',
    'Altar or aisle arrangements',
    'Table centerpieces',
    'Head table or sweetheart garland',
    'Cocktail or accent table arrangements',
    'Bar, welcome sign, or guestbook florals',
    'Bud vases'
  ];
  var itemsList = document.getElementById('itemsList');
  ITEMS.forEach(function (label, i) {
    var slug = 'item_' + i;
    var wrap = document.createElement('label');
    wrap.className = 'choice item';
    wrap.innerHTML =
      '<span class="item__main" style="display:flex;gap:.75rem;align-items:flex-start">' +
        '<input type="checkbox" name="items_needed" value="' + escAttr(label) + '">' +
        '<span class="choice__text"><span class="choice__title">' + escHtml(label) + '</span></span>' +
      '</span>' +
      '<input type="number" class="item__qty" min="1" inputmode="numeric" ' +
        'name="qty__' + escAttr(label) + '" aria-label="Quantity of ' + escAttr(label) + '" placeholder="Qty">';
    itemsList.appendChild(wrap);
  });
  // default qty to 1 when an item is checked
  itemsList.addEventListener('change', function (e) {
    if (e.target.name === 'items_needed') {
      var qty = e.target.closest('.item').querySelector('.item__qty');
      if (e.target.checked && !qty.value) qty.value = '1';
      if (!e.target.checked) qty.value = '';
    }
  });

  /* ---------- Hidden meta ---------- */
  document.getElementById('submitted_at').value = new Date().toISOString();
  try {
    var p = new URLSearchParams(window.location.search);
    var utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .map(function (k) { return p.get(k) ? k + '=' + p.get(k) : null; })
      .filter(Boolean).join(' | ');
    var ref = document.referrer || '';
    document.getElementById('utm_source').value =
      [utm, ref ? 'ref=' + ref : ''].filter(Boolean).join(' | ') || 'direct';
  } catch (e) { document.getElementById('utm_source').value = 'direct'; }

  /* ---------- Conditional reveals ---------- */
  function reveal(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    if (show) { el.setAttribute('data-shown', ''); }
    else {
      el.removeAttribute('data-shown');
      el.querySelectorAll('input, textarea, select').forEach(function (f) {
        if (f.type === 'checkbox' || f.type === 'radio') f.checked = false; else f.value = '';
        clearError(f);
      });
    }
  }
  // select-driven (event type "Other")
  form.querySelectorAll('select[data-controls]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      reveal(sel.getAttribute('data-controls'), sel.value === sel.getAttribute('data-reveal-value'));
    });
  });
  // radio-driven show/hide
  form.querySelectorAll('input[data-show], input[data-hide]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) return;
      var group = form.querySelectorAll('input[name="' + input.name + '"]');
      group.forEach(function (r) {
        if (r.getAttribute('data-show')) reveal(r.getAttribute('data-show'), false);
      });
      if (input.getAttribute('data-show')) reveal(input.getAttribute('data-show'), true);
      if (input.getAttribute('data-hide')) reveal(input.getAttribute('data-hide'), false);
    });
  });

  /* ---------- Date floor: no past dates ---------- */
  var dateInput = document.getElementById('event_date');
  if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

  /* ---------- Steps ---------- */
  var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
  var total = steps.length;
  var current = 0;

  var backBtn = document.getElementById('backBtn');
  var nextBtn = document.getElementById('nextBtn');
  var submitBtn = document.getElementById('submitBtn');
  var bar = document.getElementById('progressBar');
  var stepNum = document.getElementById('stepNum');
  var stepName = document.getElementById('stepName');
  var alertBox = document.getElementById('formAlert');

  function showStep(i, focus) {
    steps.forEach(function (s, idx) {
      var active = idx === i;
      s.toggleAttribute('data-active', active);
      if (active) s.removeAttribute('hidden'); else s.setAttribute('hidden', '');
    });
    current = i;
    stepNum.textContent = i + 1;
    stepName.textContent = steps[i].getAttribute('data-name');
    bar.style.width = ((i + 1) / total * 100) + '%';
    backBtn.hidden = i === 0;
    nextBtn.hidden = i === total - 1;
    submitBtn.hidden = i !== total - 1;
    alertBox.removeAttribute('data-shown');
    if (focus !== false) {
      var h = steps[i].querySelector('.step__title');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
      window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
    }
  }

  /* ---------- Validation ---------- */
  function fieldWrap(el) { return el.closest('.field') || el.closest('fieldset'); }
  function errEl(el) {
    var w = fieldWrap(el);
    return w ? w.querySelector('.field__error') : null;
  }
  function setError(el, msg) {
    var w = fieldWrap(el);
    if (w) w.classList.add('is-invalid');
    var e = errEl(el);
    if (e && msg) e.textContent = msg;
    if (el.setAttribute) el.setAttribute('aria-invalid', 'true');
  }
  function clearError(el) {
    var w = fieldWrap(el);
    if (w) w.classList.remove('is-invalid');
    if (el.removeAttribute) el.removeAttribute('aria-invalid');
  }

  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  // returns {ok, firstInvalid}
  function validateStep(i) {
    var step = steps[i];
    var firstInvalid = null;

    // required text/email/date/select
    step.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (el) {
      if (el.type === 'radio' || el.type === 'checkbox') return; // handled below
      var v = (el.value || '').trim();
      var bad = !v;
      if (!bad && el.type === 'email' && !validateEmail(v)) bad = true;
      if (!bad && el.type === 'date' && el.min && v < el.min) bad = true;
      if (bad) { setError(el); firstInvalid = firstInvalid || el; } else clearError(el);
    });

    // required radio groups
    var seen = {};
    step.querySelectorAll('input[type="radio"][required]').forEach(function (el) {
      if (seen[el.name]) return; seen[el.name] = true;
      var checked = step.querySelector('input[name="' + el.name + '"]:checked');
      if (!checked) { setError(el); firstInvalid = firstInvalid || el; } else clearError(el);
    });

    // required checkbox: ack + items_needed (at least one)
    step.querySelectorAll('input[type="checkbox"][required]').forEach(function (el) {
      if (!el.checked) { setError(el); firstInvalid = firstInvalid || el; } else clearError(el);
    });
    // items_needed group (required = at least one, unless items_other filled)
    if (step.querySelector('#itemsList')) {
      var anyItem = step.querySelector('input[name="items_needed"]:checked');
      var other = form.querySelector('#items_other');
      var itemsFs = document.getElementById('items_fieldset');
      if (!anyItem && !(other && other.value.trim())) {
        itemsFs.classList.add('is-invalid');
        firstInvalid = firstInvalid || itemsFs.querySelector('input');
      } else {
        itemsFs.classList.remove('is-invalid');
      }
    }

    return { ok: !firstInvalid, firstInvalid: firstInvalid };
  }

  // blur validation (single field)
  form.addEventListener('blur', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('input, select, textarea')) return;
    if (!el.hasAttribute('required')) return;
    if (el.type === 'radio' || el.type === 'checkbox') return;
    var v = (el.value || '').trim();
    var bad = !v || (el.type === 'email' && v && !validateEmail(v)) || (el.type === 'date' && el.min && v < el.min);
    if (bad && v === '' ) { clearError(el); return; } // don't nag empty on blur; catch on Continue
    if (bad) setError(el); else clearError(el);
  }, true);

  // clear error as the user fixes it
  form.addEventListener('change', function (e) {
    var el = e.target;
    if (el.type === 'radio' || el.type === 'checkbox') {
      var w = fieldWrap(el);
      if (w) w.classList.remove('is-invalid');
    } else if (el.value && el.value.trim()) {
      clearError(el);
    }
  });

  function announceStepErrors(res) {
    alertBox.innerHTML = 'A few fields need a moment before we continue. They’re marked below.';
    alertBox.setAttribute('data-shown', '');
    if (res.firstInvalid) {
      (res.firstInvalid.focus ? res.firstInvalid : res.firstInvalid).focus({ preventScroll: false });
      var w = fieldWrap(res.firstInvalid);
      if (w) w.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'center' });
    }
  }

  /* ---------- Navigation ---------- */
  nextBtn.addEventListener('click', function () {
    var res = validateStep(current);
    if (!res.ok) { announceStepErrors(res); return; }
    if (current < total - 1) showStep(current + 1);
  });
  backBtn.addEventListener('click', function () {
    if (current > 0) showStep(current - 1);
  });

  /* ---------- Submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // validate all steps, jump to first with an error
    for (var i = 0; i < total; i++) {
      var res = validateStep(i);
      if (!res.ok) { showStep(i, false); announceStepErrors(res); return; }
    }

    // honeypot
    if (form.hp_field && form.hp_field.value) { showDone(); return; } // silently accept-and-drop bots

    var label = submitBtn.querySelector('.btn__label');
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    var prev = label.textContent;
    label.textContent = 'Sending…';

    var payload = collect();

    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.body && r.body.error) || 'Request failed');
        showDone();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        label.textContent = prev;
        alertBox.innerHTML = 'Something went wrong sending your inquiry. Please try again, or email us directly at <a href="mailto:hello@simplelittleflowers.com">hello@simplelittleflowers.com</a>.';
        alertBox.setAttribute('data-shown', '');
        alertBox.focus();
      });
  });

  function collect() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (key === 'hp_field') return;
      if (data[key] === undefined) data[key] = value;
      else if (Array.isArray(data[key])) data[key].push(value);
      else data[key] = [data[key], value];
    });
    // pair up item quantities into a clean structure
    var items = [];
    (Array.isArray(data.items_needed) ? data.items_needed : (data.items_needed ? [data.items_needed] : []))
      .forEach(function (name) {
        var qty = data['qty__' + name];
        items.push({ item: name, qty: qty || '1' });
      });
    data.items = items;
    // strip raw qty__ keys
    Object.keys(data).forEach(function (k) { if (k.indexOf('qty__') === 0) delete data[k]; });
    return data;
  }

  function showDone() {
    form.setAttribute('hidden', '');
    document.querySelector('.actions').setAttribute('hidden', '');
    document.querySelector('.progress').setAttribute('hidden', '');
    var done = document.getElementById('done');
    done.setAttribute('data-shown', '');
    done.setAttribute('tabindex', '-1');
    done.focus();
    window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
  }

  /* ---------- helpers ---------- */
  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function escHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function escAttr(s) { return String(s).replace(/["&<>]/g, function (c) { return { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  showStep(0, false);
})();
