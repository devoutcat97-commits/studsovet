/* «Руководителям» (задачи и информация от руководства), корзина мероприятий, отчёты об ошибках. */
(function () {
  'use strict';

  var esc = UI.esc;
  function el(html) { var s = document.createElement('section'); s.className = 'screen on'; s.innerHTML = html; return s; }
  function back(to, title, extra) {
    return '<div class="bar"><button class="ib" data-go="' + to + '" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>' + title + '</h1>' + (extra || '') + '</div>';
  }
  function who(id) { var m = Store.get('members', id); return m ? m.name : '—'; }
  function when(iso) { var d = new Date(iso); return UI.longDate(d) + ', ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  // Кто получает записи: руководители/главы и их заместители.
  function heads() { return Store.list('members').filter(function (m) { return Units.isHead(m); }); }
  function read(p, uid) { return !!Store.get('reads', p.id + '_' + uid); }
  function unread(me) { return Units.isHead(me) ? Store.list('leads').filter(function (p) { return p.authorUid !== me.id && !read(p, me.id); }) : []; }

  // ---------- Руководителям ----------
  App.screen('leads', {
    tab: 'more',
    render: function () {
      var me = App.me(), now = new Date();
      if (!Units.seesBrief(me)) return el(back('more', 'Руководителям') + UI.empty('flag', 'Нет доступа', 'Раздел для руководителей отделов, глав активов и их заместителей.'));
      var hs = heads();
      var list = Store.list('leads').sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      var html = list.map(function (p) {
        var mine = read(p, me.id), cnt = hs.filter(function (h) { return read(p, h.id); }).length;
        var late = p.kind === 'task' && p.deadline && new Date(p.deadline) < now;
        return '<div class="card"><span class="tag ' + (p.kind === 'task' ? 'gold' : 'info') + '">' + (p.kind === 'task' ? 'Задача' : 'Информация') + '</span>' +
          '<h2 style="margin-top:8px">' + esc(p.title) + '</h2>' + (p.text ? '<p style="font-size:15px;white-space:pre-line">' + esc(p.text) + '</p>' : '') +
          (p.deadline ? '<p class="hint' + (late ? ' late' : '') + '" style="margin-top:8px">Срок: ' + when(p.deadline) + '</p>' : '') +
          '<p class="hint" style="margin-top:6px">' + esc(who(p.authorUid)) + ' · ' + UI.dueLabel(p.at, now).replace(/ до /, ' ') + '</p>' +
          '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">' +
          (Units.isHead(me) && p.authorUid !== me.id ? (mine ? '<span class="tag ok"><svg class="i"><use href="#ok"/></svg>Принято</span>' : '<button class="btn sm" data-ack="' + p.id + '">Принято</button>') : '') +
          (Units.canBrief(me) ? '<span class="hint">Приняли ' + cnt + ' из ' + hs.length + '</span>' : '') +
          (p.authorUid === me.id || Units.isTop(me) ? '<button class="link" data-rm="' + p.id + '" style="margin-left:auto">Удалить</button>' : '') + '</div></div>';
      }).join('') || UI.empty('flag', 'Пока пусто', Units.canBrief(me) ? 'Напиши первую задачу или новость для руководителей.' : 'Здесь появятся задачи и информация от руководства.');
      var s = el(back('more', 'Руководителям', Units.canBrief(me) ? '<button class="ib" data-go="newlead" aria-label="Новая запись"><svg class="i"><use href="#plus"/></svg></button>' : '') +
        '<div class="scroll"><p class="hint" style="margin:12px 18px 0">Видят только руководство, руководители отделов, главы активов и их заместители.</p>' + html + '</div>');
      s.addEventListener('click', function (e) {
        var a = e.target.closest('[data-ack]'), r = e.target.closest('[data-rm]');
        if (a) { Store.put('reads', { id: a.dataset.ack + '_' + me.id, annId: a.dataset.ack, uid: me.id, at: new Date().toISOString() }); App.show(); }
        if (r) UI.confirm('Удалить запись для руководителей?', 'Удалить', true).then(function (ok) {
          if (!ok) return;
          var p = Store.get('leads', r.dataset.rm); p.deleted = true; Store.put('leads', p); App.show();
        });
      });
      return s;
    }
  });

  App.screen('newlead', {
    tab: 'more',
    render: function () {
      var me = App.me();
      if (!Units.canBrief(me)) return el(back('leads', 'Новая запись') + UI.empty('flag', 'Нет прав', 'Писать руководителям могут председатель, заместитель и секретарь.'));
      var s = el(back('leads', 'Новая запись') + '<div class="scroll"><form class="form" novalidate>' +
        '<div class="segm" role="group" aria-label="Тип"><button type="button" data-k="task" aria-pressed="true">Задача</button><button type="button" data-k="info" aria-pressed="false">Информация</button></div>' +
        '<label class="f">Заголовок<input class="inp" name="title" maxlength="140" required></label>' +
        '<label class="f">Подробности<textarea class="inp" name="text" rows="5" maxlength="4000"></textarea></label>' +
        '<label class="f" id="dl">Срок <span class="hint">необязательно</span><input class="inp" type="datetime-local" name="deadline"></label>' +
        '<p class="hint late" id="err" hidden></p><button class="btn">Отправить руководителям</button></form></div>');
      var f = s.querySelector('form'), kind = 'task';
      s.querySelector('.segm').addEventListener('click', function (e) {
        var b = e.target.closest('[data-k]'); if (!b) return;
        kind = b.dataset.k;
        this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        s.querySelector('#dl').hidden = kind !== 'task';
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.title.value.trim()) { var err = s.querySelector('#err'); err.hidden = false; err.textContent = 'Нужен заголовок.'; return; }
        var p = Store.put('leads', { kind: kind, title: f.title.value.trim(), text: f.text.value.trim(),
          deadline: kind === 'task' && f.deadline.value ? new Date(f.deadline.value).toISOString() : null, authorUid: me.id, at: new Date().toISOString() });
        if (window.Push) Push.notify('leads', p.id);
        UI.toast('Отправлено руководителям');
        App.go('leads');
      });
      return s;
    }
  });

  // ---------- Корзина ----------
  App.screen('trash', {
    tab: 'more',
    render: function () {
      var me = App.me();
      if (!Units.isTop(me)) return el(back('more', 'Корзина') + UI.empty('trash', 'Нет доступа', 'Корзину видят председатель, заместитель и админ.'));
      var list = Store.list('events', true).filter(function (e) { return e.deleted; }).sort(function (a, b) { return a.deletedAt < b.deletedAt ? 1 : -1; });
      var html = list.length ? '<div class="card">' + list.map(function (e) {
        return '<div class="row">' + Events.plate(e) + '<span style="flex:1"><b>' + esc(e.title) + '</b><small>Удалил(а) ' + esc(who(e.deletedBy)) + (e.deletedAt ? ' · ' + UI.longDate(new Date(e.deletedAt)) : '') + '</small></span>' +
          '<button class="btn sm ghost" data-restore="' + e.id + '">Вернуть</button></div>';
      }).join('') + '</div>' : UI.empty('trash', 'Корзина пуста', 'Удалённые мероприятия появятся здесь, их можно вернуть.');
      var s = el(back('more', 'Корзина') + '<div class="scroll">' + html + '</div>');
      s.addEventListener('click', function (e) {
        var b = e.target.closest('[data-restore]'); if (!b) return;
        Events.trash(Store.get('events', b.dataset.restore), me, false);
        UI.toast('Мероприятие возвращено'); App.show();
      });
      return s;
    }
  });

  // ---------- Отчёты об ошибках (только админ) ----------
  App.screen('bugs', {
    tab: 'more',
    render: function () {
      var me = App.me(), now = new Date();
      if (!me.isAdmin) return el(back('more', 'Отчёты') + UI.empty('bug', 'Нет доступа', 'Отчёты видит только администратор.'));
      var list = Store.list('bugs').sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      var card = function (b) {
        return '<div class="card"' + (b.status === 'done' ? ' style="opacity:.65"' : '') + '><p class="hint">' + esc(b.name || who(b.uid)) + ' · ' + UI.dueLabel(b.at, now).replace(/ до /, ' ') + '</p>' +
          '<p style="font-size:15px;white-space:pre-line;margin:6px 0">' + esc(b.text) + '</p>' +
          '<p class="hint" style="font-size:12px">' + esc([b.screen, b.app ? 'версия ' + b.app : '', b.device].filter(Boolean).join(' · ')) + '</p>' +
          (b.status === 'done' ? '<span class="tag ok" style="margin-top:8px">Решено</span>' : '<button class="btn sm" data-done="' + b.id + '" style="margin-top:10px">Решено</button>') + '</div>';
      };
      var open = list.filter(function (b) { return b.status !== 'done'; }), done = list.filter(function (b) { return b.status === 'done'; });
      var s = el(back('more', 'Отчёты об ошибках') + '<div class="scroll">' +
        (open.length ? open.map(card).join('') : UI.empty('bug', 'Новых отчётов нет', 'Участники отправляют их из «Мой профиль».')) +
        (done.length ? '<p class="group">Решённые</p>' + done.slice(0, 20).map(card).join('') : '') + '</div>');
      s.addEventListener('click', function (e) {
        var b = e.target.closest('[data-done]'); if (!b) return;
        var r = Store.get('bugs', b.dataset.done); r.status = 'done'; Store.put('bugs', r); App.show();
      });
      return s;
    }
  });

  window.Leads = { unread: unread };
})();
