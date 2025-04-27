// @ts-check

import { createApp, nextTick } from 'vue';

import App from '@/views/App.vue';
import { createRouter } from '@/router/router.js';
import { createI18n } from '@/i18n/i18n.js';

window.addEventListener('load', async function () {
  const appElement = document.createElement('div');
  appElement.style.setProperty('width', '100%');
  appElement.style.setProperty('height', '100%');

  const i18n = createI18n();
  const router = createRouter();

  const app = createApp(App);
  app.use(i18n);
  app.use(router);
  app.mount(appElement);

  await Promise.all([
    nextTick(),
    router.isReady,
  ]);

  document.body.appendChild(appElement);

  const splashScreenEl = document.getElementById('app-splash-screen');
  if (splashScreenEl instanceof HTMLElement) {
    splashScreenEl.classList.add('app-splash-screen-exit');
  }
});
