// Who runs Barbook: shown in the imprint, privacy policy, terms and support pages.
// Fill in once; empty fields show a highlighted placeholder on the pages.
window.BARBOOK_LEGAL = {
  name: '',          // full name (or company name)
  street: '',        // street and house number
  city: '',          // postcode and city
  country: 'Deutschland',
  email: '',         // contact address for imprint, privacy requests and support
  phone: '',         // optional
  region: '',        // Supabase region of the project, e.g. 'EU Central (Frankfurt)'
  updated: '17. Oktober 2026'
};

// fills <span data-legal="name"></span> and friends
(function () {
  'use strict';
  var L = window.BARBOOK_LEGAL, LABEL = {
    name: 'Name', street: 'Straße und Hausnummer', city: 'PLZ und Ort', country: 'Land', email: 'E-Mail-Adresse',
    phone: 'Telefon', region: 'Region des Supabase-Projekts', updated: 'Datum'
  };
  function fill() {
    document.querySelectorAll('[data-legal]').forEach(function (el) {
      var key = el.dataset.legal, value = L[key];
      if (!value) {
        if (el.hasAttribute('data-optional')) { el.closest('[data-optional-row]') ? el.closest('[data-optional-row]').remove() : el.remove(); return; }
        el.textContent = '[' + LABEL[key] + ' eintragen]';
        el.classList.add('legal-missing');
        return;
      }
      if (key === 'email' && el.tagName !== 'A') {
        var a = document.createElement('a');
        a.href = 'mailto:' + value;
        a.textContent = value;
        el.textContent = '';
        el.append(a);
        return;
      }
      el.textContent = value;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
