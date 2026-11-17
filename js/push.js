/* Push-уведомления: подписка устройства и сигнал серверу о новых событиях.
   Телефон сохраняет свой «адрес» (токен) в pushTokens/{uid}; рассылает сервер (server/Code.gs). */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var KEY = 'ss:push-token';

  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function supported() { return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }
  function ready() { return !!(window.Cloud && Cloud.enabled && window.VAPID_KEY && Store.isCloud()); }
  function enabled() { return supported() && !!token() && Notification.permission === 'granted'; }

  function loadMessaging() {
    if (window.firebase && firebase.messaging) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = SDK + 'firebase-messaging-compat.js';
      s.onload = ok; s.onerror = function () { fail(new Error('Не загрузилась библиотека уведомлений.')); };
      document.head.appendChild(s);
    });
  }
  function device() {
    var ua = navigator.userAgent;
    return /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Компьютер' : /mac/i.test(ua) ? 'Mac' : 'Устройство';
  }
  // Токены лежат в одном документе на человека: { tokens: { <токен>: {device, at} } }.
  function saveTokens(fn) {
    var me = App.me(), rec = Store.get('pushTokens', me.id) || { id: me.id, tokens: {} };
    rec.tokens = rec.tokens || {};
    fn(rec.tokens);
    Store.put('pushTokens', rec);
  }

  function enable() {
    if (!supported()) return Promise.reject(new Error('Этот браузер не умеет уведомления. На iPhone сначала добавь приложение на экран «Домой» и открой его оттуда.'));
    if (!ready()) return Promise.reject(new Error('Уведомления ещё не настроены.'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('Уведомления запрещены. Разреши их в настройках браузера для этого сайта.');
      return Promise.all([loadMessaging(), navigator.serviceWorker.ready]);
    }).then(function (r) {
      return firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: r[1] });
    }).then(function (t) {
      if (!t) throw new Error('Не получилось подписаться на уведомления.');
      try { localStorage.setItem(KEY, t); } catch (e) { /* ok */ }
      saveTokens(function (all) { all[t] = { device: device(), at: new Date().toISOString() }; });
    });
  }
  function disable() {
    var t = token();
    try { localStorage.removeItem(KEY); } catch (e) { /* ok */ }
    if (!t) return Promise.resolve();
    saveTokens(function (all) { delete all[t]; });
    return loadMessaging().then(function () { return firebase.messaging().deleteToken(); }).catch(function () { /* ok */ });
  }

  // Сообщить серверу о новом событии. Ошибка не мешает работе — просто никто не получит пуш.
  function notify(type, id) {
    if (!window.FILES_URL || !window.firebase || !firebase.auth || !firebase.auth().currentUser) return;
    firebase.auth().currentUser.getIdToken().then(function (tok) {
      // Небольшая пауза: документ успевает дойти до базы раньше, чем сервер его прочитает.
      setTimeout(function () {
        fetch(FILES_URL, { method: 'POST', body: JSON.stringify({ action: 'notify', type: type, id: id, idToken: tok }) }).catch(function () {});
      }, 2500);
    });
  }

  function status() {
    if (!supported()) return 'Этот браузер не умеет уведомления. На iPhone добавь приложение на экран «Домой» и открой оттуда.';
    if (!ready()) return 'Уведомления работают в облачной версии.';
    if (Notification.permission === 'denied') return 'Уведомления запрещены в настройках браузера — разреши их для этого сайта.';
    return enabled() ? 'Включены на этом устройстве: сводка в 8:00 и 19:00, новые задачи, важные объявления, заявки и предложения.' : 'Выключены на этом устройстве.';
  }

  window.Push = { enable: enable, disable: disable, enabled: enabled, notify: notify, status: status };
})();
