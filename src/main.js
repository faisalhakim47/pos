// @ts-check

import { createApp, nextTick } from 'vue';
import { useRouter } from 'vue-router';

import { i18n } from '@/src/i18n/i18n.js';
import { router } from '@/src/router/router.js';
import AppRoot from '@/src/views/AppRoot.vue';
import { loadFonts } from '@/src/font.js';
import { platform } from '@/src/context/platform.js';
import { db } from '@/src/context/db.js';

window.addEventListener('load', async function () {
  const appElement = document.createElement('div');
  appElement.style.setProperty('width', '100%');
  appElement.style.setProperty('height', '100%');

  const app = createApp(AppRoot);

  app.use(db);
  app.use(i18n);
  app.use(platform);
  app.use(router);

  app.mount(appElement);

  app.runWithContext(async function () {
    const router = useRouter();

    await Promise.all([
      nextTick(),
      loadFonts(),
      router.isReady(),
    ]);

    document.body.appendChild(appElement);

    const splashScreenEl = document.getElementById('app-splash-screen');
    if (splashScreenEl instanceof HTMLElement) {
      splashScreenEl.classList.add('app-splash-screen-exit');
    }
  });
});
