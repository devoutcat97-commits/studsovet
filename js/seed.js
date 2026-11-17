/* Тестовые данные (вымышленные) для работы без облака.
   Загружаются один раз в пустое хранилище; на этапе «Облако» файл уберём. */
(function () {
  'use strict';
  // В облаке и при проверке с эмулятором тестовые данные не нужны.
  if (window.CLOUD_CONFIG || /[?&]emu/.test(location.search) || !Store.isEmpty()) return;

  var now = new Date();
  function at(days, h, m) { var d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m || 0, 0, 0); return d.toISOString(); }
  function pos(unitId, post) { return { unitId: unitId, post: post }; }
  function member(id, name, positions, extra) {
    var m = { id: id, name: name, positions: positions, status: 'active', canCreate: false, isAdmin: false };
    Object.keys(extra || {}).forEach(function (k) { m[k] = extra[k]; });
    Store.put('members', m);
  }

  member('admin', 'Админ (ты)', [], { isAdmin: true });
  member('chair', 'Виктория Белова', [pos('lead', 'chair')]);
  member('deputy', 'Никита Орлов', [pos('lead', 'deputy')]);
  member('secretary', 'Елена Лаврова', [pos('lead', 'secretary')]);
  member('pr-head', 'Дарья Петрова', [pos('pr', 'head')]);
  member('project-head', 'Максим Котов', [pos('project', 'head')]);
  member('career-head', 'Ольга Ким', [pos('career', 'head')]);
  member('anya', 'Анна Смирнова', [pos('pr', 'member'), pos('law', 'deputy')], { canCreate: true });
  member('law-head', 'Илья Волков', [pos('law', 'head')]);
  member('kirill', 'Кирилл Зуев', []);
  member('media-head', 'Тимур Ахмедов', [pos('media', 'head'), pos('pr', 'member')]);
  Store.put('requests', { id: 'req1', name: 'Софья Лис', email: 'sofia@example.ru', positions: [pos('gmu', 'member')], at: at(0, 9) });

  Store.put('events', { id: 'ev-meeting', title: 'Собрание студсовета', date: at(0, 17, 30), place: 'ауд. 214', unitId: 'lead', ownerUid: 'chair', kind: 'meeting' });
  Store.put('events', { id: 'ev-init', title: 'Посвящение в студенты', date: at(4, 18), place: 'Актовый зал', unitId: 'pr', ownerUid: 'pr-head' });
  Store.put('events', { id: 'ev-lecture', title: 'Лекция гостя', date: at(8, 15), place: 'ауд. 301', unitId: 'career', ownerUid: 'career-head' });
  Store.put('events', { id: 'ev-past', title: 'Квиз первокурсников', date: at(-4, 16), place: 'ауд. 105', unitId: 'project', ownerUid: 'project-head' });

  function task(id, title, who, deadline, ev, unitId, status) {
    Store.put('tasks', { id: id, title: title, assigneeUid: who, deadline: deadline, eventId: ev, unitId: unitId, status: status || 'todo', createdBy: 'pr-head' });
  }
  task('t1', 'Согласовать актовый зал', 'anya', at(-2, 18), 'ev-init', 'pr');
  task('t2', 'Сверстать афишу «Посвящение»', 'anya', at(0, 12), 'ev-init', 'pr', 'doing');
  task('t3', 'Список гостей на лекцию', 'anya', at(3, 18), 'ev-lecture', 'career');
  task('t4', 'Найти ведущих', 'project-head', at(2, 18), 'ev-init', 'pr');
  task('t5', 'Написать сценарий', 'pr-head', at(-1, 18), 'ev-init', 'pr', 'done');
  task('t6', 'Пригласить гостя', 'career-head', at(-3, 12), 'ev-lecture', 'career', 'done');
  task('t7', 'Пост об итогах квиза', 'media-head', at(10, 12), 'ev-past', 'pr');

  Store.put('announcements', { id: 'a1', title: 'Новые правила бронирования аудиторий', text: 'Аудитории бронируем через секретаря не позже чем за 3 дня.', important: true, authorUid: 'secretary', at: at(0, 10, 5) });
  Store.put('reads', { id: 'a1_chair', annId: 'a1', uid: 'chair', at: at(0, 11) });
  Store.put('announcements', { id: 'a2', title: 'Итоги прошлого собрания', text: 'Утвердили план на месяц, ответственные за посвящение назначены.', important: false, authorUid: 'chair', at: at(-6, 20) });

  Store.put('proposals', { id: 'p1', title: 'Мастер-класс по публичным выступлениям', idea: 'Пригласить выпускника с радио, час практики для первокурсников.', date: at(17, 15), toUnitId: 'law', authorUid: 'anya', status: 'pending', at: at(-1, 12) });

  Store.list('members').forEach(function (m) { Store.put('members', Units.derive(m)); });
  Store.setting('me', 'anya');
})();
