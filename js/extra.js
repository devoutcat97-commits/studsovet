/* Мой профиль и режим проектора для собраний. */
(function () {
  'use strict';

  var esc = UI.esc;
  var MONTH_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  function el(html, cls) { var s = document.createElement('section'); s.className = 'screen on' + (cls ? ' ' + cls : ''); s.innerHTML = html; return s; }

  // ---------- Мой профиль ----------
  App.screen('profile', {
    tab: 'more',
    render: function () {
      var me = App.me(), now = new Date(), today = new Date(now.toDateString());
      var mine = Tasks.pick('mine', me);
      var closed = mine.filter(function (t) { var d = t.doneAt && new Date(t.doneAt); return t.status === 'done' && d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
      var open = mine.filter(function (t) { return t.status !== 'done'; });
      var late = open.filter(function (t) { return UI.isOverdue(t, now); });
      var evs = Store.list('events').filter(function (e) {
        return new Date(e.date) >= today && (e.ownerUid === me.id || Store.get('going', e.id + '_' + me.id));
      }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      var posts = (me.positions || []).map(function (p) {
        var u = Units.unit(p.unitId);
        return u ? '<div class="row"><span class="udot big" style="--u:' + Units.color(u.id) + '"></span><span style="flex:1"><b>' + esc(Units.postName(p)) + '</b><small>' + esc(u.name) + '</small></span></div>' : '';
      }).join('') || '<div class="row"><span class="udot big" style="--u:#951A1D"></span><span><b>Член студсовета</b><small>Должность назначает председатель</small></span></div>';
      var html = '<div class="bar"><button class="ib" data-go="more" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Мой профиль</h1></div><div class="scroll">' +
        '<div class="card prof"><label class="avapick" aria-label="Сменить фото профиля">' + UI.ava(me) +
        '<span class="cam"><svg class="i"><use href="#image"/></svg></span><input type="file" accept="image/*" id="avain" hidden></label>' +
        '<b>' + esc(me.name) + '</b><small>' + esc(me.email || '') + '</small>' +
        (Store.get('avatars', me.id) ? '<button class="link" id="avadel">Убрать фото</button>' : '<small class="hint">Нажми на кружок, чтобы поставить фото</small>') + '</div>' +
        '<div class="tiles"><div class="tile"><b class="num">' + closed.length + '</b><small>закрыто в ' + MONTH_IN[now.getMonth()] + '</small></div>' +
        '<div class="tile"><b class="num">' + open.length + '</b><small>в работе</small></div>' +
        '<div class="tile' + (late.length ? ' bad' : '') + '"><b class="num">' + late.length + '</b><small>просрочено</small></div></div>' +
        '<div class="card"><button class="row" id="bugbtn"><svg class="i"><use href="#bug"/></svg><span style="flex:1"><b>Сообщить об ошибке</b><small>Опиши, что пошло не так, — отчёт придёт администратору</small></span><svg class="i"><use href="#next"/></svg></button></div>' +
        '<p class="group">Должности</p><div class="card">' + posts + '</div>' +
        '<p class="group">Мои мероприятия</p><div class="card">' +
        (evs.map(function (e) { return Events.eventRow(e, now); }).join('') || UI.empty('cal', 'Пока нет', 'Здесь будут мероприятия, за которые ты отвечаешь или на которые идёшь.', true)) + '</div>' +
        '</div>';
      var s = el(html);
      s.querySelector('#avain').addEventListener('change', function () {
        if (this.files[0]) Files.setAvatar(this.files[0], me).then(function () { UI.toast('Фото обновлено'); App.show(); }).catch(function (e) { UI.toast(e.message); });
      });
      s.querySelector('#bugbtn').addEventListener('click', function () {
        UI.dialog({ text: 'Что пошло не так?', area: 'Что делал(а), что ожидал(а), что получилось', ok: 'Отправить' }).then(function (text) {
          if (!text) return;
          var v = (document.querySelector('script[src*="js/app.js"]') || {}).src || '';
          var b = Store.put('bugs', { uid: me.id, name: me.name, text: text.slice(0, 2000), status: 'new', at: new Date().toISOString(),
            device: navigator.userAgent.slice(0, 200), screen: innerWidth + '×' + innerHeight, app: (v.split('?v=')[1] || '') });
          if (window.Push) Push.notify('bug', b.id);
          UI.toast('Спасибо! Отчёт отправлен.');
        });
      });
      var del = s.querySelector('#avadel');
      if (del) del.addEventListener('click', function () {
        UI.confirm('Убрать фото профиля?', 'Убрать', true).then(function (ok) { if (ok) { Store.remove('avatars', me.id); App.show(); } });
      });
      return s;
    }
  });

  // ---------- Проектор: всё крупно, без меню ----------
  var clock = null;
  App.screen('projector', {
    noTabs: true,
    render: function () {
      var now = new Date(), today = new Date(now.toDateString());
      var tasks = Store.list('tasks').filter(function (t) { return t.status !== 'done'; });
      var late = tasks.filter(function (t) { return UI.isOverdue(t, now); }).sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
      var week = tasks.filter(function (t) { var n = UI.daysBetween(now, new Date(t.deadline)); return !UI.isOverdue(t, now) && n >= 0 && n < 7; })
        .sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
      var evs = Store.list('events').filter(function (e) { return new Date(e.date) >= today; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).slice(0, 5);
      var who = function (t) { var m = Store.get('members', t.assigneeUid); return m ? m.name : '—'; };
      var trow = function (t, bad) {
        return '<li><span class="pt">' + esc(t.title) + '</span><span class="pw2">' + esc(who(t)) + ' · <span' + (bad ? ' class="late"' : '') + '>' + esc(UI.dueLabel(t.deadline, now)) + '</span></span></li>';
      };
      var html = '<div class="proj">' +
        '<header class="phead"><span class="logo"><img src="icons/logo-128.png" alt=""></span><span style="flex:1"><b>Студенческий совет</b><span>' + UI.longDate(now) + '</span></span>' +
        '<span class="pclock num" id="pclock"></span>' +
        '<button class="ib" id="pfull" aria-label="На весь экран"><svg class="i"><use href="#screen"/></svg></button>' +
        '<button class="ib" data-go="more" aria-label="Выйти из режима проектора"><svg class="i"><use href="#close"/></svg></button></header>' +
        '<div class="pgrid">' +
        '<section class="pcard"><h2>Ближайшие мероприятия</h2>' + (evs.map(function (e) { return Events.eventRow(e, now); }).join('') || '<p class="pnone">Ничего не запланировано</p>') + '</section>' +
        '<section class="pcard"><h2>Просрочено <span class="pn' + (late.length ? ' bad' : '') + '">' + late.length + '</span></h2><ul>' + (late.slice(0, 6).map(function (t) { return trow(t, true); }).join('') || '<p class="pnone">Всё в срок</p>') + '</ul>' +
        '<h2 style="margin-top:28px">На неделе <span class="pn">' + week.length + '</span></h2><ul>' + (week.slice(0, 6).map(function (t) { return trow(t); }).join('') || '<p class="pnone">Сроков нет</p>') + '</ul></section>' +
        '</div></div>';
      var s = el(html, 'projector');
      function tick() { var c = s.querySelector('#pclock'); if (!c || !c.isConnected) return clearInterval(clock); var d = new Date(); c.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
      clearInterval(clock); clock = setInterval(tick, 10000); setTimeout(tick);
      s.querySelector('#pfull').addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      });
      return s;
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && location.hash === '#projector' && !document.fullscreenElement) App.go('more'); });
})();
