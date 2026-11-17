/* Работа без интернета: свои файлы берём из кэша, а в фоне обновляем.
   Запросы к Firebase и Apps Script не кэшируем — у них своя логика. */
var CACHE = 'ss-v23b';
var FILES = ['./', 'index.html', 'css/styles.css?v=15', 'js/cloud-config.js?v=4', 'js/store.js?v=3', 'js/units.js?v=4', 'js/ui.js?v=6', 'js/seed.js?v=2', 'js/app.js?v=11', 'js/tasks.js?v=7', 'js/files.js?v=2', 'js/events.js?v=9', 'js/news.js?v=10', 'js/auth.js?v=5', 'js/lead.js?v=1', 'js/extra.js?v=3', 'js/search.js?v=2', 'js/push.js?v=2', 'js/cloud.js?v=8', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/logo-128.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  var own = url.origin === location.origin;
  var font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (e.request.method !== 'GET' || (!own && !font)) return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

// Пуш от сервера: { data: { title, body, url, tag } } через Firebase Cloud Messaging.
self.addEventListener('push', function (e) {
  var p = {};
  try { p = e.data ? e.data.json() : {}; } catch (er) { p = { data: { title: 'Студенческий совет', body: e.data ? e.data.text() : '' } }; }
  var d = p.data || p.notification || p;
  e.waitUntil(self.registration.showNotification(d.title || 'Студенческий совет', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, data: { url: d.url || '#home' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || '#home', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].url.indexOf(self.registration.scope) === 0) { list[i].focus(); return list[i].navigate(url); }
    return self.clients.openWindow(url);
  }));
});
