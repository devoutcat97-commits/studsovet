/* Общие помощники: даты, сроки, экранирование текста. */
(function () {
  'use strict';

  var DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MON3 = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
  var MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var DAY = 864e5;

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
  function hhmm(d) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }

  // «Сегодня до 12:00», «вчера», «чт, 19 ноября».
  function dueLabel(iso, now) {
    var d = new Date(iso), n = daysBetween(now, d);
    if (n === 0) return 'Сегодня до ' + hhmm(d);
    if (n === -1) return 'Вчера';
    if (n === 1) return 'Завтра до ' + hhmm(d);
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function isOverdue(task, now) {
    return task.status !== 'done' && new Date(task.deadline) < now;
  }

  // Группы списка задач: просрочено → сегодня → на этой неделе (7 дней) → позже → готово.
  function groupByDue(tasks, now) {
    var g = { overdue: [], today: [], week: [], later: [], done: [] };
    tasks.forEach(function (t) {
      if (t.status === 'done') g.done.push(t);
      else if (isOverdue(t, now)) g.overdue.push(t);
      else {
        var n = daysBetween(now, new Date(t.deadline));
        (n === 0 ? g.today : n < 7 ? g.week : g.later).push(t);
      }
    });
    Object.keys(g).forEach(function (k) {
      g[k].sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); });
    });
    return g;
  }

  function plate(iso) { var d = new Date(iso); return { day: d.getDate(), mon: MON3[d.getMonth()] }; }
  function monthTitle(iso) { var d = new Date(iso); return MONTH_NOM[d.getMonth()] + ' ' + d.getFullYear(); }
  function longDate(d) { return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  // Серые заготовки карточек, пока грузятся данные.
  function skeleton() {
    var line = function (w) { return '<span class="sk" style="width:' + w + '"></span>'; };
    var card = '<div class="card skc">' + line('40%') + line('90%') + line('70%') + '</div>';
    return '<div class="hero sk-hero"><span class="sk round"></span><span style="flex:1">' + line('50%') + line('70%') + '</span></div>' +
      '<div class="scroll" aria-busy="true" aria-label="Загружаем">' + card + card + card + '</div>';
  }
  // Пустое состояние: иконка в мягком круге, заголовок и подсказка.
  function empty(icon, title, text, small) {
    return '<div class="empty' + (small ? ' sm' : '') + '"><span class="eico"><svg class="i"><use href="#' + icon + '"/></svg></span><b>' + title + '</b>' + (text || '') + '</div>';
  }
  function greeting(d) {
    var h = d.getHours();
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  // Короткое сообщение внизу экрана; action — кнопка вроде «Отменить».
  var toastEl = null, toastTimer;
  function toast(text, action, onAction) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + esc(text) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '');
    if (action) toastEl.querySelector('button').onclick = function () { hide(); onAction(); };
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(hide, action ? 5000 : 2600);
    function hide() { toastEl.classList.remove('show'); }
  }
  // Диалог в стиле приложения вместо системных confirm/prompt. Возвращает Promise.
  function dialog(o) {
    return new Promise(function (done) {
      var d = document.createElement('dialog');
      d.className = 'dlg';
      d.innerHTML = '<form method="dialog"><p class="dt">' + esc(o.text) + '</p>' + (o.area ? '<textarea class="inp" name="v" rows="5" maxlength="2000" placeholder="' + esc(o.area) + '"></textarea>' : o.input != null ? '<input class="inp" name="v" maxlength="80" value="' + esc(o.input) + '">' : '') +
        '<div class="da"><button class="btn ghost sm" value="">' + esc(o.cancel || 'Отмена') + '</button><button class="btn sm' + (o.danger ? ' red' : '') + '" value="ok">' + esc(o.ok || 'Да') + '</button></div></form>';
      document.body.appendChild(d);
      // Ответ берём из нажатой кнопки: событие close в некоторых браузерах приходит с опозданием или не приходит.
      var v = d.querySelector('[name=v]'), finished = false;
      function finish(ok) {
        if (finished) return; finished = true;
        if (d.open) d.close(); d.remove();
        done(ok ? (v ? v.value.trim() || null : true) : (v ? null : false));
      }
      d.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); finish(!!e.submitter && e.submitter.value === 'ok'); });
      d.addEventListener('cancel', function (e) { e.preventDefault(); finish(false); });
      d.addEventListener('click', function (e) { if (e.target === d) finish(false); });
      d.showModal();
      var f = d.querySelector('[name=v]') || d.querySelector('[value=ok]'); f.focus(); if (f.select) f.select();
    });
  }
  function confirmDlg(text, ok, danger) { return dialog({ text: text, ok: ok, danger: danger }); }
  function ask(text, value, ok) { return dialog({ text: text, input: value || '', ok: ok || 'Сохранить' }); }
  // Искры от галочки — фирменный момент «задача выполнена».
  function burst(el) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var r = el.getBoundingClientRect();
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('i');
      s.className = 'spark' + (i % 2 ? ' b' : '');
      s.style.left = r.left + r.width / 2 + 'px'; s.style.top = r.top + r.height / 2 + 'px';
      s.style.setProperty('--a', (i * 45 + 20) + 'deg');
      document.body.appendChild(s);
      setTimeout(s.remove.bind(s), 700);
    }
  }

  // Кружок человека: фото, если есть, иначе инициалы.
  function ava(m, style) {
    var a = m && m.id && window.Store && Store.get('avatars', m.id);
    return '<span class="ava"' + (style ? ' style="' + style + '"' : '') + '>' +
      (a && /^data:image\/jpeg;base64,/.test(a.data) ? '<img src="' + esc(a.data) + '" alt="">' : initials(m && m.name)) + '</span>';
  }

  window.UI = {
    ava: ava,
    toast: toast, dialog: dialog, confirm: confirmDlg, ask: ask, burst: burst,
    skeleton: skeleton, empty: empty, greeting: greeting,
    dueLabel: dueLabel, isOverdue: isOverdue, groupByDue: groupByDue, daysBetween: daysBetween,
    plate: plate, monthTitle: monthTitle, longDate: longDate, esc: esc, initials: initials
  };
})();
