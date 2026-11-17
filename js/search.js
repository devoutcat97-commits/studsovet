/* Поиск по задачам, мероприятиям и объявлениям — по данным на устройстве. */
(function () {
  'use strict';

  var esc = UI.esc, last = '';

  function hit(q, parts) { return parts.join(' ').toLowerCase().indexOf(q) >= 0; }
  function mark(text, q) {
    var i = text.toLowerCase().indexOf(q);
    if (i < 0 || !q) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function results(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return UI.empty('search', 'Что ищем?', 'Название задачи, мероприятия или объявления, место, подробности.');
    var now = new Date(), html = '';
    var tasks = Store.list('tasks').filter(function (t) { return hit(q, [t.title, t.details || '']); }).slice(0, 20);
    var evs = Store.list('events').filter(function (e) { return hit(q, [e.title, e.place || '', e.idea || '']); })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 20);
    var anns = Store.list('announcements').filter(function (a) { return hit(q, [a.title, a.text || '']); }).slice(0, 20);
    if (tasks.length) html += '<p class="group">Задачи · ' + tasks.length + '</p><div class="card">' + tasks.map(function (t) {
      return '<button class="row" data-go="task" data-arg="' + t.id + '"><svg class="i"><use href="#tasks"/></svg><span style="flex:1"><b>' + mark(t.title, q) + '</b><small>' +
        (t.status === 'done' ? 'Готово' : UI.dueLabel(t.deadline, now)) + '</small></span></button>';
    }).join('') + '</div>';
    if (evs.length) html += '<p class="group">Мероприятия · ' + evs.length + '</p><div class="card">' + evs.map(function (e) {
      var p = UI.plate(e.date);
      return '<button class="row" data-go="event" data-arg="' + e.id + '"><span class="plate u" style="--u:' + Units.color(e.unitId) + '"><b class="num">' + p.day + '</b>' + p.mon + '</span><span style="flex:1"><b>' + mark(e.title, q) + '</b><small>' + esc(e.place || '') + '</small></span></button>';
    }).join('') + '</div>';
    if (anns.length) html += '<p class="group">Объявления · ' + anns.length + '</p><div class="card">' + anns.map(function (a) {
      return '<button class="row" data-go="news"><svg class="i"><use href="#mega"/></svg><span style="flex:1"><b>' + mark(a.title, q) + '</b></span></button>';
    }).join('') + '</div>';
    return html || UI.empty('search', 'Ничего не нашлось', 'Попробуй другое слово.');
  }

  App.screen('search', {
    tab: 'home',
    render: function () {
      var s = document.createElement('section');
      s.className = 'screen on';
      s.innerHTML = '<div class="bar"><button class="ib" data-go="home" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button>' +
        '<form class="sbox" role="search" onsubmit="return false"><svg class="i"><use href="#search"/></svg><input class="inp" type="search" name="q" placeholder="Поиск" aria-label="Поиск" autocomplete="off" value="' + esc(last) + '"></form></div>' +
        '<div class="scroll" id="sres">' + results(last) + '</div>';
      var inp = s.querySelector('input'), out = s.querySelector('#sres'), t;
      inp.addEventListener('input', function () {
        last = inp.value; clearTimeout(t);
        t = setTimeout(function () { out.innerHTML = results(last); }, 120);
      });
      setTimeout(function () { inp.focus(); }, 50);
      return s;
    }
  });
})();
