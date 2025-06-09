// @ts-check

import { createApp, nextTick } from 'vue';
import { useRouter } from 'vue-router';

import { db } from '@/src/context/db.js';
import { formatter } from '@/src/context/formatter.js';
import { platform } from '@/src/context/platform.js';
import { loadFonts } from '@/src/font.js';
import { i18n } from '@/src/i18n/i18n.js';
import { router } from '@/src/router/router.js';
import AppRoot from '@/src/views/AppRoot.vue';

window.addEventListener('load', async function () {
  const appElement = document.createElement('div');
  appElement.style.setProperty('width', '100%');
  appElement.style.setProperty('height', '100%');

  const app = createApp(AppRoot);

  app.use(platform);
  app.use(db);
  app.use(formatter);
  app.use(i18n);
  app.use(router);

  app.mount(appElement);

  await app.runWithContext(async function () {
    const router = useRouter();
    await Promise.all([
      nextTick(),
      loadFonts(),
      router.isReady(),
    ]);
  });

  document.body.appendChild(appElement);
  const splashScreenEl = document.getElementById('app-splash-screen');
  if (splashScreenEl instanceof HTMLElement) {
    splashScreenEl.classList.add('app-splash-screen-exit');
  }
});
