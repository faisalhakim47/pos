// @ts-check

import { html } from 'webapp/lib/view/html.js';
import { renderDesignTokensStyle } from 'webapp/ui/styles/design-tokens.js';
import { renderTypographyStyle } from 'webapp/ui/styles/typography.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @param {DataIterable<Node>} content
 * @returns {DataIterable<Node>}
 */
export function renderBasicLayout(content) {
  return renderTypographyStyle(renderDesignTokensStyle(html`
    <div class="basic-layout">
      <header>
        <h1>POAS</h1>
      </header>
      <main>${content}</main>
      <footer>
        <p>&copy; 2025 My Web App</p>
      </footer>
    </div>
  `));
}
