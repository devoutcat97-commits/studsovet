/* Настройки облака Firebase (проект studsovet-alt). Это не пароль: строки только
   говорят сайту, к какому проекту подключаться. Защищают данные правила firestore.rules.
   null вместо объекта — демо-режим на тестовых данных. Адрес с ?emu — локальный эмулятор. */
window.CLOUD_CONFIG = {
  apiKey: 'AIzaSyAQt6GiREQ1ASzhW4Ijx4MwXyN46sEb_yI',
  authDomain: 'studsovet-alt.firebaseapp.com',
  projectId: 'studsovet-alt',
  storageBucket: 'studsovet-alt.firebasestorage.app',
  messagingSenderId: '57819534730',
  appId: '1:57819534730:web:30141c26cb8570dbbaa473'
};

/* Адрес сервера файлов (Apps Script, server/Code.gs). Заполнится после развёртывания. */
window.FILES_URL = 'https://script.google.com/macros/s/AKfycbxNzPBAHDs_hzFWK6eSP_lIKii14E8w2QzP0COHC_-gNEJiYrztWCZG7dQkAux4dPlePQ/exec';

/* Публичный ключ для веб-пушей (Firebase → Cloud Messaging → Web Push certificates). Не секрет. */
window.VAPID_KEY = 'BPN_l0Qlc3jq2R5wSydHdcOTxB6jqrlYheUOronxGWpskm_GmQTFwCAaSzUdfJrkWZ64p7Uy9F0hYSgjOpS8ZVA';
