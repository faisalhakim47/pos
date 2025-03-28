// @ts-check

import { html } from 'webapp/lib/view/html.js';
import { renderBasicLayout } from 'webapp/ui/layouts/basic.js';

export function renderNotFoundPage() {
  return renderBasicLayout(html`
    <div class="not-found-route">
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang anda kunjungi tidak ditemukan.</p>
      <p><a href="${anchorTo('/')}">Kembali ke halaman utama</a></p>
    </div>
  `);
}
