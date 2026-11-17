/* Годовой план: загрузка из Word (.docx) с распознаванием таблицы и выгрузка обратно в Word.
   Без библиотек: .docx — это zip, распаковываем встроенным DecompressionStream и читаем XML. */
(function () {
  'use strict';

  var esc = UI.esc;
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  var MONTH_RE = /(январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*/i;
  var COLS = ['№', 'Актив направления', 'Мероприятие', 'Дата проведения', 'Уровень мероприятия', 'Формат участия', 'Ответственный'];

  // ---------- Чтение .docx ----------
  function u16(b, o) { return b[o] | b[o + 1] << 8; }
  function u32(b, o) { return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0; }
  function inflate(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer().then(function (a) { return new Uint8Array(a); });
  }
  function unzipFile(buf, want) {
    var b = new Uint8Array(buf), e = b.length - 22;
    while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
    if (e < 0) return Promise.reject(new Error('Это не файл Word (.docx). Сохрани план как «Документ Word (.docx)».'));
    var n = u16(b, e + 10), p = u32(b, e + 16);
    for (var i = 0; i < n; i++) {
      var method = u16(b, p + 10), size = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      if (name === want) {
        var start = off + 30 + u16(b, off + 26) + u16(b, off + 28), data = b.subarray(start, start + size);
        return (method === 8 ? inflate(data) : Promise.resolve(data)).then(function (d) { return new TextDecoder().decode(d); });
      }
      p += 46 + nl + xl + cl;
    }
    return Promise.reject(new Error('В файле нет текста документа.'));
  }
  // Все таблицы документа → массивы строк → массивы текстов ячеек (абзацы через перевод строки).
  function tablesFrom(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var text = function (n) {
      return Array.prototype.map.call(n.getElementsByTagNameNS(W, 'p'), function (p) {
        return Array.prototype.map.call(p.getElementsByTagNameNS(W, 't'), function (t) { return t.textContent; }).join('');
      }).filter(function (s) { return s.trim(); }).join('\n').trim();
    };
    var kids = function (n, tag) { return Array.prototype.filter.call(n.childNodes, function (c) { return c.localName === tag; }); };
    var all = doc.getElementsByTagNameNS(W, 'body')[0];
    var tables = Array.prototype.filter.call(doc.getElementsByTagNameNS(W, 'tbl'), function () { return true; });
    return { text: text(all), tables: tables.map(function (t) {
      return kids(t, 'tr').map(function (tr) {
        var row = [];
        kids(tr, 'tc').forEach(function (tc) {
          // Объединённые по горизонтали ячейки повторяем, чтобы колонки не съезжали.
          var span = tc.getElementsByTagNameNS(W, 'gridSpan')[0], k = span ? +span.getAttributeNS(W, 'val') || +span.getAttribute('w:val') || 1 : 1;
          var t = text(tc); row.push(t); for (var j = 1; j < k; j++) row.push('');
        });
        return row;
      });
    }) };
  }

  // ---------- Распознавание ----------
  var FIELDS = {
    title: /мероприят|название|наименован|тема|событ/i,
    date: /дата|срок|когда|период|время/i,
    unit: /актив|отдел|направлен|подразделен|организатор/i,
    owner: /ответствен|куратор|исполнител|организует/i,
    level: /уровень/i,
    format: /формат|участи/i,
    place: /место|площадк|аудитор/i
  };
  function findHeader(rows) {
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var map = {};
      rows[i].forEach(function (c, j) {
        Object.keys(FIELDS).forEach(function (f) { if (map[f] == null && FIELDS[f].test(c) && c.length < 60) map[f] = j; });
      });
      // «Актив направления» не должен перехватить колонку мероприятия и наоборот.
      if (map.title != null && map.title === map.unit) delete map.unit;
      if (map.title != null && map.date != null) return { row: i, map: map };
    }
    return null;
  }
  // Без заголовка: дата — колонка, где больше всего дат; название — где в среднем длиннее текст.
  function guessHeader(rows) {
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var best = { date: -1, title: -1 }, dScore = 0, tScore = 0;
    for (var j = 0; j < cols; j++) {
      var d = 0, len = 0;
      rows.forEach(function (r) { var c = r[j] || ''; if (parseDate(c, 2026).date) d++; len += c.length; });
      if (d > dScore) { dScore = d; best.date = j; }
      if (j !== best.date && len > tScore) { tScore = len; best.title = j; }
    }
    return dScore ? { row: -1, map: best, guessed: true } : null;
  }

  // Учебный год из текста документа: «2026/2027», «2026-2027».
  function startYear(text) {
    var m = /(20\d\d)\s*[\/\-–]\s*(20\d\d)/.exec(text);
    if (m) return +m[1];
    var n = new Date();
    return n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1;
  }
  function yearFor(month, y0) { return month >= 8 ? y0 : y0 + 1; }
  function monthIdx(word) {
    var w = word.toLowerCase();
    if (/^ма[йяе]/.test(w)) return 4;
    for (var i = 0; i < MONTHS.length; i++) if (i !== 4 && w.indexOf(MONTHS[i]) === 0) return i;
    return -1;
  }
  // Возвращает { date: Date|null, sure: bool, note }.
  function parseDate(s, y0, groupMonth) {
    s = String(s || '').toLowerCase().replace(/\s+/g, ' ');
    var m = /(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{2,4})/.exec(s);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return { date: new Date(y, +m[2] - 1, +m[1], 12), sure: true }; }
    m = /(\d{1,2})\s*[.\/]\s*(\d{1,2})(?![\d.\/])/.exec(s);
    if (m && +m[2] <= 12) return { date: new Date(yearFor(+m[2] - 1, y0), +m[2] - 1, +m[1], 12), sure: true };
    m = /(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+(январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s*(\d{4})?/.exec(s);
    if (m) { var mi = monthIdx(m[2]); return { date: new Date(m[3] ? +m[3] : yearFor(mi, y0), mi, +m[1], 12), sure: true }; }
    m = MONTH_RE.exec(s);
    if (m) { var mo = monthIdx(m[1]), yy = /(20\d\d)/.exec(s); return { date: new Date(yy ? +yy[1] : yearFor(mo, y0), mo, 1, 12), sure: false, note: 'точная дата не указана' }; }
    if (groupMonth != null) return { date: new Date(yearFor(groupMonth, y0), groupMonth, 1, 12), sure: false, note: 'дата по разделу месяца' };
    return { date: null, sure: false, note: 'дата не распознана' };
  }
  var UNIT_WORDS = [['econ', /эконом/i], ['law', /юрис|право/i], ['gmu', /гму|государствен|муниципал/i], ['media', /медиа|коммуникац/i],
    ['psy', /психолог/i], ['project', /проектн/i], ['career', /профориент/i], ['pr', /\bpr\b|пиар|pr-/i], ['lead', /студенческ|совет|руковод|председат/i]];
  function unitFrom(s) {
    for (var i = 0; i < UNIT_WORDS.length; i++) if (UNIT_WORDS[i][1].test(s || '')) return UNIT_WORDS[i][0];
    return 'lead';
  }
  // «Иванов И.И.» → участник с такой фамилией (имя в приложении — «Имя Фамилия» или «Фамилия Имя»).
  function ownerFrom(s) {
    var words = String(s || '').replace(/[.,]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && /^[А-ЯЁ]/.test(w); });
    var ms = Store.list('members').filter(function (m) { return m.status === 'active'; });
    for (var i = 0; i < words.length; i++) {
      var hit = ms.filter(function (m) { return m.name.split(/\s+/).indexOf(words[i]) >= 0; });
      if (hit.length === 1) return hit[0].id;
    }
    return null;
  }
  // Переносы строк и косые черты-разделители из ячеек → «, ».
  function clean(s) { return String(s || '').replace(/\s*\/?\s*\n\s*/g, ', ').replace(/\/\s*$/, '').replace(/\s+/g, ' ').trim(); }

  function recognize(doc) {
    var y0 = startYear(doc.text), out = [], how = '';
    // Берём таблицу, где нашёлся заголовок; если нигде — самую большую с датами.
    var pick = null;
    doc.tables.forEach(function (rows) { if (!pick) { var h = findHeader(rows); if (h) pick = { rows: rows, h: h }; } });
    if (!pick) doc.tables.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (rows) {
      if (!pick) { var h = guessHeader(rows); if (h) pick = { rows: rows, h: h }; }
    });
    if (!pick) return { items: [], year: y0, how: 'Не нашёл таблицу с мероприятиями и датами.' };
    var map = pick.h.map, group = null;
    how = pick.h.guessed ? 'Заголовков нет — колонки угаданы по содержимому.' : 'Колонки найдены по заголовкам.';
    pick.rows.slice(pick.h.row + 1).forEach(function (r) {
      var filled = r.filter(function (c) { return c.trim(); });
      if (!filled.length) return;
      // Строка-раздел вроде «СЕНТЯБРЬ»: запоминаем месяц для строк без даты.
      if (filled.length === 1 && filled[0].length < 30 && MONTH_RE.test(filled[0])) { group = monthIdx(MONTH_RE.exec(filled[0])[1]); return; }
      var title = clean(r[map.title]);
      if (!title || /^\d+$/.test(title)) return;
      var d = parseDate(r[map.date], y0, group);
      var unitText = map.unit != null ? r[map.unit] : '';
      var ownerText = map.owner != null ? clean(r[map.owner]) : '';
      var owner = ownerFrom(ownerText);
      var dup = d.date && Store.list('events').some(function (e) { return e.title.toLowerCase() === title.toLowerCase() && Math.abs(new Date(e.date) - d.date) < 864e5 * 2; });
      out.push({ title: title, date: d.date, sure: d.sure, note: dup ? 'уже есть в приложении' : d.note, dup: dup,
        unitId: unitFrom(unitText), unitText: clean(unitText), ownerUid: owner, ownerText: ownerText,
        level: map.level != null ? clean(r[map.level]) : '', format: map.format != null ? clean(r[map.format]) : '',
        place: map.place != null ? clean(r[map.place]) : '', on: !!d.date && !dup });
    });
    return { items: out, year: y0, how: how };
  }

  // ---------- Экран загрузки ----------
  var last = null;
  function iso(d) { return d ? new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : ''; }
  App.screen('importplan', {
    tab: 'events',
    render: function () {
      var me = App.me();
      var back = '<div class="bar"><button class="ib" data-go="events" aria-label="Назад"><svg class="i"><use href="#back"/></svg></button><h1>Загрузить план</h1></div>';
      var s = document.createElement('section'); s.className = 'screen on';
      if (!Units.canBrief(me)) { s.innerHTML = back + UI.empty('cal', 'Нет прав', 'Загружать план могут председатель, заместитель и секретарь.'); return s; }
      var people = Store.list('members').filter(function (m) { return m.status === 'active'; });
      var list = last ? last.items.map(function (it, i) {
        return '<div class="row imp' + (it.sure && !it.dup ? '' : ' warn') + '">' +
          '<input type="checkbox" class="cb" data-i="' + i + '"' + (it.on ? ' checked' : '') + ' aria-label="Добавить «' + esc(it.title) + '»">' +
          '<span style="flex:1;min-width:0"><b>' + esc(it.title) + '</b>' +
          '<span class="impf"><input class="inp" type="date" data-f="date" data-i="' + i + '" value="' + iso(it.date) + '" aria-label="Дата">' +
          '<select class="inp" data-f="unitId" data-i="' + i + '" aria-label="Подразделение">' + Units.all.map(function (u) { return '<option value="' + u.id + '"' + (u.id === it.unitId ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select>' +
          '<select class="inp" data-f="ownerUid" data-i="' + i + '" aria-label="Ответственный"><option value="">' + esc(it.ownerText ? 'Не найден: ' + it.ownerText : 'Ответственный — я') + '</option>' +
          people.map(function (m) { return '<option value="' + m.id + '"' + (m.id === it.ownerUid ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></span>' +
          (it.note ? '<small class="late">' + esc(it.note) + '</small>' : '') +
          (it.level || it.format ? '<small>' + esc([it.level, it.format].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></div>';
      }).join('') : '';
      var n = last ? last.items.filter(function (x) { return x.on; }).length : 0;
      s.innerHTML = back + '<div class="scroll">' +
        '<div class="card"><p style="font-size:15px">Выбери годовой план в формате Word (.docx). Приложение само найдёт таблицу, даты, подразделения и ответственных. Проверь список и добавь нужное.</p>' +
        '<label class="btn" style="display:grid;place-items:center;margin-top:12px;cursor:pointer">Выбрать файл<input type="file" id="planin" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>' +
        '<p class="hint" id="pmsg" style="margin-top:8px">' + (last ? esc(last.how + ' Учебный год ' + last.year + '/' + (last.year + 1) + '. Найдено: ' + last.items.length + '. Жёлтым — проверь.') : '') + '</p></div>' +
        (last && last.items.length ? '<div class="card">' + list + '</div><div style="padding:14px"><button class="btn" id="padd"' + (n ? '' : ' disabled') + '>Добавить ' + n + ' ' + UI.plural(n, 'мероприятие', 'мероприятия', 'мероприятий') + '</button></div>' : '') +
        '</div>';
      s.querySelector('#planin').addEventListener('change', function () {
        var f = this.files[0]; if (!f) return;
        s.querySelector('#pmsg').textContent = 'Читаем «' + f.name + '»…';
        f.arrayBuffer().then(function (b) { return unzipFile(b, 'word/document.xml'); }).then(function (xml) {
          last = recognize(tablesFrom(xml)); App.show();
        }).catch(function (e) { s.querySelector('#pmsg').textContent = e.message; s.querySelector('#pmsg').classList.add('late'); });
      });
      s.addEventListener('change', function (e) {
        var t = e.target, i = t.dataset.i; if (i == null || !last) return;
        var it = last.items[i];
        if (t.classList.contains('cb')) it.on = t.checked;
        else if (t.dataset.f === 'date') { it.date = t.value ? new Date(t.value + 'T12:00') : null; it.sure = !!it.date; it.note = it.date ? '' : 'дата не распознана'; }
        else it[t.dataset.f] = t.value || null;
        var k = last.items.filter(function (x) { return x.on && x.date; }).length, b = s.querySelector('#padd');
        if (b) { b.disabled = !k; b.textContent = 'Добавить ' + k + ' ' + UI.plural(k, 'мероприятие', 'мероприятия', 'мероприятий'); }
      });
      var add = s.querySelector('#padd');
      if (add) add.addEventListener('click', function () {
        var k = 0;
        last.items.forEach(function (it) {
          if (!it.on || !it.date) return;
          Store.put('events', { title: it.title.slice(0, 140), date: it.date.toISOString(), unitId: it.unitId, ownerUid: it.ownerUid || me.id,
            place: it.place || '', level: it.level, format: it.format, responsible: it.ownerText, kind: 'event', source: 'plan', at: new Date().toISOString() });
          k++;
        });
        last = null;
        UI.toast('Добавлено мероприятий: ' + k);
        App.go('events');
      });
      return s;
    }
  });

  // ---------- Выгрузка в Word ----------
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // Простой zip без сжатия — Word его открывает.
  function zip(files) {
    var enc = new TextEncoder(), parts = [], dir = [], off = 0;
    function h(n, v) { var a = []; for (var i = 0; i < n; i++) a.push((v >>> (8 * i)) & 255); return a; }
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), c = crc32(data);
      var head = [].concat(h(4, 0x04034b50), h(2, 20), h(2, 0x0800), h(2, 0), h(4, 0), h(4, c), h(4, data.length), h(4, data.length), h(2, name.length), h(2, 0));
      parts.push(new Uint8Array(head), name, data);
      dir.push(new Uint8Array([].concat(h(4, 0x02014b50), h(2, 20), h(2, 20), h(2, 0x0800), h(2, 0), h(4, 0), h(4, c), h(4, data.length), h(4, data.length),
        h(2, name.length), h(2, 0), h(2, 0), h(2, 0), h(2, 0), h(4, 0), h(4, off))), name);
      off += head.length + name.length + data.length;
    });
    var size = dir.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat(h(4, 0x06054b50), h(2, 0), h(2, 0), h(2, files.length), h(2, files.length), h(4, size), h(4, off), h(2, 0)));
    return new Blob(parts.concat(dir, [end]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function para(text, o) {
    o = o || {};
    return '<w:p><w:pPr>' + (o.center ? '<w:jc w:val="center"/>' : '') + '<w:spacing w:after="' + (o.after || 0) + '"/></w:pPr>' +
      String(text).split('\n').map(function (line, i) {
        return (i ? '<w:r><w:br/></w:r>' : '') + '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' + (o.bold ? '<w:b/>' : '') +
          '<w:sz w:val="' + (o.size || 24) + '"/></w:rPr><w:t xml:space="preserve">' + x(line) + '</w:t></w:r>';
      }).join('') + '</w:p>';
  }
  function cell(text, w, bold) { return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/></w:tcPr>' + para(text, { bold: bold, size: 22 }) + '</w:tc>'; }
  function planDocx(y0) {
    var from = new Date(y0, 8, 1), to = new Date(y0 + 1, 8, 1);
    var evs = Store.list('events').filter(function (e) { var d = new Date(e.date); return d >= from && d < to; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var widths = [600, 2600, 3600, 1700, 2200, 2200, 2000];
    var row = function (cells, bold) { return '<w:tr>' + cells.map(function (c, i) { return cell(c, widths[i], bold); }).join('') + '</w:tr>'; };
    var dd = function (iso) { var d = new Date(iso); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ' г.'; };
    var who = function (e) { var m = Store.get('members', e.ownerUid); return e.responsible || (m ? m.name : ''); };
    var unitName = function (e) { var u = Units.unit(e.unitId); return u ? (u.id === 'lead' ? 'Студенческий совет' : u.name) : ''; };
    var border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; }).join('') + '</w:tblBorders>';
    var body = para('ГОДОВОЙ ПЛАН РАБОТЫ СТУДЕНЧЕСКОГО СОВЕТА', { bold: true, center: true, size: 28 }) +
      para('на ' + y0 + '/' + (y0 + 1) + ' учебный год', { center: true, size: 28, after: 240 }) +
      '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + border + '</w:tblPr><w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' +
      row(COLS, true) + evs.map(function (e, i) { return row([String(i + 1), unitName(e), e.title, dd(e.date), e.level || '', e.format || '', who(e)]); }).join('') + '</w:tbl>' +
      para('', { after: 240 }) + para('Выгружено из приложения «Студенческий совет» ' + new Date().toLocaleDateString('ru-RU'), { size: 18 }) +
      '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return { count: evs.length, blob: zip([
      ['[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
      ['_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/document.xml', head + '<w:document xmlns:w="' + W + '"><w:body>' + body + '</w:body></w:document>']
    ]) };
  }
  function exportPlan() {
    var n = new Date(), y0 = n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1;
    var r = planDocx(y0);
    if (!r.count) return UI.toast('В учебном году ' + y0 + '/' + (y0 + 1) + ' пока нет мероприятий.');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob);
    a.download = 'Годовой план ' + y0 + '-' + (y0 + 1) + '.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    UI.toast('Скачан план: ' + r.count + ' ' + UI.plural(r.count, 'мероприятие', 'мероприятия', 'мероприятий'));
  }

  window.Plan = { planDocx: planDocx, exportPlan: exportPlan, recognize: recognize, tablesFrom: tablesFrom, unzipFile: unzipFile, parseDate: parseDate };
})();
