/* Облако: вход (почта+пароль, Google), подписка на данные, запись.
   Без настроек облака не запускается — тогда работает демо-режим (seed.js). */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var emu = /[?&]emu\b/.test(location.search);
  var cfg = emu ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-studsovet' } : window.CLOUD_CONFIG;
  var auth, db, unsubs = [], meUnsub = null;
  // Состояние входа: 'loading' | 'out' | 'apply' | 'wait' | 'left' | 'in'
  var state = cfg ? 'loading' : 'demo';

  // Коллекции, которые видит любой одобренный участник; заявки — только руководство.
  var COLS = ['members', 'events', 'tasks', 'comments', 'templates', 'announcements', 'reads', 'proposals', 'files', 'covers', 'going', 'avatars'];
  // pushTokens читаем только свой документ (правила не дают чужие).
  var OWN = ['pushTokens'];

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
  }
  function setState(s) { state = s; App.show(); }

  function stopSync() { unsubs.forEach(function (u) { u(); }); unsubs = []; }
  function sync(m) {
    stopSync();
    // Закрытые коллекции слушаем только тем, кому правила их показывают.
    var extra = (Units.isTop(m) ? ['requests'] : []).concat(Units.seesBrief(m) ? ['leads'] : [], m.isAdmin ? ['bugs'] : []);
    COLS.concat(extra).forEach(function (name) {
      unsubs.push(db.collection(name).onSnapshot(function (snap) {
        // Id попадает в разметку (data-arg и т. п.): документы с «чужими» символами в id не берём — защита от подстановки кода.
        Store.load(name, snap.docs.filter(function (d) { return /^[\w-]+$/.test(d.id); }).map(function (d) { var x = d.data(); x.id = d.id; return x; }));
      }, function (e) { console.warn('sync', name, e.code); }));
    });
    OWN.forEach(function (name) {
      unsubs.push(db.collection(name).doc(auth.currentUser.uid).onSnapshot(function (d) {
        Store.load(name, d.exists ? [Object.assign({ id: d.id }, d.data())] : []);
      }, function () {}));
    });
  }

  function onUser(user) {
    stopSync();
    if (meUnsub) { meUnsub(); meUnsub = null; }
    if (!user) { Store.setting('me', null); return setState('out'); }
    Store.setting('me', user.uid);
    meUnsub = db.collection('members').doc(user.uid).onSnapshot(function (d) {
      if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
      if (!d.exists) {
        return db.collection('requests').doc(user.uid).get()
          .then(function (r) { setState(r.exists ? 'wait' : 'apply'); })
          .catch(function () { setState('apply'); });
      }
      var m = d.data(); m.id = d.id;
      if (m.status !== 'active') { stopSync(); return setState('left'); }
      Store.load('members', [m].concat(Store.list('members').filter(function (x) { return x.id !== m.id; })));
      if (state !== 'in') sync(m);
      state = 'in'; App.show();
    }, function () { if (auth.currentUser && auth.currentUser.uid === user.uid) setState('apply'); });
  }

  function start() {
    if (!cfg) return;
    Store.attach({
      // Поле id храним в имени документа, внутри не дублируем.
      write: function (name, rec) {
        var copy = Object.assign({}, rec); delete copy.id;
        db.collection(name).doc(rec.id).set(copy).catch(function (e) { UI.toast('Не сохранилось: нет прав или нет сети (' + e.code + ').'); });
      },
      remove: function (name, key) { db.collection(name).doc(key).delete().catch(function (e) { UI.toast('Не удалилось (' + e.code + ').'); }); }
    });
    loadScript(SDK + 'firebase-app-compat.js')
      .then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(SDK + 'firebase-firestore-compat.js'); })
      .then(function () {
        firebase.initializeApp(cfg);
        auth = firebase.auth(); db = firebase.firestore();
        if (emu) { auth.useEmulator('http://127.0.0.1:9099'); db.useEmulator('127.0.0.1', 8080); }
        else db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* второй браузер / приватный режим */ });
        auth.onAuthStateChanged(onUser);
      })
      .catch(function () { setState('offline'); });
  }

  // Ошибки Firebase — человеческим языком.
  function human(e) {
    var map = {
      'auth/invalid-email': 'Почта написана с ошибкой.',
      'auth/missing-password': 'Введи пароль.',
      'auth/weak-password': 'Пароль слишком короткий: нужно не меньше 8 символов.',
      'auth/email-already-in-use': 'С этой почтой уже регистрировались — войди.',
      'auth/invalid-credential': 'Неверная почта или пароль.',
      'auth/wrong-password': 'Неверная почта или пароль.',
      'auth/user-not-found': 'Неверная почта или пароль.',
      'auth/too-many-requests': 'Слишком много попыток. Подожди пару минут.',
      'auth/network-request-failed': 'Нет интернета. Попробуй ещё раз.',
      'auth/popup-blocked': 'Браузер заблокировал окно входа. Разреши всплывающие окна или войди по почте.',
      'auth/operation-not-supported-in-this-environment': 'Здесь вход через Google не работает. Открой приложение в обычном браузере или войди по почте.'
    };
    return map[e && e.code] || 'Что-то пошло не так. Попробуй ещё раз.';
  }

  window.Cloud = {
    enabled: !!cfg,
    state: function () { return state; },
    signIn: function (email, pass) { return auth.signInWithEmailAndPassword(email, pass); },
    signUp: function (email, pass) { return auth.createUserWithEmailAndPassword(email, pass); },
    google: function () { return auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); },
    reset: function (email) { return auth.sendPasswordResetEmail(email); },
    signOut: function () { stopSync(); if (meUnsub) { meUnsub(); meUnsub = null; } location.hash = ''; return auth.signOut(); },
    user: function () { return auth && auth.currentUser; },
    request: function (rec) {
      return db.collection('requests').doc(auth.currentUser.uid).set(rec).then(function () {
        if (window.Push) Push.notify('request', auth.currentUser.uid);
        setState('wait');
      });
    },
    human: human
  };

  document.addEventListener('DOMContentLoaded', start);
})();
