/* Ежемесячный отчёт о работе объединения — по шаблону филиала (assets/report-template.docx).
   В шаблоне метки {{WHO}}, {{MONTH}}, {{CHAIR}} и строка таблицы с {{C0}}…{{C8}}. */
(function () {
  'use strict';

  var esc = UI.esc;
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  // «О работе …» — родительный падеж названия.
  var WHO = { all: 'Студенческого совета', lead: 'Студенческого совета', project: 'Проектного отдела', career: 'Профориентационного отдела',
    pr: 'PR-отдела', law: 'Актива юриспруденции', econ: 'Актива экономики', gmu: 'Актива ГМУ', media: 'Актива медиакоммуникаций', psy: 'Актива психологии' };
  var state = { month: null, unit: 'all' };

  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // «Имя Фамилия» → «Фамилия И.»; если в плане уже было «Фамилия И.О.» — берём как есть.
  function shortName(e) {
    if (e.responsible) return e.responsible;
    var m = Store.get('members', e.ownerUid); if (!m) return '';
    var p = m.name.replace(/\s*\(.*?\)/g, '').trim().split(/\s+/);
    return p.length > 1 ? p[p.length - 1] + ' ' + p[0][0] + '.' : p[0];
  }
  function chair() {
    var c = Store.list('members').filter(function (m) { return m.status === 'active' && (m.positions || []).some(function (p) { return p.unitId === 'lead' && p.post === 'chair'; }); })[0];
    if (!c) return '';
    var p = c.name.replace(/\s*\(.*?\)/g, '').trim().split(/\s+/);
    return p.length > 1 ? p[0][0] + '. ' + p[p.length - 1] : p[0];
  }
  function unitTitle(id) { var u = Units.unit(id); return !u ? '' : u.id === 'lead' ? 'Студенческий совет' : u.name; }
  function units(me) { return Units.all.filter(function (u) { return Units.canBrief(me) || (me.heads || []).indexOf(u.id) >= 0 || Units.canManage(me, u.id); }); }
  function events(month, unit) {
    var from = new Date(month.y, month.m, 1), to = new Date(month.y, month.m + 1, 1);
    return Store.list('events').filter(function (e) { var d = new Date(e.date); return d >= from && d < to && (unit === 'all' || e.unitId === unit); })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  }
  function dd(iso) { var d = new Date(iso); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ' г.'; }

  function build(list, month, unit) {
    return fetch('assets/report-template.docx?v=2').then(function (r) { if (!r.ok) throw new Error('Не загрузился шаблон отчёта.'); return r.arrayBuffer(); })
      .then(Plan.unzipAll).then(function (files) {
        var xml = new TextDecoder().decode(files['word/document.xml']);
        var row = /<w:tr[ >](?:(?!<w:tr[ >])[\s\S])*?\{\{C0\}\}[\s\S]*?<\/w:tr>/.exec(xml);
        if (!row) throw new Error('В шаблоне нет строки таблицы.');
        var rows = list.map(function (e, i) {
          var c = [i + 1, unitTitle(e.unitId), e.title, dd(e.date), e.level || '', e.format || '', e.attendees || '', shortName(e), e.link || ''];
          return row[0].replace(/\{\{C(\d)\}\}/g, function (_, k) { return x(c[+k]); });
        }).join('');
        xml = xml.replace(row[0], rows);
        // Описательная часть: абзац-образец повторяем для каждого мероприятия.
        var para = /<w:p[ >](?:(?!<w:p[ >])[\s\S])*?\{\{DESC\}\}[\s\S]*?<\/w:p>/.exec(xml);
        if (para) xml = xml.replace(para[0], list.map(function (e) {
          var t = (e.summary || '').trim(), d = dd(e.date);
          var text = t ? (/^\d{1,2}\.\d{1,2}/.test(t) ? t : d + ' ' + t) : d + ' состоялось мероприятие «' + e.title + '».';
          return para[0].replace('{{DESC}}', x(text));
        }).join(''));
        xml = xml.replace(/\{\{WHO\}\}/g, x(WHO[unit] || WHO.all)).replace(/\{\{MONTH\}\}/g, MONTHS[month.m])
          .replace(/\{\{YEAR\}\}/g, String(month.y)).replace(/\{\{CHAIR\}\}/g, x(chair()));
        files['word/document.xml'] = new TextEncoder().encode(xml);
        return Plan.zip(Object.keys(files).map(function (n) { return [n, files[n]]; }));
      });
  }

  App.screen('report', {
    tab: 'events',
    render: function () {
      var me = App.me(), now = new Date();
      var head = '<div class="bar"><button class="ib" data-go="events" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Отчёт за месяц</h1></div>';
      var s = document.createElement('section'); s.className = 'screen on';
      var us = units(me);
      if (!us.length) { s.innerHTML = head + UI.empty('down', 'Нет прав', 'Отчёт готовят руководство, руководители отделов и главы активов.'); return s; }
      if (!state.month) { var pm = new Date(now.getFullYear(), now.getMonth() - (now.getDate() < 10 ? 1 : 0), 1); state.month = { y: pm.getFullYear(), m: pm.getMonth() }; }
      if (state.unit !== 'all' && !us.some(function (u) { return u.id === state.unit; })) state.unit = us[0].id;
      if (state.unit === 'all' && !Units.canBrief(me)) state.unit = us[0].id;
      var opts = '';
      for (var k = 0; k < 13; k++) { var d = new Date(now.getFullYear(), now.getMonth() - k, 1); opts += '<option value="' + d.getFullYear() + '-' + d.getMonth() + '"' + (d.getFullYear() === state.month.y && d.getMonth() === state.month.m ? ' selected' : '') + '>' + MONTHS[d.getMonth()][0].toUpperCase() + MONTHS[d.getMonth()].slice(1) + ' ' + d.getFullYear() + '</option>'; }
      var list = events(state.month, state.unit);
      var can = function (e) { return Events.canEditEvent(me, e); };
      s.innerHTML = head + '<div class="scroll"><form class="form" onsubmit="return false">' +
        '<label class="f">Месяц<select class="inp" id="rm">' + opts + '</select></label>' +
        '<label class="f">Объединение<select class="inp" id="ru">' + (Units.canBrief(me) ? '<option value="all"' + (state.unit === 'all' ? ' selected' : '') + '>Весь студсовет</option>' : '') +
        us.map(function (u) { return '<option value="' + u.id + '"' + (u.id === state.unit ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></label></form>' +
        '<p class="group" style="margin-top:4px">Мероприятия · ' + list.length + '</p>' +
        (list.length ? '<div class="card">' + list.map(function (e) {
          var ed = can(e);
          return '<div class="row imp' + (e.attendees && e.summary ? '' : ' warn') + '"><span style="flex:1;min-width:0"><b>' + esc(e.title) + '</b><small>' + dd(e.date) + ' · ' + esc(unitTitle(e.unitId)) + '</small>' +
            '<span class="impf"><input class="inp" type="number" min="0" inputmode="numeric" data-f="attendees" data-id="' + e.id + '" value="' + (e.attendees || '') + '" placeholder="Участников"' + (ed ? '' : ' disabled') + ' aria-label="Количество участников">' +
            '<input class="inp" type="url" data-f="link" data-id="' + e.id + '" value="' + esc(e.link || '') + '" placeholder="Ссылка на публикацию"' + (ed ? '' : ' disabled') + ' aria-label="Ссылка на публикацию"></span>' +
            '<textarea class="inp" rows="3" maxlength="3000" data-f="summary" data-id="' + e.id + '" placeholder="Что прошло: кто выступал, что делали, итоги — попадёт в описательную часть"' + (ed ? '' : ' disabled') + ' aria-label="Описание для отчёта">' + esc(e.summary || '') + '</textarea></span></div>';
        }).join('') + '</div><p class="hint" style="margin:8px 18px 0">Жёлтым — не заполнены участники или описание. Поля сохраняются сами.</p>' : UI.empty('cal', 'В этом месяце мероприятий нет', 'Выбери другой месяц или объединение.')) +
        '<div style="padding:14px"><button class="btn" id="rdl"' + (list.length ? '' : ' disabled') + '>Скачать отчёт (Word)</button></div></div>';
      s.querySelector('#rm').addEventListener('change', function () { var p = this.value.split('-'); state.month = { y: +p[0], m: +p[1] }; App.show(); });
      s.querySelector('#ru').addEventListener('change', function () { state.unit = this.value; App.show(); });
      s.addEventListener('change', function (e) {
        var t = e.target, id = t.dataset.id; if (!id) return;
        var ev = Store.get('events', id); if (!ev || !can(ev)) return;
        if (t.dataset.f === 'attendees') ev.attendees = t.value ? Math.max(0, parseInt(t.value, 10) || 0) : null;
        else if (t.dataset.f === 'link') ev.link = t.value.trim().slice(0, 400);
        else ev.summary = t.value.trim().slice(0, 3000);
        Store.put('events', ev);
        t.closest('.row').classList.toggle('warn', !ev.attendees || !ev.summary);
      });
      s.querySelector('#rdl').addEventListener('click', function () {
        var b = this; b.disabled = true; b.textContent = 'Собираем отчёт…';
        build(events(state.month, state.unit), state.month, state.unit).then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'Отчёт ' + (WHO[state.unit] || WHO.all) + ' за ' + MONTHS[state.month.m] + ' ' + state.month.y + '.docx';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          UI.toast('Отчёт скачан');
        }).catch(function (e) { UI.toast(e.message); }).then(function () { b.disabled = false; b.textContent = 'Скачать отчёт (Word)'; });
      });
      return s;
    }
  });

  window.Report = { build: build };
})();
