/* Вход, заявка, ожидание одобрения; люди и заявки для руководства. */
(function () {
  'use strict';

  var esc = UI.esc;
  function el(html) { var s = document.createElement('section'); s.className = 'screen on'; s.innerHTML = html; return s; }
  function back(to, title) {
    return '<div class="bar"><button class="ib" data-go="' + to + '" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>' + title + '</h1></div>';
  }
  function fail(s, msg) { var e = s.querySelector('.err'); e.hidden = false; e.textContent = msg; }
  function busy(btn, on) { btn.disabled = on; btn.style.opacity = on ? .6 : 1; }
  var LOGO = '<div class="logo"><img src="icons/logo-128.png" alt="Логотип студсовета"></div>';

  // Строка «подразделение + должность» (необязательная: можно быть просто членом студсовета).
  function unitSelect(sel) {
    return '<select class="inp" name="unit"><option value="">— только член студсовета —</option>' +
      ['lead', 'dept', 'asset'].map(function (k) {
        var label = { lead: 'Руководство', dept: 'Отделы', asset: 'Активы направлений' }[k];
        return '<optgroup label="' + label + '">' + Units.all.filter(function (u) { return u.kind === k; }).map(function (u) {
          return '<option value="' + u.id + '"' + (u.id === sel ? ' selected' : '') + '>' + esc(u.name) + '</option>';
        }).join('') + '</optgroup>';
      }).join('') + '</select>';
  }
  function postSelect(unitId, sel) {
    var u = Units.unit(unitId);
    if (!u) return '<select class="inp" name="post" disabled><option>—</option></select>';
    var posts = Units.posts[u.kind];
    return '<select class="inp" name="post">' + Object.keys(posts).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + posts[k] + '</option>';
    }).join('') + '</select>';
  }
  function positionRow(p) {
    return '<div class="card pos" style="margin:0;display:flex;flex-direction:column;gap:10px">' +
      '<label class="f">Подразделение' + unitSelect(p && p.unitId) + '</label><label class="f">Должность<span class="postwrap">' + postSelect(p && p.unitId, p && p.post) + '</span></label></div>';
  }
  function bindPositions(s) {
    s.addEventListener('change', function (e) {
      if (e.target.name !== 'unit') return;
      e.target.closest('.pos').querySelector('.postwrap').innerHTML = postSelect(e.target.value);
    });
    var add = s.querySelector('[data-addpos]');
    if (add) add.addEventListener('click', function () { add.insertAdjacentHTML('beforebegin', positionRow()); });
  }
  function readPositions(s) {
    var out = [];
    s.querySelectorAll('.pos').forEach(function (r) {
      var u = r.querySelector('[name=unit]').value, p = r.querySelector('[name=post]');
      if (u && p && !p.disabled) out.push({ unitId: u, post: p.value });
    });
    return out;
  }

  App.screen('auth_out', {
    noTabs: true,
    render: function () {
      var s = el('<div class="scroll"><div class="center" style="padding-top:48px">' + LOGO +
        '<div><h1>Студенческий совет</h1><p>Алтайский филиал РАНХиГС. Задачи, мероприятия и объявления актива в одном месте.</p></div>' +
        '<form class="form" style="padding:0" novalidate>' +
        '<label class="f">Почта<input class="inp" type="email" name="email" autocomplete="email" required></label>' +
        '<label class="f">Пароль<span class="pw"><input class="inp" type="password" name="pass" autocomplete="current-password" required>' +
        '<button type="button" class="ib eye" aria-label="Показать пароль" aria-pressed="false"><svg class="i"><use href="#eye"/></svg></button></span></label>' +
        '<p class="hint late err" hidden></p>' +
        '<button class="btn" name="in">Войти</button>' +
        '<button class="btn ghost" type="button" name="up">Зарегистрироваться</button>' +
        '<div class="or">или</div><button class="btn ghost" type="button" name="google">Войти через Google</button>' +
        '<button class="link" type="button" name="reset" style="align-self:center">Забыл(а) пароль</button></form></div></div>');
      var f = s.querySelector('form');
      s.querySelector('.eye').addEventListener('click', function () {
        var show = f.pass.type === 'password';
        f.pass.type = show ? 'text' : 'password';
        this.setAttribute('aria-pressed', show);
        this.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
        this.querySelector('use').setAttribute('href', show ? '#eyeoff' : '#eye');
      });
      function run(btn, p) {
        busy(btn, true);
        p.catch(function (e) { fail(s, Cloud.human(e)); }).then(function () { busy(btn, false); });
      }
      f.addEventListener('submit', function (e) { e.preventDefault(); run(f.in, Cloud.signIn(f.email.value.trim(), f.pass.value)); });
      f.up.addEventListener('click', function () {
        if (f.pass.value.length < 8) return fail(s, 'Придумай пароль не короче 8 символов и нажми ещё раз.');
        run(f.up, Cloud.signUp(f.email.value.trim(), f.pass.value));
      });
      f.google.addEventListener('click', function () { run(f.google, Cloud.google()); });
      f.reset.addEventListener('click', function () {
        if (!f.email.value.trim()) return fail(s, 'Впиши почту, и пришлём ссылку для нового пароля.');
        Cloud.reset(f.email.value.trim()).then(function () { fail(s, 'Письмо со ссылкой отправлено на ' + f.email.value.trim() + '.'); })
          .catch(function (e) { fail(s, Cloud.human(e)); });
      });
      return s;
    }
  });

  App.screen('auth_apply', {
    noTabs: true,
    render: function () {
      var u = Cloud.user();
      var s = el('<div class="bar"><h1>Заявка в приложение</h1></div><div class="scroll"><form class="form" novalidate>' +
        '<p class="hint">Председатель или заместитель проверит заявку. До этого внутри ничего не видно.</p>' +
        '<label class="f">Имя и фамилия<input class="inp" name="name" autocomplete="name" maxlength="80" required value="' + esc(u && u.displayName || '') + '"></label>' +
        '<p class="group" style="margin:6px 0 0">Где ты в студсовете</p>' +
        '<p class="hint">Ты в любом случае член студсовета. Если ещё состоишь в отделе, активе или руководстве — укажи.</p>' +
        positionRow() + '<button class="link" type="button" data-addpos style="align-self:flex-start">+ Ещё отдел или актив</button>' +
        '<label class="consent"><input type="checkbox" name="ok"> Согласен(на) на хранение имени, почты и должностей для работы студсовета</label>' +
        '<p class="hint late err" hidden></p><button class="btn" name="send">Отправить заявку</button>' +
        '<button class="link" type="button" name="out" style="align-self:center">Выйти</button></form></div>');
      bindPositions(s);
      var f = s.querySelector('form');
      f.out.addEventListener('click', function () { Cloud.signOut(); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!f.name.value.trim()) return fail(s, 'Напиши имя и фамилию.');
        if (!f.ok.checked) return fail(s, 'Без согласия на хранение данных заявку не отправить.');
        busy(f.send, true);
        Cloud.request({ name: f.name.value.trim(), email: u.email || '', positions: readPositions(s), at: new Date().toISOString() })
          .catch(function (er) { fail(s, Cloud.human(er)); busy(f.send, false); });
      });
      return s;
    }
  });

  function stateScreen(icon, title, text) {
    return {
      noTabs: true,
      render: function () {
        var s = el('<div class="center" style="text-align:center;align-items:center"><div class="plate big"><svg class="i" style="width:36px;height:36px"><use href="#' + icon + '"/></svg></div>' +
          '<h1>' + title + '</h1><p>' + text + '</p><button class="btn ghost sm">Выйти</button></div>');
        s.querySelector('button').addEventListener('click', function () { Cloud.signOut(); });
        return s;
      }
    };
  }
  App.screen('auth_wait', stateScreen('hour', 'Заявка отправлена', 'Как только председатель или заместитель её одобрит, здесь откроются задачи и мероприятия. Обычно это занимает до суток.'));
  App.screen('auth_left', stateScreen('user', 'Доступ закрыт', 'Ты больше не в составе студсовета в приложении. Если это ошибка, напиши председателю.'));
  App.screen('auth_loading', { noTabs: true, render: function () { return el(UI.skeleton()); } });
  App.screen('auth_offline', stateScreen('alert', 'Нет связи', 'Не удалось загрузить приложение. Проверь интернет и обнови страницу.'));

  // Люди и заявки (руководство)
  App.screen('people', {
    tab: 'more',
    render: function () {
      var me = App.me();
      if (!Units.canApprovePeople(me)) return el(back('more', 'Люди') + '<div class="empty"><b>Нет прав</b>Этот раздел для председателя, заместителя и админа.</div>');
      var reqs = Store.list('requests').sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      var all = Store.list('members').filter(function (m) { return m.status === 'active'; });
      var row = function (m) {
        return '<button class="row" data-go="member" data-arg="' + m.id + '">' + UI.ava(m) + '<span style="flex:1"><b>' + esc(m.name) + '</b><small>' +
          esc(Units.title(m)) + '</small></span>' + (m.canCreate ? '<span class="tag ok">может создавать</span>' : '<svg class="i"><use href="#next"/></svg>') + '</button>';
      };
      var html = '';
      if (reqs.length) html += '<p class="group">Новые заявки · ' + reqs.length + '</p><div class="card">' + reqs.map(function (r) {
        return '<div class="row" style="flex-wrap:wrap">' + UI.ava(r) + '<span style="flex:1"><b>' + esc(r.name) + '</b><small>' +
          esc(Units.title(r)) + (r.email ? ' · ' + esc(r.email) : '') + '</small></span>' +
          '<span style="display:flex;gap:8px;width:100%;padding-left:46px"><button class="btn sm" data-approve="' + r.id + '">Одобрить</button><button class="btn sm ghost" data-reject="' + r.id + '">Отклонить</button></span></div>';
      }).join('') + '</div>';
      var lead = all.filter(function (m) { return m.lead; });
      if (lead.length) html += '<p class="group">Руководство</p><div class="card">' + lead.map(row).join('') + '</div>';
      ['dept', 'asset'].forEach(function (kind) {
        html += '<p class="group">' + (kind === 'dept' ? 'Отделы' : 'Активы направлений') + '</p><div class="card">' + Units.all.filter(function (u) { return u.kind === kind; }).map(function (u) {
          var ppl = all.filter(function (m) { return (m.positions || []).some(function (p) { return p.unitId === u.id; }); });
          var head = ppl.filter(function (m) { return m.positions.some(function (p) { return p.unitId === u.id && p.post === 'head'; }); })[0];
          return '<details><summary class="row"><span class="file" style="background:' + (kind === 'dept' ? '#951A1D' : '#2858C8') + '">' + u.short + '</span><span style="flex:1"><b>' + esc(u.name.replace('Актив ', '')) + '</b><small>' +
            (head ? (kind === 'dept' ? 'Руководитель ' : 'Глава ') + esc(head.name) : (kind === 'dept' ? 'Руководитель' : 'Глава') + ' не назначен') + ' · ' + ppl.length + ' чел.</small></span></summary>' + ppl.map(row).join('') + '</details>';
        }).join('') + '</div>';
      });
      html += '<p class="group">Все члены студсовета · ' + all.length + '</p><div class="card">' + all.map(row).join('') + '</div>';
      var s = el(back('more', 'Люди и заявки') + '<div class="scroll">' + html + '</div>');
      s.addEventListener('click', function (e) {
        var a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]');
        if (a) {
          var q = Store.get('requests', a.dataset.approve);
          Store.put('members', Units.derive({ id: q.id, name: q.name, email: q.email, positions: q.positions || [], status: 'active', canCreate: false, isAdmin: false, at: new Date().toISOString() }));
          Store.remove('requests', q.id); App.show();
        }
        if (r) UI.confirm('Отклонить заявку?', 'Отклонить', true).then(function (ok) { if (ok) { Store.remove('requests', r.dataset.reject); App.show(); } });
      });
      return s;
    }
  });

  App.screen('member', {
    tab: 'more',
    render: function (id) {
      var me = App.me(), m = Store.get('members', id);
      if (!m || !Units.canApprovePeople(me)) return el(back('people', 'Участник') + '<div class="empty"><b>Нет доступа</b></div>');
      var s = el(back('people', esc(m.name)) + '<div class="scroll"><form class="form" novalidate>' +
        '<p class="hint">' + esc(m.email || '') + '</p>' +
        '<label class="f">Имя<input class="inp" name="name" maxlength="80" value="' + esc(m.name) + '"></label>' +
        '<p class="group" style="margin:4px 0 0">Должности (необязательно: член студсовета есть всегда)</p>' +
        (m.positions || []).map(positionRow).join('') +
        '<button class="link" type="button" data-addpos style="align-self:flex-start">+ Добавить в отдел или актив</button>' +
        '<label class="consent"><input type="checkbox" name="can"' + (m.canCreate ? ' checked' : '') + '> Может создавать мероприятия и задачи (руководителям и главам не нужно)</label>' +
        (Units.canSetAdmin(me) ? '<label class="consent"><input type="checkbox" name="adm"' + (m.isAdmin ? ' checked' : '') + '> Администратор приложения</label>' : '') +
        '<p class="hint late err" hidden></p><button class="btn">Сохранить</button>' +
        (m.id !== me.id ? '<button class="btn ghost" type="button" name="left" style="color:var(--late)">Вышел(ла) из состава</button><p class="hint">Доступ закроется, его задачи останутся — передай их другим.</p>' : '') +
        '</form></div>');
      bindPositions(s);
      var f = s.querySelector('form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        m.name = f.name.value.trim() || m.name;
        m.positions = readPositions(s);
        m.canCreate = f.can.checked;
        if (f.adm) m.isAdmin = f.adm.checked;
        Store.put('members', Units.derive(m)); App.go('people');
      });
      if (f.left) f.left.addEventListener('click', function () {
        UI.confirm(m.name + ' больше не в составе? Доступ к приложению закроется.', 'Закрыть доступ', true).then(function (ok) {
          if (!ok) return;
          m.status = 'left'; m.leftAt = new Date().toISOString(); Store.put('members', m); App.go('people');
        });
      });
      return s;
    }
  });
})();
