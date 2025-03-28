// @ts-check

import { assertInstanceOf } from 'webapp/assertion.js';

/**
 * @param {Node} node
 */
export function removeNode(node) {
  const parentNode = node.parentNode;
  assertInstanceOf(Node, parentNode);
  parentNode.removeChild(node);
}
