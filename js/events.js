/* Мероприятия: список по месяцам, карточка с чек-листом, шаблоны, предложения. */
(function () {
  'use strict';

  var esc = UI.esc;
  var DAY = 864e5;

  // Встроенные шаблоны. daysBefore — за сколько дней до мероприятия срок пункта (минус — после).
  var BUILTIN = [
    { id: 'tpl-meeting', title: 'Собрание студсовета', builtin: true, items: [
      { text: 'Забронировать аудиторию', daysBefore: 5 }, { text: 'Составить повестку', daysBefore: 3 }, { text: 'Напомнить в чате', daysBefore: 1 }] },
    { id: 'tpl-lecture', title: 'Лекция / встреча с гостем', builtin: true, items: [
      { text: 'Пригласить гостя', daysBefore: 14 }, { text: 'Забронировать аудиторию', daysBefore: 7 },
      { text: 'Пост-анонс', daysBefore: 5 }, { text: 'Список гостей', daysBefore: 1 }] },
    { id: 'tpl-contest', title: 'Конкурс / турнир', builtin: true, items: [
      { text: 'Положение и правила', daysBefore: 21 }, { text: 'Найти жюри', daysBefore: 14 }, { text: 'Забронировать площадку', daysBefore: 14 },
      { text: 'Анонс и регистрация участников', daysBefore: 10 }, { text: 'Призы и грамоты', daysBefore: 5 }, { text: 'Пост с итогами', daysBefore: -1 }] },
    { id: 'tpl-trip', title: 'Выездное мероприятие', builtin: true, items: [
      { text: 'Согласовать с деканатом', daysBefore: 30 }, { text: 'Транспорт', daysBefore: 21 }, { text: 'Список участников', daysBefore: 14 },
      { text: 'Смета', daysBefore: 14 }, { text: 'Инструктаж участников', daysBefore: 2 }, { text: 'Отчёт о выезде', daysBefore: -2 }] }
  ];

  function templates() { return BUILTIN.concat(Store.list('templates')); }

  // Пункты шаблона → задачи с конкретными сроками (в 18:00 дня срока).
  function fromTemplate(tpl, eventIso) {
    var ev = new Date(eventIso);
    return tpl.items.map(function (it) {
      var d = new Date(ev.getTime() - it.daysBefore * DAY);
      d.setHours(18, 0, 0, 0);
      return { title: it.text, deadline: d.toISOString() };
    });
  }
  // Обратно: задачи мероприятия → пункты шаблона.
  function toTemplate(ev, tasks) {
    return tasks.map(function (t) { return { text: t.title, daysBefore: UI.daysBetween(new Date(t.deadline), new Date(ev.date)) }; });
  }

  function canEditEvent(me, ev) { return Units.canManage(me, ev.unitId) || ev.ownerUid === me.id; }
  function eventTasks(id) { return Store.list('tasks').filter(function (t) { return t.eventId === id; }); }
  function progress(id) {
    var ts = eventTasks(id);
    return { done: ts.filter(function (t) { return t.status === 'done'; }).length, total: ts.length };
  }
  function el(html) { var s = document.createElement('section'); s.className = 'screen on'; s.innerHTML = html; return s; }
  function back(to, title) {
    return '<div class="bar"><button class="ib" data-go="' + to + '" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>' + title + '</h1></div>';
  }
  function plate(ev) {
    var p = UI.plate(ev.date);
    return '<span class="plate u" style="--u:' + Units.color(ev.unitId) + '"><b class="num">' + p.day + '</b>' + p.mon + '</span>';
  }
  function going(id) { return Store.list('going').filter(function (g) { return g.eventId === id; }); }
  // Файл .ics: телефон предложит добавить мероприятие в свой календарь (на 2 часа, напоминание за час).
  function ics(ev) {
    var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    var clean = function (t) { return String(t || '').replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); };
    var d = new Date(ev.date);
    var text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//studsovet//RU', 'BEGIN:VEVENT', 'UID:' + ev.id + '@studsovet',
      'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(d), 'DTEND:' + f(new Date(d.getTime() + 2 * 36e5)),
      'SUMMARY:' + clean(ev.title), ev.place ? 'LOCATION:' + clean(ev.place) : '', ev.idea ? 'DESCRIPTION:' + clean(ev.idea) : '',
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + clean(ev.title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR']
      .filter(Boolean).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    a.download = (ev.title || 'event').replace(/[^\wа-яё ]+/gi, '').slice(0, 40) + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function eventRow(ev, now) {
    var pr = progress(ev.id), past = new Date(ev.date) < now, gn = going(ev.id).length;
    var pct = pr.total ? Math.max(2, Math.round(pr.done / pr.total * 100)) : 0;
    var sub = [ev.place, pr.total ? (past ? 'Проведено · ' : 'готово ') + pr.done + ' из ' + pr.total : '', gn && !past ? 'идут ' + gn : ''].filter(Boolean).join(' · ');
    return '<button class="row" data-go="event" data-arg="' + ev.id + '"' + (past ? ' style="opacity:.7"' : '') + '>' + plate(ev) +
      '<span style="flex:1"><b>' + esc(ev.title) + '</b><small>' + esc(sub) + '</small>' +
      (pr.total && !past ? '<span class="progress"><i style="width:' + pct + '%"></i></span>' : '') + '</span></button>';
  }

  App.screen('events', {
    render: function () {
      var me = App.me(), now = new Date(), today = new Date(now.toDateString());
      var all = Store.list('events').sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      var upcoming = all.filter(function (e) { return new Date(e.date) >= today; });
      var past = all.filter(function (e) { return new Date(e.date) < today; }).reverse().slice(0, 5);
      var mine = Store.list('proposals').filter(function (p) { return p.status === 'pending' && Units.canDecide(me, p); });
      var html = '';
      if (mine.length) html += '<p class="group">Предложения тебе · ' + mine.length + '</p><div class="card">' + mine.map(proposalRow).join('') + '</div>';
      var month = '';
      upcoming.forEach(function (e) {
        var m = UI.monthTitle(e.date);
        if (m !== month) { html += (month ? '</div>' : '') + '<p class="group">' + m + '</p><div class="card">'; month = m; }
        html += eventRow(e, now);
      });
      if (month) html += '</div>';
      if (!upcoming.length) html += UI.empty('cal', 'Мероприятий пока нет', 'Создай мероприятие или предложи своё.');
      if (past.length) html += '<p class="group">Прошедшие</p><div class="card">' + past.map(function (e) { return eventRow(e, now); }).join('') + '</div>';
      var s = el('<div class="bar"><h1>Мероприятия</h1><button class="ib" data-go="search" aria-label="Поиск"><svg class="i"><use href="#search"/></svg></button></div><div class="scroll">' + html + '</div>' +
        '<button class="fab adm flex" data-go="fromtpl"><svg class="i"><use href="#plus"/></svg>Мероприятие</button>' +
        '<button class="fab mem" data-go="propose"><svg class="i"><use href="#bulb"/></svg>Предложить</button>');
      bindDecisions(s, me);
      return s;
    }
  });

  App.screen('event', {
    tab: 'events',
    render: function (id) {
      var me = App.me(), now = new Date(), ev = Store.get('events', id);
      if (!ev) return el(back('events', 'Мероприятие') + '<div class="empty"><b>Мероприятие не найдено</b>Возможно, его удалили.</div>');
      var d = new Date(ev.date), u = Units.unit(ev.unitId), owner = Store.get('members', ev.ownerUid);
      var ts = eventTasks(id).sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
      var pr = progress(id), can = canEditEvent(me, ev), cover = Store.get('covers', id);
      var files = Store.list('files').filter(function (f) { return f.eventId === id; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      var s = el(back('events', 'Мероприятие') + '<div class="scroll">' +
        '<div class="cover">' + (cover ? '<img class="photo" src="' + esc(cover.data) + '" alt="Обложка мероприятия">' : '<img src="icons/logo-128.png" alt="">') +
        (can ? '<label class="coverbtn"><svg class="i"><use href="#image"/></svg>' + (cover ? 'Сменить обложку' : 'Добавить обложку') + '<input type="file" accept="image/*" id="coverin" hidden></label>' : '') + '</div>' +
        '<div class="card" style="display:flex;gap:14px;align-items:center"><span class="plate big u" style="--u:' + Units.color(ev.unitId) + '"><b class="num">' + d.getDate() + '</b>' + UI.plate(ev.date).mon + '</span>' +
        '<div><h2 style="font-size:20px">' + esc(ev.title) + '</h2><small style="color:var(--text-2)">' + UI.longDate(d) + ', ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') +
        (ev.place ? ' · ' + esc(ev.place) : '') + '<br><span class="udot" style="--u:' + Units.color(ev.unitId) + '"></span>' + esc(u ? u.name : '') + (owner ? ' · отвечает ' + esc(owner.name) : '') + '</small></div></div>' +
        goingCard(ev, me, now) +
        (ev.idea ? '<div class="card"><p style="font-size:15px">' + esc(ev.idea) + '</p></div>' : '') +
        '<div class="card"><h2>Подготовка <span class="num" style="font-weight:500;font-size:14px;color:var(--text-2)">' + pr.done + ' из ' + pr.total + '</span></h2>' +
        (pr.total ? '<div class="progress" style="margin-bottom:6px"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></div>' : '') +
        (ts.map(function (t) { return Tasks.row(t, now, true); }).join('') || '<p class="hint" style="padding:6px 0">Чек-лист пуст.</p>') +
        (can ? '<button class="row link" data-go="newtask" data-arg="' + ev.id + '"><svg class="i"><use href="#plus"/></svg>Добавить пункт</button>' : '') + '</div>' +
        '<div class="card"><h2>Материалы · ' + files.length + '</h2>' + files.map(function (f) {
          var k = Files.kind(f), who = Store.get('members', f.uid);
          var mayRemove = f.uid === me.id || can;
          return '<div class="row"><span class="file" style="background:' + k.color + '">' + esc(k.ext) + '</span>' +
            '<button style="flex:1;text-align:left" data-dl="' + f.id + '"><b>' + esc(f.name) + '</b><small>' + esc(who ? who.name.split(' ')[0] : '') + ' · ' + Files.size(f.size) + '</small></button>' +
            (mayRemove ? '<button class="ib" data-rm="' + f.id + '" aria-label="Удалить ' + esc(f.name) + '"><svg class="i"><use href="#trash"/></svg></button>' : '') + '</div>';
        }).join('') +
        '<label class="row link" style="cursor:pointer"><svg class="i"><use href="#clip"/></svg>Прикрепить файл<input type="file" id="filein" hidden></label>' +
        '<p class="hint" id="fmsg">' + (Store.isCloud() ? 'Файлы лежат в папке мероприятия на Google Диске студсовета, открыть их можно только через приложение. До 10 МБ.' : 'В демо-режиме файлы не загружаются.') + '</p></div>' +
        (can && ts.length ? '<div class="card"><button class="row" id="savetpl" style="padding:4px 0"><svg class="i"><use href="#layers"/></svg><span><b>Сохранить как шаблон</b><small>Чек-лист со сроками «за N дней»</small></span></button></div>' : '') +
        '</div>');
      Tasks.bindChecks(s, me);
      var gb = s.querySelector('#gobtn');
      if (gb) gb.addEventListener('click', function () {
        var key = id + '_' + me.id;
        if (Store.get('going', key)) Store.remove('going', key);
        else Store.put('going', { id: key, eventId: id, uid: me.id, at: new Date().toISOString() });
        App.show();
      });
      s.querySelector('#icsbtn').addEventListener('click', function () { ics(ev); });
      var msg = function (t) { var m = s.querySelector('#fmsg'); m.textContent = t; m.classList.add('late'); };
      var ci = s.querySelector('#coverin');
      if (ci) ci.addEventListener('change', function () {
        if (this.files[0]) Files.setCover(id, this.files[0], me).then(App.show).catch(function (e) { msg(e.message); });
      });
      s.querySelector('#filein').addEventListener('change', function () {
        var f = this.files[0]; if (!f) return;
        msg('Загружаем «' + f.name + '»…');
        Files.upload(id, f).then(function () { msg('Загружено. Появится в списке через пару секунд.'); }).catch(function (e) { msg(e.message); });
      });
      s.addEventListener('click', function (e) {
        var d = e.target.closest('[data-dl]'), r = e.target.closest('[data-rm]');
        if (d) { msg('Скачиваем…'); Files.download(d.dataset.dl).then(function () { msg('Готово.'); }).catch(function (er) { msg(er.message); }); }
        if (r) UI.confirm('Удалить файл? Он попадёт в корзину Диска.', 'Удалить', true).then(function (ok) { if (ok) Files.remove(r.dataset.rm).catch(function (er) { msg(er.message); }); });
      });
      var st = s.querySelector('#savetpl');
      if (st) st.addEventListener('click', function () {
        UI.ask('Название шаблона', ev.title).then(function (name) {
          if (!name) return;
          Store.put('templates', { title: name.slice(0, 80), items: toTemplate(ev, ts) });
          UI.toast('Шаблон сохранён');
        });
      });
      return s;
    }
  });

  // Карточка «Кто идёт» + кнопка «В календарь».
  function goingCard(ev, me, now) {
    var list = going(ev.id), mine = !!Store.get('going', ev.id + '_' + me.id), past = new Date(ev.date) < now;
    var people = list.map(function (g) { return Store.get('members', g.uid); }).filter(Boolean);
    var avas = people.slice(0, 5).map(function (m) { return UI.ava(m); }).join('');
    var names = people.slice(0, 3).map(function (m) { return m.id === me.id ? 'ты' : m.name.split(' ')[1] || m.name.split(' ')[0]; }).join(', ') + (people.length > 3 ? ' и ещё ' + (people.length - 3) : '');
    return '<div class="card"><div class="going">' + (avas ? '<span class="avas">' + avas + '</span>' : '') +
      '<span style="flex:1"><b>' + (list.length ? (past ? 'Были ' : 'Идут ') + list.length : (past ? 'Никто не отметился' : 'Пока никто не отметился')) + '</b>' +
      (names ? '<small>' + esc(names) + '</small>' : '') + '</span>' +
      (past ? '' : '<button class="btn sm' + (mine ? ' on' : ' ghost') + '" id="gobtn" aria-pressed="' + mine + '">' + (mine ? '<svg class="i"><use href="#ok"/></svg>Иду' : 'Иду') + '</button>') + '</div>' +
      '<button class="row link" id="icsbtn"><svg class="i"><use href="#calplus"/></svg>Добавить в календарь телефона</button></div>';
  }

  function localInput(date) { return new Date(date - date.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }

  App.screen('fromtpl', {
    tab: 'events',
    render: function () {
      var me = App.me(), tpls = templates(), chosen = tpls[0];
      var units = Units.all.filter(function (u) { return Units.canManage(me, u.id); });
      if (!units.length) return el(back('events', 'Новое мероприятие') + '<div class="empty"><b>Нет прав</b>Создавать мероприятия может руководство, руководители отделов и главы активов. Ты можешь предложить своё.</div>');
      var def = new Date(Date.now() + 14 * DAY); def.setHours(15, 0, 0, 0);
      var s = el(back('events', 'Новое мероприятие') + '<div class="scroll">' +
        '<p class="group" style="margin-top:12px">Шаблон</p><div class="tpl" role="group" aria-label="Шаблон" style="margin-top:8px">' +
        tpls.map(function (t, i) { return '<button type="button" data-t="' + t.id + '" aria-pressed="' + (i === 0) + '"><b>' + esc(t.title) + '</b><small>' + (t.builtin ? '' : 'Свой · ') + t.items.length + ' пункт.</small></button>'; }).join('') +
        '<button type="button" data-t="" aria-pressed="false"><b>Без шаблона</b><small>Пустой чек-лист</small></button></div>' +
        '<form class="form" style="padding-top:16px" novalidate>' +
        '<label class="f">Название<input class="inp" name="title" maxlength="120" required></label>' +
        '<label class="f">Дата и время<input class="inp" type="datetime-local" name="date" required value="' + localInput(def) + '"></label>' +
        '<label class="f">Место<input class="inp" name="place" maxlength="80"></label>' +
        '<label class="f">Подразделение<select class="inp" name="unit">' + units.map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
        '<div class="card" style="margin:0" id="preview"></div><p class="hint late" id="err" hidden></p>' +
        '<button class="btn">Создать мероприятие</button></form></div>');
      var f = s.querySelector('form');
      function preview() {
        var box = s.querySelector('#preview'), now = new Date();
        if (!chosen || !f.date.value) { box.innerHTML = '<p class="hint">Чек-лист будет пустым — пункты добавишь в карточке.</p>'; return; }
        box.innerHTML = '<h2>Будут созданы задачи</h2>' + fromTemplate(chosen, new Date(f.date.value).toISOString()).map(function (t) {
          var p = UI.plate(t.deadline), late = new Date(t.deadline) < now;
          return '<div class="row"><span class="plate"><b class="num">' + p.day + '</b>' + p.mon + '</span><span><b>' + esc(t.title) + '</b><small' + (late ? ' class="late">срок уже прошёл' : '>' + UI.dueLabel(t.deadline, now)) + '</small></span></div>';
        }).join('');
      }
      s.querySelector('.tpl').addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]'); if (!b) return;
        this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        chosen = templates().filter(function (t) { return t.id === b.dataset.t; })[0] || null;
        if (chosen && !f.title.value) f.title.value = chosen.title;
        preview();
      });
      f.date.addEventListener('change', preview);
      f.title.value = chosen ? chosen.title : '';
      preview();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = s.querySelector('#err');
        if (!f.title.value.trim() || !f.date.value) { err.hidden = false; err.textContent = 'Укажи название и дату.'; return; }
        if (!Units.canManage(me, f.unit.value)) { err.hidden = false; err.textContent = 'Нет прав в этом подразделении.'; return; }
        var iso = new Date(f.date.value).toISOString();
        var ev = Store.put('events', { title: f.title.value.trim(), date: iso, place: f.place.value.trim(), unitId: f.unit.value, ownerUid: me.id, templateId: chosen ? chosen.id : null });
        if (chosen) fromTemplate(chosen, iso).forEach(function (t) {
          Store.put('tasks', { title: t.title, deadline: t.deadline, assigneeUid: me.id, unitId: ev.unitId, eventId: ev.id, status: 'todo', createdBy: me.id });
        });
        App.go('event', ev.id);
      });
      return s;
    }
  });

  // Предложения
  function proposalRow(p) {
    var a = Store.get('members', p.authorUid) || { name: '—' };
    return '<div class="row" style="flex-wrap:wrap">' + UI.ava(a) + '<span style="flex:1"><b>' + esc(p.title) + '</b><small>' +
      esc(a.name) + ' · примерно ' + UI.longDate(new Date(p.date)) + '</small></span>' +
      (p.idea ? '<p style="width:100%;padding-left:46px;font-size:14px;color:var(--text-2)">' + esc(p.idea) + '</p>' : '') +
      '<span style="display:flex;gap:8px;width:100%;padding-left:46px"><button class="btn sm" data-ok="' + p.id + '">Одобрить</button><button class="btn sm ghost" data-no="' + p.id + '">Отклонить</button></span></div>';
  }
  // Одобрение: появляется мероприятие, автор становится ответственным.
  function decide(me, id, ok) {
    var p = Store.get('proposals', id);
    if (!p || p.status !== 'pending' || !Units.canDecide(me, p)) return null;
    p.status = ok ? 'approved' : 'rejected'; p.decidedBy = me.id; p.decidedAt = new Date().toISOString();
    var ev = null;
    if (ok) {
      ev = Store.put('events', { title: p.title, date: p.date, place: '', idea: p.idea, unitId: p.toUnitId, ownerUid: p.authorUid, proposalId: p.id });
      p.eventId = ev.id;
    }
    Store.put('proposals', p);
    return ev;
  }
  function bindDecisions(root, me) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ok],[data-no]'); if (!b) return;
      var ok = !!b.dataset.ok, id = b.dataset.ok || b.dataset.no;
      (ok ? Promise.resolve(true) : UI.confirm('Отклонить предложение?', 'Отклонить', true)).then(function (yes) {
        if (!yes) return;
        var ev = decide(me, id, ok);
        if (ev) { UI.toast('Мероприятие создано'); App.go('event', ev.id); } else App.show();
      });
    });
  }

  App.screen('propose', {
    tab: 'events',
    render: function () {
      var me = App.me();
      var def = new Date(Date.now() + 21 * DAY); def.setHours(15, 0, 0, 0);
      var opt = function (kind) { return Units.all.filter(function (u) { return u.kind === kind; }).map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join(''); };
      var mineList = Store.list('proposals').filter(function (p) { return p.authorUid === me.id; });
      var STATUS = { pending: 'на рассмотрении', approved: 'одобрено', rejected: 'отклонено' };
      var s = el(back('events', 'Предложить мероприятие') + '<div class="scroll"><form class="form" novalidate>' +
        '<p class="hint">Любой из студсовета может предложить идею. Если её одобрят, ты станешь ответственным(ой) за мероприятие.</p>' +
        '<label class="f">Название<input class="inp" name="title" maxlength="120" required></label>' +
        '<label class="f">Идея в двух словах<textarea class="inp" name="idea" rows="3" maxlength="1000"></textarea></label>' +
        '<label class="f">Примерная дата<input class="inp" type="datetime-local" name="date" required value="' + localInput(def) + '"></label>' +
        '<label class="f">Кому отправить<select class="inp" name="to"><option value="lead">Председателю</option><optgroup label="Руководителю отдела">' + opt('dept') + '</optgroup><optgroup label="Главе актива">' + opt('asset') + '</optgroup></select></label>' +
        '<p class="hint late" id="err" hidden></p><button class="btn">Отправить предложение</button></form>' +
        (mineList.length ? '<p class="group">Мои предложения</p><div class="card">' + mineList.map(function (p) {
          return '<div class="row"><span style="flex:1"><b>' + esc(p.title) + '</b><small>' + STATUS[p.status] + '</small></span>' +
            (p.eventId ? '<button class="link" data-go="event" data-arg="' + p.eventId + '">Открыть</button>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</div>');
      var f = s.querySelector('form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.title.value.trim() || !f.date.value) { var err = s.querySelector('#err'); err.hidden = false; err.textContent = 'Укажи название и примерную дату.'; return; }
        var np = Store.put('proposals', { title: f.title.value.trim(), idea: f.idea.value.trim(), date: new Date(f.date.value).toISOString(), toUnitId: f.to.value, authorUid: me.id, status: 'pending', at: new Date().toISOString() });
        if (window.Push) Push.notify('proposal', np.id);
        UI.toast('Предложение отправлено');
        App.show();
      });
      return s;
    }
  });

  window.Events = {
    plate: plate, fromTemplate: fromTemplate, toTemplate: toTemplate, decide: decide, canEditEvent: canEditEvent, eventRow: eventRow, proposalRow: proposalRow, bindDecisions: bindDecisions, builtin: BUILTIN };
})();
