// @ts-check

import { render } from 'solid-js/web';
import { App } from 'webapp/pages/app.js';

window.addEventListener('load', function () {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(App, root);
});
