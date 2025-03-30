// @ts-check

import { Router, Route, Navigate } from '@solidjs/router';
import html from 'solid-js/html';
import { AppPanel } from 'webapp/pages/app-panel.js';

export function App() {
  return html`
    <${Router}>
      <${Route} path="" component=${() => html`<${Navigate} href="panel" replace=${true} />`} />
      <${Route} path="panel" component=${() => AppPanel} />
    <//>
  `;
}
