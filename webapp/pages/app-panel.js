// @ts-check

import { Router, Route, Navigate } from '@solidjs/router';
import html from 'solid-js/html';
import { AppDashboard } from 'webapp/pages/app-panel-dashboard.js';

export function AppPanel() {
  return html`
    <${Router}>
      <${Route} path="" component=${() => html`<${Navigate} href=${() => 'dashboard'} replace=${true} />`} />
      <${Route} path="dasboard" component=${() => AppDashboard} />
    <//>
  `;
}
