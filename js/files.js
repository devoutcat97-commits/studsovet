/* Обложки (сжатая картинка в базе) и материалы мероприятий (Google Диск через сервер). */
(function () {
  'use strict';

  var MAX_FILE = 10 * 1024 * 1024;

  // Картинка → JPEG не больше 800 px по длинной стороне.
  function compress(file) {
    return new Promise(function (ok, fail) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 800 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var q = 0.8, data = c.toDataURL('image/jpeg', q);
        while (data.length > 290000 && q > 0.3) { q -= 0.15; data = c.toDataURL('image/jpeg', q); }
        ok(data);
      };
      img.onerror = function () { fail(new Error('Это не картинка.')); };
      img.src = url;
    });
  }

  // Аватар: квадрат 256×256 по центру фото, JPEG до ~60 КБ.
  function setAvatar(file, me) {
    return new Promise(function (ok, fail) {
      if (!/^image\//.test(file.type)) return fail(new Error('Это не картинка.'));
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var side = Math.min(img.width, img.height), c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        var q = 0.85, data = c.toDataURL('image/jpeg', q);
        while (data.length > 58000 && q > 0.3) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        Store.put('avatars', { id: me.id, data: data, at: new Date().toISOString() });
        ok();
      };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('Не получилось открыть фото.')); };
      img.src = url;
    });
  }

  function setCover(eventId, file, me) {
    return compress(file).then(function (data) {
      Store.put('covers', { id: eventId, data: data, uid: me.id, at: new Date().toISOString() });
    });
  }

  function readBase64(file) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { fail(new Error('Не удалось прочитать файл.')); };
      r.readAsDataURL(file);
    });
  }

  // Запрос к серверу файлов. text/plain — чтобы браузер не делал лишнюю проверку (CORS).
  function call(body) {
    if (!window.FILES_URL || !window.firebase || !firebase.auth().currentUser) {
      return Promise.reject(new Error('Файлы работают только в облачной версии.'));
    }
    return firebase.auth().currentUser.getIdToken().then(function (token) {
      body.idToken = token;
      return fetch(FILES_URL, { method: 'POST', body: JSON.stringify(body) });
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.error) throw new Error(res.error);
      return res;
    });
  }

  function upload(eventId, file) {
    if (file.size > MAX_FILE) return Promise.reject(new Error('Файл больше 10 МБ. Загрузи его на Диск сам и вставь ссылку в комментарий.'));
    return readBase64(file).then(function (data) {
      return call({ action: 'upload', eventId: eventId, name: file.name, mime: file.type, data: data });
    });
  }

  function download(fileId) {
    return call({ action: 'download', fileId: fileId }).then(function (res) {
      var bin = atob(res.data), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
      var a = document.createElement('a'); a.href = url; a.download = res.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function remove(fileId) { return call({ action: 'remove', fileId: fileId }); }

  function kind(f) {
    var ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 4);
    var color = /PDF/.test(ext) ? '#951A1D' : /DOC|TXT|RTF|ODT/.test(ext) ? '#2858C8' : /XLS|CSV|ODS/.test(ext) ? '#2E7D4F' : /PNG|JPG|JPEG|GIF|WEBP|HEIC/.test(ext) ? '#B45309' : '#6B605C';
    return { ext: ext || 'ФАЙЛ', color: color };
  }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ'; }

  window.Files = { setAvatar: setAvatar, setAvatar: setAvatar, setAvatar: setAvatar, setCover: setCover, upload: upload, download: download, remove: remove, kind: kind, size: size, compress: compress };
})();
