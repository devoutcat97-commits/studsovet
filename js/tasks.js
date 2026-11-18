/* Задачи: список по срокам, карточка с комментариями, создание. */
(function () {
  'use strict';

  var esc = UI.esc;
  var filter = 'mine';
  var GROUPS = [['overdue', 'Просрочено'], ['today', 'Сегодня'], ['week', 'На этой неделе'], ['later', 'Позже']];
  var STATUS = [['todo', 'Не начато'], ['doing', 'В работе'], ['done', 'Готово']];

  function el(html) { var s = document.createElement('section'); s.className = 'screen on'; s.innerHTML = html; return s; }
  function member(id) { return Store.get('members', id) || { name: '—', positions: [] }; }
  function short(name) { var p = name.split(' '); return p[1] ? p[0] + ' ' + p[1][0] + '.' : name; }
  function myUnits(m) { return m.positions.map(function (p) { return p.unitId; }); }

  // Какие задачи видны под каждым фильтром.
  function pick(f, me) {
    var all = Store.list('tasks');
    if (f === 'mine') return all.filter(function (t) { return t.assigneeUid === me.id; });
    if (f === 'unit') { var u = myUnits(me); return all.filter(function (t) { return u.indexOf(t.unitId) >= 0; }); }
    return all;
  }

  // Строка задачи. withWho — показывать исполнителя (в чужих списках и чек-листах).
  function row(t, now, withWho) {
    var done = t.status === 'done', late = UI.isOverdue(t, now);
    var ev = t.eventId && Store.get('events', t.eventId);
    var when = done ? 'Готово' : late ? 'Просрочено · ' + UI.dueLabel(t.deadline, now) : UI.dueLabel(t.deadline, now);
    var sub = [withWho ? short(member(t.assigneeUid).name) : '', when, ev ? ev.title : ''].filter(Boolean).join(' · ');
    return '<div class="row' + (done ? ' done-t' : '') + '">' +
      '<button class="check' + (done ? ' done' : '') + (done && t.id === justDone ? ' pop' : '') + '" data-done="' + t.id + '" aria-label="' + (done ? 'Вернуть в работу' : 'Отметить выполненной') + '" aria-pressed="' + done + '">' +
      (done ? '<svg class="i" style="width:16px;height:16px"><use href="#ok"/></svg>' : '') + '</button>' +
      '<button style="text-align:left;flex:1" data-go="task" data-arg="' + t.id + '"><b>' + esc(t.title) + '</b><small' + (late ? ' class="late"' : '') + '>' + esc(sub) + '</small></button></div>';
  }

  // Галочка: выполнено / вернуть. Отмечать может исполнитель или тот, кто управляет подразделением.
  // Ответственный за мероприятие (например, автор одобренного предложения) тоже управляет его задачами.
  function ownsEvent(me, eventId) { var ev = eventId && Store.get('events', eventId); return !!ev && ev.ownerUid === me.id; }
  // Менять текст, срок, исполнителя и удалять — руководитель подразделения или ответственный за мероприятие.
  function canManageTask(me, t) { return Units.canManage(me, t.unitId) || ownsEvent(me, t.eventId); }
  function canEdit(me, t) { return t.assigneeUid === me.id || Units.canManage(me, t.unitId) || ownsEvent(me, t.eventId); }
  var justDone = null;
  function bindChecks(root, me) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-done]');
      if (!b) return;
      var t = Store.get('tasks', b.dataset.done);
      if (!canEdit(me, t)) return UI.toast('Отмечать может исполнитель или руководитель подразделения.');
      var prev = t.status, done = prev !== 'done';
      function apply(st) {
        t.status = st; t.doneAt = st === 'done' ? new Date().toISOString() : null;
        justDone = st === 'done' ? t.id : null;
        setTimeout(function () { justDone = null; }, 800);
        Store.put('tasks', t); App.show();
      }
      if (!done) return apply('todo');
      b.classList.add('done', 'pop'); b.innerHTML = '<svg class="i" style="width:16px;height:16px"><use href="#ok"/></svg>';
      UI.burst(b);
      var row = b.closest('.row'), leave = b.closest('[data-leave]');
      if (leave) row.classList.add('leaving');
      setTimeout(function () {
        apply('done');
        UI.toast('Готово: ' + t.title, 'Отменить', function () { apply(prev); });
      }, leave ? 460 : 0);
    });
  }

  App.screen('tasks', {
    render: function () {
      var me = App.me(), now = new Date();
      var list = pick(filter === 'done' ? 'mine' : filter, me);
      var g = UI.groupByDue(list, now);
      var count = function (f) { return pick(f, me).filter(function (t) { return t.status !== 'done'; }).length; };
      var chips = [['mine', 'Мои'], ['unit', 'Подразделения'], ['all', 'Все'], ['done', 'Готово']].map(function (c) {
        return '<button class="chip" data-f="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '">' + c[1] +
          (c[0] !== 'done' ? ' · ' + count(c[0]) : '') + '</button>';
      }).join('');
      var body = '';
      if (filter === 'done') {
        body = g.done.length ? '<div class="card">' + g.done.map(function (t) { return row(t, now); }).join('') + '</div>'
          : UI.empty('ok', 'Пока ничего не закрыто', 'Отмечай задачи галочкой, и они появятся здесь.');
      } else {
        GROUPS.forEach(function (gr) {
          if (!g[gr[0]].length) return;
          body += '<p class="group' + (gr[0] === 'overdue' ? ' lt' : '') + '">' + gr[1] + '</p><div class="card">' +
            g[gr[0]].map(function (t) { return row(t, now, filter !== 'mine'); }).join('') + '</div>';
        });
        if (!body) body = UI.empty('tasks', 'Задач нет', 'Здесь появятся задачи с ближайшими сроками.');
      }
      var s = el('<div class="bar"><h1>Задачи</h1><button class="ib" data-go="search" aria-label="Поиск"><svg class="i"><use href="#search"/></svg></button></div><div class="chips" role="group" aria-label="Какие задачи">' + chips + '</div>' +
        '<div class="scroll"' + (filter === 'done' ? '' : ' data-leave') + '>' + body + '</div>' +
        '<button class="fab adm flex" data-go="newtask"><svg class="i"><use href="#plus"/></svg>Задача</button>');
      s.querySelector('.chips').addEventListener('click', function (e) {
        var c = e.target.closest('[data-f]'); if (c) { filter = c.dataset.f; App.show(); }
      });
      bindChecks(s, me);
      return s;
    }
  });

  App.screen('task', {
    tab: 'tasks',
    render: function (id) {
      var me = App.me(), now = new Date(), t = Store.get('tasks', id);
      if (!t) return el('<div class="bar"><button class="ib" data-go="tasks" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Задача</h1></div><div class="empty"><b>Задача не найдена</b>Возможно, её удалили.</div>');
      var ev = t.eventId && Store.get('events', t.eventId), u = Units.unit(t.unitId);
      var late = UI.isOverdue(t, now), d = new Date(t.deadline);
      var lateDays = -UI.daysBetween(now, d);
      var list = Store.list('comments').filter(function (c) { return c.taskId === t.id; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      var comments = list.map(function (c) {
        var who = member(c.uid);
        return '<div class="comment">' + UI.ava(who) + '<div><small>' +
          (c.uid === me.id ? 'Ты' : esc(short(who.name))) + ' · ' + UI.dueLabel(c.at, now).replace(/ до /, ' ') + '</small><p>' + esc(c.text) + '</p></div></div>';
      }).join('') || '<p class="hint" style="padding:6px 0">Пока без комментариев.</p>';
      var s = el('<div class="bar"><button class="ib" data-go="tasks" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Задача</h1></div>' +
        '<div class="scroll"><div class="card"><h2 style="font-size:20px">' + esc(t.title) + '</h2>' +
        (late ? '<p class="tag late" style="margin:6px 0 14px"><svg class="i"><use href="#alert"/></svg>Просрочено' + (lateDays > 0 ? ' на ' + lateDays + ' дн.' : '') + '</p>' : '<div style="height:10px"></div>') +
        '<div class="meta"><svg class="i"><use href="#clock"/></svg><span>Срок <b class="num">' + UI.longDate(d) + ', ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + '</b></span>' +
        '<svg class="i"><use href="#user"/></svg><span>Исполнитель <b>' + esc(member(t.assigneeUid).name) + '</b></span>' +
        (ev ? '<svg class="i"><use href="#cal"/></svg><span>Мероприятие <b>' + esc(ev.title) + '</b></span>' : '') +
        (u ? '<svg class="i"><use href="#folder"/></svg><span>Подразделение <b>' + esc(u.name) + '</b></span>' : '') + '</div>' +
        (t.details ? '<p style="margin-top:12px;font-size:15px">' + esc(t.details) + '</p>' : '') +
        '<div class="segm" style="margin-top:16px" role="group" aria-label="Статус">' + STATUS.map(function (st) {
          return '<button data-st="' + st[0] + '" aria-pressed="' + (t.status === st[0]) + '"' + (canEdit(me, t) ? '' : ' disabled') + '>' + st[1] + '</button>';
        }).join('') + '</div></div>' +
        (canManageTask(me, t) && !t.deleted ? '<div class="card"><button class="row" data-go="edittask" data-arg="' + t.id + '"><svg class="i"><use href="#settings"/></svg><span style="flex:1"><b>Изменить задачу</b><small>Название, исполнитель, срок, подробности</small></span><svg class="i"><use href="#next"/></svg></button>' +
          '<button class="row danger" id="tdel"><svg class="i"><use href="#trash"/></svg><span><b>Удалить задачу</b></span></button></div>' : '') +
        '<div class="card"><h2>Комментарии · ' + list.length + '</h2>' + comments + '</div></div>' +
        '<form class="composer"><input class="inp" name="c" placeholder="Написать комментарий" aria-label="Комментарий" maxlength="1000" required>' +
        '<button class="send" aria-label="Отправить"><svg class="i"><use href="#send"/></svg></button></form>');
      s.querySelector('.segm').addEventListener('click', function (e) {
        var b = e.target.closest('[data-st]'); if (!b || b.disabled) return;
        t.status = b.dataset.st; Store.put('tasks', t); App.show();
      });
      var td = s.querySelector('#tdel');
      if (td) td.addEventListener('click', function () {
        UI.confirm('Удалить задачу «' + t.title + '»?', 'Удалить', true).then(function (ok) {
          if (!ok) return;
          t.deleted = true; Store.put('tasks', t);
          UI.toast('Задача удалена', 'Вернуть', function () { t.deleted = false; Store.put('tasks', t); App.show(); });
          App.go(t.eventId ? 'event' : 'tasks', t.eventId || null);
        });
      });
      s.querySelector('.composer').addEventListener('submit', function (e) {
        e.preventDefault();
        var text = this.c.value.trim(); if (!text) return;
        Store.put('comments', { taskId: t.id, uid: me.id, text: text, at: new Date().toISOString() }); App.show();
      });
      return s;
    }
  });

  App.screen('newtask', {
    tab: 'tasks',
    render: function (eventId) {
      var me = App.me();
      var own = eventId && ownsEvent(me, eventId) ? Store.get('events', eventId).unitId : null;
      var units = Units.all.filter(function (u) { return Units.canManage(me, u.id) || u.id === own; });
      if (!units.length) return el('<div class="bar"><button class="ib" data-go="tasks" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Новая задача</h1></div><div class="empty"><b>Нет прав</b>Ставить задачи могут руководство, руководители отделов и главы активов. Попроси разрешение у председателя.</div>');
      var people = Store.list('members').filter(function (m) { return m.status === 'active'; });
      var events = Store.list('events').filter(function (e) { return new Date(e.date) >= new Date(new Date().toDateString()); });
      var tomorrow = new Date(Date.now() + 864e5); tomorrow.setHours(18, 0, 0, 0);
      var local = new Date(tomorrow - tomorrow.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      var s = el('<div class="bar"><button class="ib" data-go="tasks" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Новая задача</h1></div>' +
        '<div class="scroll"><form class="form" novalidate>' +
        '<label class="f">Что сделать<input class="inp" name="title" required maxlength="140" placeholder="Например, купить шары"></label>' +
        '<label class="f">Исполнитель<select class="inp" name="who">' + people.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Срок<input class="inp" type="datetime-local" name="deadline" required value="' + local + '"></label>' +
        '<label class="f">Подразделение<select class="inp" name="unit">' + units.map(function (u) { return '<option value="' + u.id + '">' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Мероприятие <span class="hint">необязательно</span><select class="inp" name="event"><option value="">Без мероприятия</option>' +
        events.map(function (e) { return '<option value="' + e.id + '"' + (e.id === eventId ? ' selected' : '') + '>' + esc(e.title) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Подробности <span class="hint">необязательно</span><textarea class="inp" name="details" rows="3" maxlength="2000"></textarea></label>' +
        '<p class="hint late" id="err" hidden></p>' +
        '<button class="btn">Создать задачу</button></form></div>');
      var f = s.querySelector('form');
      if (eventId) { var ev = Store.get('events', eventId); if (ev && units.some(function (u) { return u.id === ev.unitId; })) f.unit.value = ev.unitId; }
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = s.querySelector('#err'), title = f.title.value.trim();
        if (!title || !f.deadline.value) { err.hidden = false; err.textContent = 'Напиши, что сделать, и выбери срок.'; return; }
        if (!Units.canManage(me, f.unit.value) && !(f.unit.value === own && f.event.value === eventId)) { err.hidden = false; err.textContent = 'Нет прав ставить задачи в этом подразделении.'; return; }
        var nt = Store.put('tasks', { title: title, assigneeUid: f.who.value, deadline: new Date(f.deadline.value).toISOString(), unitId: f.unit.value,
          eventId: f.event.value || null, details: f.details.value.trim(), status: 'todo', createdBy: me.id });
        if (window.Push) Push.notify('task', nt.id);
        UI.toast('Задача создана');
        App.go(f.event.value ? 'event' : 'tasks', f.event.value || null);
      });
      return s;
    }
  });

  App.screen('edittask', {
    tab: 'tasks',
    render: function (id) {
      var me = App.me(), t = Store.get('tasks', id);
      var head = '<div class="bar"><button class="ib" data-go="task" data-arg="' + (t ? t.id : '') + '" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Изменить задачу</h1></div>';
      if (!t || !canManageTask(me, t)) return el(head + UI.empty('tasks', 'Нет прав', 'Менять задачу может руководитель подразделения или ответственный за мероприятие.'));
      var people = Store.list('members').filter(function (m) { return m.status === 'active'; });
      var d = new Date(t.deadline), local = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      var s = el(head + '<div class="scroll"><form class="form" novalidate>' +
        '<label class="f">Что сделать<input class="inp" name="title" required maxlength="140" value="' + esc(t.title) + '"></label>' +
        '<label class="f">Исполнитель<select class="inp" name="who">' + people.map(function (m) { return '<option value="' + m.id + '"' + (m.id === t.assigneeUid ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="f">Срок<input class="inp" type="datetime-local" name="deadline" required value="' + local + '"></label>' +
        '<label class="f">Подробности <span class="hint">необязательно</span><textarea class="inp" name="details" rows="4" maxlength="2000">' + esc(t.details || '') + '</textarea></label>' +
        '<p class="hint late" id="err" hidden></p><button class="btn">Сохранить</button></form></div>');
      var f = s.querySelector('form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.title.value.trim() || !f.deadline.value) { var err = s.querySelector('#err'); err.hidden = false; err.textContent = 'Нужны название и срок.'; return; }
        var moved = f.who.value !== t.assigneeUid;
        t.title = f.title.value.trim(); t.assigneeUid = f.who.value; t.deadline = new Date(f.deadline.value).toISOString(); t.details = f.details.value.trim();
        Store.put('tasks', t);
        if (moved && window.Push) Push.notify('task', t.id);
        UI.toast('Задача сохранена');
        App.go('task', t.id);
      });
      return s;
    }
  });

  window.Tasks = { row: row, bindChecks: bindChecks, pick: pick };
})();
