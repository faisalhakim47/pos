// @ts-check

import { html } from 'webapp/lib/view/html.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @param {DataIterable<Node>} content
 * @returns {DataIterable<Node>}
 */
export function renderTypographyStyle(content) {
  return html`
    <div class="app-typography">
      <style>
        html {
          font-size: 16px;
          font-family: sans-serif;
        }
        h1 {
          font-size: 1.5em;
          margin: 1.5em 0px 1em;
        }
        p {
          line-height: 1.4;
          margin: 0.75em 0px;
        }
        ul > li {
          margin: 0.5em 0px;
        }
      </style>
      ${content}
    </div>
  `;
}
