/* Объявления и сводка (главный экран). */
(function () {
  'use strict';

  var esc = UI.esc;
  function el(html) { var s = document.createElement('section'); s.className = 'screen on'; s.innerHTML = html; return s; }
  function back(to, title) {
    return '<div class="bar"><button class="ib" data-go="' + to + '" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>' + title + '</h1></div>';
  }
  function active() { return Store.list('members').filter(function (m) { return m.status === 'active'; }); }
  function sorted() { return Store.list('announcements').sort(function (a, b) { return new Date(b.at) - new Date(a.at); }); }
  // Непрочитанные важные — то, что требует отметки «ознакомлен».
  // Отметки «ознакомлен» лежат отдельно: документ <объявление>_<uid>.
  function hasRead(a, uid) { return !!Store.get('reads', a.id + '_' + uid); }
  function unread(me) { return sorted().filter(function (a) { return a.important && a.authorUid !== me.id && !hasRead(a, me.id); }); }
  function ago(iso, now) {
    var n = UI.daysBetween(new Date(iso), now), d = new Date(iso);
    var t = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    return n === 0 ? 'сегодня ' + t : n === 1 ? 'вчера ' + t : UI.longDate(d);
  }
  // Сколько из адресатов (все активные, кроме автора) отметили «ознакомлен».
  function readStats(a) {
    var all = active().filter(function (m) { return m.id !== a.authorUid; });
    var not = all.filter(function (m) { return !hasRead(a, m.id); });
    return { total: all.length, read: all.length - not.length, not: not };
  }
  function author(a) {
    var m = Store.get('members', a.authorUid);
    return m ? Units.title(m).split(', ')[0] : '—';
  }

  function card(a, me, now) {
    var read = hasRead(a, me.id) || a.authorUid === me.id, st = readStats(a);
    var mineToSee = a.authorUid === me.id || Units.isTop(me);
    return '<div class="card">' + (a.important ? '<span class="tag gold"><svg class="i"><use href="#star"/></svg>Важно</span>' : '') +
      '<h2' + (a.important ? ' style="margin-top:8px"' : '') + '>' + esc(a.title) + '</h2>' +
      '<p style="font-size:15px;color:var(--text-2);white-space:pre-line">' + esc(a.text) + '</p>' +
      '<p style="font-size:13px;color:var(--text-2);margin:10px 0">' + esc(author(a)) + ' · ' + ago(a.at, now) + '</p>' +
      (a.important ? (read ? '<span class="tag ok"><svg class="i"><use href="#ok"/></svg>Ты ознакомлен(а)</span>'
        : '<button class="btn sm" data-ack="' + a.id + '">Ознакомлен(а)</button>') : '') +
      (a.important && mineToSee ? '<button class="link" data-go="reads" data-arg="' + a.id + '" style="margin-left:12px">Прочитали ' + st.read + ' из ' + st.total + '</button>' : '') +
      '</div>';
  }
  function bindAck(root, me) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ack]'); if (!b) return;
      var a = Store.get('announcements', b.dataset.ack);
      Store.put('reads', { id: b.dataset.ack + '_' + me.id, annId: b.dataset.ack, uid: me.id, at: new Date().toISOString() }); App.show();
    });
  }

  App.screen('news', {
    render: function () {
      var me = App.me(), now = new Date(), list = sorted();
      var s = el('<div class="bar"><h1>Объявления</h1>' + (Units.canAnnounce(me) ? '<button class="ib" data-go="newnews" aria-label="Новое объявление"><svg class="i"><use href="#plus"/></svg></button>' : '') + '</div>' +
        '<div class="scroll">' + (list.map(function (a) { return card(a, me, now); }).join('') ||
        UI.empty('mega', 'Объявлений нет', 'Здесь появятся новости от руководства.')) + '</div>');
      bindAck(s, me);
      return s;
    }
  });

  App.screen('reads', {
    tab: 'news',
    render: function (id) {
      var a = Store.get('announcements', id);
      if (!a) return el(back('news', 'Кто прочитал') + '<div class="empty"><b>Объявление не найдено</b></div>');
      var st = readStats(a), not = st.not, n = st.read, all = { length: st.total };
      return el(back('news', 'Кто прочитал') + '<div class="scroll"><div class="card"><h2>' + esc(a.title) + '</h2>' +
        '<p class="num" style="color:var(--text-2)">Прочитали ' + n + ' из ' + all.length + '</p><div class="progress"><i style="width:' + (all.length ? Math.round(n / all.length * 100) : 0) + '%"></i></div></div>' +
        (not.length ? '<p class="group lt">Ещё не прочитали · ' + not.length + '</p><div class="card">' + not.map(function (m) {
          return '<div class="row">' + UI.ava(m) + '<span><b>' + esc(m.name) + '</b><small>' +
            esc(Units.title(m)) + '</small></span></div>';
        }).join('') + '</div>' : '<p class="group">Прочитали все</p>') + '</div>');
    }
  });

  App.screen('newnews', {
    tab: 'news',
    render: function () {
      var me = App.me();
      if (!Units.canAnnounce(me)) return el(back('news', 'Новое объявление') + '<div class="empty"><b>Нет прав</b>Объявления публикуют председатель, заместитель и секретарь.</div>');
      var s = el(back('news', 'Новое объявление') + '<div class="scroll"><form class="form" novalidate>' +
        '<label class="f">Заголовок<input class="inp" name="title" maxlength="120" required></label>' +
        '<label class="f">Текст<textarea class="inp" name="text" rows="6" maxlength="4000" required></textarea></label>' +
        '<label class="consent"><input type="checkbox" name="imp"> Важное: попросить всех отметить «Ознакомлен(а)»</label>' +
        '<p class="hint late" id="err" hidden></p><button class="btn">Опубликовать</button></form></div>');
      var f = s.querySelector('form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.title.value.trim() || !f.text.value.trim()) { var err = s.querySelector('#err'); err.hidden = false; err.textContent = 'Нужны заголовок и текст.'; return; }
        var na = Store.put('announcements', { title: f.title.value.trim(), text: f.text.value.trim(), important: f.imp.checked, authorUid: me.id, at: new Date().toISOString() });
        if (na.important && window.Push) Push.notify('announcement', na.id);
        App.go('news');
      });
      return s;
    }
  });

  // Сводка: что на мне, что скоро, что прочитать, что ждёт решения.
  var lastPct = null;
  App.screen('home', {
    render: function () {
      var me = App.me(), now = new Date(), today = new Date(now.toDateString());
      var g = UI.groupByDue(Tasks.pick('mine', me), now);
      var open = g.overdue.concat(g.today, g.week, g.later);
      var evs = Store.list('events').filter(function (e) { return new Date(e.date) >= today; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).slice(0, 3);
      var news = unread(me).slice(0, 2);
      var props = Store.list('proposals').filter(function (p) { return p.status === 'pending' && Units.canDecide(me, p); });
      var place = me.positions.map(function (p) { return Units.unit(p.unitId).name.replace('Актив ', 'актив '); }).join(' · ') || 'Член студсовета';
      // Неделя: мои задачи со сроком в пределах 7 дней назад и вперёд.
      var wk = Tasks.pick('mine', me).filter(function (t) { return Math.abs(UI.daysBetween(now, new Date(t.deadline))) <= 7; });
      var wkDone = wk.filter(function (t) { return t.status === 'done'; }).length, pct = wk.length ? wkDone / wk.length : 0, C = 2 * Math.PI * 26;
      // Имя хранится как «Фамилия Имя»; пометки в скобках не показываем.
      var nm = me.name.replace(/\s*\(.*?\)/g, '').trim().split(/\s+/), first = nm[0];
      var html = '<div class="scroll"><header class="hero"><svg class="wm" viewBox="0 0 24 24" aria-hidden="true"><use href="#star"/></svg>' +
        '<div class="htop"><span class="logo"><img src="icons/logo-128.png" alt="Логотип студсовета"></span><span class="hdate">' + UI.longDate(now) + '</span>' +
        '<button class="ib hb" data-go="search" aria-label="Поиск"><svg class="i"><use href="#search"/></svg></button></div>' +
        '<p class="hhi">' + UI.greeting(now) + ',</p><h1 class="hname">' + esc(first) + '</h1><p class="hplace">' + esc(place) + '</p></header><div class="home">';
      html += '<div class="card stat"><svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct)).toFixed(1) + ';--from:' + (C * (1 - (lastPct == null ? 0 : lastPct))).toFixed(1) + '"/></svg>' +
        '<span class="ringn num">' + (wk.length ? Math.round(pct * 100) + '%' : '—') + '</span><span style="flex:1"><b>' + (wk.length ? 'Готово ' + wkDone + ' из ' + wk.length : 'На неделе задач нет') + '</b><small>задачи за неделю до и после сегодня</small>' +
        '<span class="pills"><span class="tag' + (g.overdue.length ? ' late' : ' ok') + '">Просрочено ' + g.overdue.length + '</span><span class="tag info">Сегодня ' + g.today.length + '</span></span></span></div>';
      lastPct = pct;
      html += '<div class="card" data-leave><h2>Мои задачи <button class="link" data-go="tasks">Все ' + open.length + '</button></h2>' +
        (open.slice(0, 4).map(function (t) { return Tasks.row(t, now); }).join('') || UI.empty('ok', 'Задач нет', 'Можно выдохнуть.', true)) + '</div>';
      html += '<div class="card"><h2>Ближайшие мероприятия <button class="link" data-go="events">Все</button></h2>' +
        (evs.map(function (e) { return Events.eventRow(e, now); }).join('') || UI.empty('cal', 'Пока пусто', 'Ничего не запланировано.', true)) + '</div>';
      if (news.length) html += '<div class="card"><h2>Объявления <button class="link" data-go="news">Все</button></h2>' + news.map(function (a) {
        return '<button class="row" data-go="news"><span style="flex:1"><span class="tag gold"><svg class="i"><use href="#star"/></svg>Важно</span><b style="margin-top:6px">' +
          esc(a.title) + '</b><small>Отметь, что ознакомлен(а)</small></span></button>';
      }).join('') + '</div>';
      var ld = window.Leads ? Leads.unread(me) : [];
      if (ld.length) html += '<div class="card"><h2>Руководителям <button class="link" data-go="leads">Открыть</button></h2>' + ld.slice(0, 2).map(function (p) {
        return '<button class="row" data-go="leads"><span style="flex:1"><span class="tag ' + (p.kind === 'task' ? 'gold' : 'info') + '">' + (p.kind === 'task' ? 'Задача' : 'Информация') + '</span><b style="margin-top:6px">' + esc(p.title) + '</b></span></button>';
      }).join('') + '</div>';
      if (props.length) html += '<div class="card"><h2>Предложения мероприятий</h2>' + props.map(Events.proposalRow).join('') + '</div>';
      var s = el(html + '</div></div>');
      Tasks.bindChecks(s, me);
      Events.bindDecisions(s, me);
      return s;
    }
  });

  window.News = { unread: unread };
})();
