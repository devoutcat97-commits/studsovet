/* Структура студсовета и права. Правила здесь должны совпадать с firestore.rules
   (этап «Облако») — интерфейс прячет кнопки, а база запрещает по-настоящему. */
(function () {
  'use strict';

  var UNITS = [
    { id: 'lead', kind: 'lead', name: 'Руководство студсовета', short: 'РС' },
    { id: 'project', kind: 'dept', name: 'Проектный отдел', short: 'ПО' },
    { id: 'career', kind: 'dept', name: 'Профориентационный отдел', short: 'ПФ' },
    { id: 'pr', kind: 'dept', name: 'PR-отдел', short: 'PR' },
    { id: 'law', kind: 'asset', name: 'Актив юриспруденции', short: 'ЮР' },
    { id: 'econ', kind: 'asset', name: 'Актив экономики', short: 'ЭК' },
    { id: 'gmu', kind: 'asset', name: 'Актив ГМУ', short: 'ГМУ' },
    { id: 'media', kind: 'asset', name: 'Актив медиакоммуникаций', short: 'МК' },
    { id: 'psy', kind: 'asset', name: 'Актив психологии', short: 'ПС' }
  ];

  // Свой оттенок у каждого подразделения: плашки дат, метки. Тёмная тема осветляет его в CSS.
  var COLORS = { lead: '#951A1D', project: '#2858C8', career: '#0F7B6C', pr: '#C2410C', law: '#6D3FD1',
    econ: '#9A6700', gmu: '#2F7D32', media: '#C2255C', psy: '#0E7490' };
  function color(id) { return COLORS[id] || '#951A1D'; }

  // Должности по типу подразделения.
  var POSTS = {
    lead: { chair: 'Председатель', deputy: 'Заместитель председателя', secretary: 'Секретарь' },
    dept: { head: 'Руководитель отдела', deputy: 'Заместитель руководителя', member: 'Член отдела' },
    asset: { head: 'Глава актива', deputy: 'Заместитель главы', member: 'Участник актива' }
  };

  function unit(id) { return UNITS.filter(function (u) { return u.id === id; })[0] || null; }
  function postName(p) { var u = unit(p.unitId); return u ? POSTS[u.kind][p.post] : ''; }
  // Каждый одобренный — член студсовета; должности в отделах и активах добавляются к этому.
  function title(m) {
    var ps = (m.positions || []).map(postName).filter(Boolean);
    return m.isAdmin && !ps.length ? 'Администратор' : ps.length ? ps.join(', ') : 'Член студсовета';
  }

  // Служебные поля для правил базы (правила не умеют перебирать список должностей).
  function derive(m) {
    var lead = null, heads = [];
    (m.positions || []).forEach(function (p) {
      if (p.unitId === 'lead') lead = p.post;
      else if (p.post === 'head' || p.post === 'deputy') heads.push(p.unitId);
    });
    m.lead = lead; m.heads = heads;
    return m;
  }

  function active(m) { return !!m && m.status === 'active'; }
  function has(m, unitId, posts) {
    return (m.positions || []).some(function (p) { return p.unitId === unitId && posts.indexOf(p.post) >= 0; });
  }
  // Председатель, его заместитель и админ решают всё (кроме назначения админов — только админ).
  function isTop(m) { return active(m) && (m.isAdmin || has(m, 'lead', ['chair', 'deputy'])); }
  function isSecretary(m) { return active(m) && has(m, 'lead', ['secretary']); }
  function leadsUnit(m, unitId) { return active(m) && has(m, unitId, ['head', 'deputy']); }

  // Может создавать мероприятия и задачи в подразделении unitId.
  function canManage(m, unitId) {
    return isTop(m) || isSecretary(m) || leadsUnit(m, unitId) || (active(m) && !!m.canCreate);
  }
  // Есть ли хоть где-то право управлять (показывать ли кнопки «+»).
  function canManageAny(m) {
    return UNITS.some(function (u) { return canManage(m, u.id); });
  }
  // Предложение адресовано подразделению toUnitId ('lead' — председателю).
  function canDecide(m, proposal) {
    return isTop(m) || (proposal.toUnitId !== 'lead' && leadsUnit(m, proposal.toUnitId));
  }
  function canApprovePeople(m) { return isTop(m); }
  function canSetAdmin(m) { return active(m) && !!m.isAdmin; }
  function canAnnounce(m) { return isTop(m) || isSecretary(m); }
  // Раздел «Руководителям»: пишет руководство, читают руководители/главы и их заместители.
  function canBrief(m) { return isTop(m) || isSecretary(m); }
  function isHead(m) { return active(m) && (m.positions || []).some(function (p) { return p.unitId !== 'lead' && (p.post === 'head' || p.post === 'deputy'); }); }
  function seesBrief(m) { return canBrief(m) || isHead(m); }

  window.Units = {
    all: UNITS, posts: POSTS, color: color, unit: unit, postName: postName, title: title, derive: derive,
    isTop: isTop, canManage: canManage, canManageAny: canManageAny, canDecide: canDecide,
    canApprovePeople: canApprovePeople, canSetAdmin: canSetAdmin, canAnnounce: canAnnounce, canBrief: canBrief, isHead: isHead, seesBrief: seesBrief
  };
})();
