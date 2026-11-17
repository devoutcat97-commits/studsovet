/* Хранилище. Экраны читают и пишут данные только через Store.
   Демо-режим: данные в браузере (localStorage).
   Облако: Cloud подключает «удалённую» сторону — записи уходят в Firestore,
   а свежие данные приходят обратно через Store.load. */
(function () {
  'use strict';

  var KEY = 'ss:data:v1';
  var listeners = new Set();
  var remote = null;
  var data = load();

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function notify() { listeners.forEach(function (fn) { fn(); }); }
  function save() {
    // В облачном режиме локальную копию не храним: офлайн-кэш ведёт сам Firestore.
    if (!remote) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* нет места / приватный режим */ } }
    notify();
  }
  function col(name) { return data[name] || (data[name] = {}); }
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  window.Store = {
    list: function (name) { return Object.values(col(name)); },
    get: function (name, key) { return col(name)[key] || null; },
    put: function (name, rec) {
      if (!rec.id) rec.id = id();
      col(name)[rec.id] = rec;
      if (remote) remote.write(name, rec);
      save();
      return rec;
    },
    remove: function (name, key) {
      delete col(name)[key];
      if (remote) remote.remove(name, key);
      save();
    },
    // Настройки этого устройства (тема, «смотреть как») — всегда локально.
    setting: function (key, val) {
      var s = col('_settings');
      if (val === undefined) return s[key];
      s[key] = val;
      try { localStorage.setItem(KEY, JSON.stringify(remote ? { _settings: s } : data)); } catch (e) { /* ok */ }
      notify();
    },
    isEmpty: function () { return !Object.keys(data).filter(function (k) { return k !== '_settings'; }).length; },
    // Облако: подключить запись наружу и стереть демо-данные из памяти.
    attach: function (r) { remote = r; data = { _settings: col('_settings') }; },
    isCloud: function () { return !!remote; },
    // Облако присылает свежий снимок коллекции.
    load: function (name, docs) {
      var c = {};
      docs.forEach(function (d) { c[d.id] = d; });
      data[name] = c;
      notify();
    },
    onChange: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }
  };
})();
