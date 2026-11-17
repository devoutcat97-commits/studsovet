/* Оболочка: экраны, нижнее меню, тема, установка на телефон.
   Модули регистрируют экраны через App.screen(имя, {tab, render}). */
(function () {
  'use strict';

  var screens = {};
  var view = document.getElementById('view');
  var tabs = document.getElementById('tabs');
  var THEME_KEY = 'ss:theme';
  var lastKey = '', lastDepth = 0;

  function screen(name, def) { screens[name] = def; }

  // Адрес вида #tasks или #task/123 — экран и его параметр.
  function current() {
    var h = location.hash.replace('#', '').split('/');
    return { name: screens[h[0]] ? h[0] : 'home', arg: h[1] || null };
  }

  function me() { return Store.get('members', Store.setting('me')); }

  function show() {
    var r = current(), def = screens[r.name], m = me();
    // Облако: пока человек не вошёл и не одобрен, показываем экран входа/заявки/ожидания.
    if (window.Cloud && Cloud.enabled && Cloud.state() !== 'in') { def = screens['auth_' + Cloud.state()] || screens.auth_loading; m = null; }
    else if (!m) { def = screens.auth_loading || def; }
    // Кнопки «+» и пункты руководства показываются через CSS по этим атрибутам.
    document.body.dataset.can = m && Units.canManageAny(m) ? 'manage' : 'view';
    if (m && m.isAdmin) document.body.dataset.admin = ''; else delete document.body.dataset.admin;
    // Анимация появления — только при переходе на другой экран, не при обновлении данных.
    var key = def === screens[r.name] ? r.name + '/' + r.arg : 'gate:' + (window.Cloud && Cloud.enabled ? Cloud.state() : 'loading');
    var same = key === lastKey, old = view.querySelector('.scroll'), top = same && old ? old.scrollTop : 0;
    lastKey = key;
    view.innerHTML = '';
    var node = def.render(r.arg);
    view.appendChild(node);
    // Глубина: разделы нижнего меню — 0, карточки и формы внутри них — 1. Вглубь — слайд справа, назад — слева.
    var depth = def.tab ? 1 : 0, sc = node.querySelector('.scroll');
    if (!same) {
      node.classList.add('enter');
      if (depth !== lastDepth && !def.noTabs) node.classList.add(depth > lastDepth ? 'fwd' : 'back');
      else node.querySelectorAll('.scroll > *, .home > *').forEach(function (c, i) { if (i < 8) c.style.setProperty('--i', i); });
    } else if (sc) sc.scrollTop = top;
    lastDepth = depth;
    if (sc) {
      var mark = function () { node.classList.toggle('scrolled', sc.scrollTop > 4); };
      sc.addEventListener('scroll', mark, { passive: true }); mark();
    }
    tabs.hidden = !!def.noTabs;
    tabs.querySelectorAll('button').forEach(function (b) {
      if (b.dataset.go === (def.tab || r.name)) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    badges(m);
  }

  // Счётчики на вкладках: просроченные задачи и непрочитанные важные объявления.
  function badges(m) {
    if (!m || !window.News) return;
    var now = new Date();
    var late = Tasks.pick('mine', m).filter(function (t) { return UI.isOverdue(t, now); }).length;
    set('tasks', late); set('news', News.unread(m).length);
    function set(tab, n) {
      var b = tabs.querySelector('[data-go=' + tab + '] svg');
      var wrap = b.parentNode.classList.contains('badge') ? b.parentNode : null;
      if (n && !wrap) { wrap = document.createElement('span'); wrap.className = 'badge'; b.replaceWith(wrap); wrap.appendChild(b); }
      if (wrap) { if (n) wrap.dataset.n = n; else wrap.replaceWith(b); }
      tabs.querySelector('[data-go=' + tab + ']').setAttribute('aria-label', tab === 'tasks' ? 'Задачи' + (n ? ', просрочено ' + n : '') : 'Новости' + (n ? ', непрочитанных ' + n : ''));
    }
  }

  function go(name, arg) { location.hash = arg ? name + '/' + arg : name; }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* приватный режим */ }
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ok */ }
    setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }

  // Кнопки с data-go работают по всему приложению.
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); go(t.dataset.go, t.dataset.arg); }
  });
  window.addEventListener('hashchange', show);

  // Временные экраны-заглушки, пока модули не готовы.
  function stub(title, text, tab) {
    return {
      tab: tab,
      render: function () {
        var el = document.createElement('section');
        el.className = 'screen on';
        el.innerHTML = '<div class="bar"><h1>' + title + '</h1></div>' +
          '<div class="empty"><svg class="i"><use href="#tasks"/></svg><b>Скоро здесь</b>' + text + '</div>';
        return el;
      }
    };
  }
  screen('more', {
    render: function () {
      var m = me(), demo = !(window.Cloud && Cloud.enabled);
      var el = document.createElement('section');
      el.className = 'screen on';
      el.innerHTML = '<div class="bar"><h1>Ещё</h1></div><div class="scroll">' +
        '<button class="card me-card" data-go="profile">' + UI.ava(m, 'width:48px;height:48px;font-size:16px') + '' +
        '<span style="flex:1;text-align:left"><b>' + UI.esc(m.name) + '</b><small>' + UI.esc(Units.title(m)) + '</small></span><svg class="i"><use href="#next"/></svg></button><div class="card">' +
        (Units.canApprovePeople(m) ? '<button class="row" data-go="people"><svg class="i"><use href="#users"/></svg><span style="flex:1"><b>Люди и заявки</b></span>' +
          (Store.list('requests').length ? '<span class="tag info">' + Store.list('requests').length + ' нов.</span>' : '<svg class="i"><use href="#next"/></svg>') + '</button>' : '') +
        (window.Push ? '<div class="row"><svg class="i"><use href="#mega"/></svg><span style="flex:1"><b>Уведомления</b><small id="pushst">' + UI.esc(Push.status()) + '</small></span>' +
          '<button class="toggle" role="switch" id="pushsw" aria-label="Уведомления" aria-checked="' + Push.enabled() + '"></button></div>' : '') +
        '<button class="row" data-go="projector"><svg class="i"><use href="#screen"/></svg><span style="flex:1"><b>Режим проектора</b><small>Сводка крупно на весь экран для собраний</small></span><svg class="i"><use href="#next"/></svg></button>' +
        '<div class="row"><svg class="i"><use href="#moon"/></svg><span style="flex:1"><b>Тёмная тема</b></span>' +
        '<button class="toggle" role="switch" aria-label="Тёмная тема" aria-checked="' + (document.documentElement.dataset.theme === 'dark') + '"></button></div>' +
        (demo ? '' : '<button class="row" id="logout"><svg class="i" style="color:var(--late)"><use href="#out"/></svg><span><b style="color:var(--late)">Выйти</b></span></button>') +
        '</div>' +
        // shortcut: «Смотреть как» есть только в демо-режиме, пока нет облака.
        (demo ? '<div class="card"><label class="f">Демо-режим: смотреть как<select class="inp" id="as">' +
          Store.list('members').map(function (x) {
            return '<option value="' + x.id + '"' + (x.id === Store.setting('me') ? ' selected' : '') + '>' + UI.esc(x.name) + ' — ' + UI.esc(Units.title(x)) + '</option>';
          }).join('') + '</select></label></div>' : '') + '</div>';
      var ps = el.querySelector('#pushsw');
      if (ps) ps.addEventListener('click', function () {
        var on = this.getAttribute('aria-checked') !== 'true', st = el.querySelector('#pushst'), btn = this;
        btn.disabled = true; st.textContent = on ? 'Включаем…' : 'Выключаем…';
        (on ? Push.enable() : Push.disable()).then(function () { st.textContent = Push.status(); btn.setAttribute('aria-checked', Push.enabled()); })
          .catch(function (e) { st.textContent = e.message; st.classList.add('late'); }).then(function () { btn.disabled = false; });
      });
      el.querySelector('[aria-label="Тёмная тема"]').addEventListener('click', function () {
        var dark = this.getAttribute('aria-checked') !== 'true';
        this.setAttribute('aria-checked', dark);
        setTheme(dark ? 'dark' : 'light');
      });
      var as = el.querySelector('#as');
      if (as) as.addEventListener('change', function () { Store.setting('me', this.value); show(); });
      var out = el.querySelector('#logout');
      if (out) out.addEventListener('click', function () { UI.confirm('Выйти из приложения?', 'Выйти').then(function (ok) { if (ok) Cloud.signOut(); }); });
      return el;
    }
  });

  // Пришли свежие данные из облака — перерисовать, но не мешать, пока человек печатает.
  var redraw = null;
  Store.onChange(function () {
    clearTimeout(redraw);
    redraw = setTimeout(function () {
      // На экранах с формой не перерисовываем: иначе стёрлось бы то, что человек вводит.
      if (view.querySelector('form')) return;
      show();
    }, 150);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js');
  }

  // Потянуть вниз в начале списка — обновить. В облаке перезагружаем страницу: так же подтянется новая версия приложения.
  (function pullToRefresh() {
    var ptr = document.createElement('div'), y0 = null, dy = 0, LIMIT = 72;
    ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
    ptr.innerHTML = '<svg class="i"><use href="#star"/></svg>';
    document.addEventListener('DOMContentLoaded', function () { document.querySelector('.app').appendChild(ptr); });
    view.addEventListener('touchstart', function (e) {
      var sc = e.target.closest('.scroll');
      y0 = sc && sc.scrollTop <= 0 && !view.querySelector('form') ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    view.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      var k = Math.min(dy, 120) / LIMIT;
      ptr.style.transform = 'translate(-50%,' + (Math.min(dy, 120) * .6 - 48) + 'px) rotate(' + dy * 2 + 'deg)';
      ptr.style.opacity = Math.min(1, k);
      ptr.classList.toggle('ready', dy > LIMIT);
    }, { passive: true });
    view.addEventListener('touchend', function () {
      if (y0 === null) return;
      y0 = null;
      if (dy > LIMIT) {
        ptr.classList.add('spin');
        setTimeout(function () { if (window.Cloud && Cloud.enabled) location.reload(); else { show(); reset(); } }, 450);
      } else reset();
    });
    function reset() { ptr.classList.remove('spin', 'ready'); ptr.style.transform = ''; ptr.style.opacity = 0; }
  })();

  window.App = { screen: screen, go: go, show: show, setTheme: setTheme, me: me };
  initTheme();
  document.addEventListener('DOMContentLoaded', show);
})();
