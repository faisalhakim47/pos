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
export function renderDesignTokensStyle(content) {
  return html`
    <div class="app-theme">
      <style>
        @media (prefers-color-scheme: light) {
          html, body {
            background-color: azure;
            color: black;
          }
          a {
            color: royalblue;
          }
          a:visited {
            color: slateblue;
          }
        }
        @media (prefers-color-scheme: dark) {
          html, body {
            background-color: #111111;
            color: linen;
          }
          a {
            color: lightblue;
          }
          a:visited {
            color: thistle;
          }
        }
      </style>
      ${content}
    </div>
  `;
}
