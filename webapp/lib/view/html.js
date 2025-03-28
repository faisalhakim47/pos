// @ts-check

import { assertInstanceOf } from 'webapp/assertion.js';
import { isAsyncGenerator } from 'webapp/lib/data/assertion.js';
import { merge } from 'webapp/lib/data/operators/merge.js';
import { anyToAsyncGenerator } from 'webapp/lib/data/sources/any.js';
import { removeNode } from 'webapp/lib/view/dom.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/** @typedef {undefined|null|void|string|number|Node} HtmlStaticValue */
/** @typedef {DataIterable<HtmlStaticValue>} HtmlIterableValue */
/** @typedef {(node: Node) => HtmlStaticValue|HtmlIterableValue} HtmlOperatorValue */
/** @typedef {HtmlStaticValue|HtmlIterableValue|HtmlOperatorValue} HtmlValue */

/**
 * @typedef {object} PreparedHtml
 * @property {HTMLTemplateElement} template
 * @property {Array<Array<Array<number>>>} nodeRoutes
 */

/** @type {Map<TemplateStringsArray, PreparedHtml>} */
var htmlCache = new Map();
var htmlPlaceholder = '\u2753';

/**
 * @param {TemplateStringsArray} strings
 * @param {Array<HtmlValue>} values
 * @returns {DataIterable<Node>}
 */
export async function* html(strings, ...values) {
  const preparedTemplate = htmlCache.get(strings)
    ?? (function () {
      const template = document.createElement('template');
      const stringsWithPlaceholders = strings
        .map(function (string, index, strings) {
          const lastIndex = strings.length - 1;
          return `${string}${index === lastIndex ? '' : `${htmlPlaceholder}${index}`}`;
        })
        .join('')
        .trim();
      template.innerHTML = stringsWithPlaceholders;

      if (template.content.childNodes.length === 0) {
        return {
          nodeRoutes: [],
          template,
        };
      }

      if (template.content.childNodes.length !== 1) {
        console.error('html', 'template', stringsWithPlaceholders);
        throw new Error('html function supports only one root element');
      }

      const rootNode = template.content.childNodes[0];

      const preparationWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
      /** @type {Map<Node, Array<Node>>} */
      const nodeReplaces = new Map();
      while (preparationWalker.nextNode()) {
        const node = preparationWalker.currentNode;
        const htmlPlaceholderRegExp = new RegExp(`${htmlPlaceholder}\\d*`, 'g');
        const textValues = node.nodeValue.split(htmlPlaceholderRegExp);
        const lastStringIndex = textValues.length - 1;
        /** @type {Array<Node>} */
        const preparedTexts = [];
        for (const [index, staticTextValue] of textValues.entries()) {
          const trimmedStaticTextValue = staticTextValue.trim();
          if (trimmedStaticTextValue.length) {
            const trimmedStaticText = document.createTextNode(trimmedStaticTextValue);
            preparedTexts.push(trimmedStaticText);
          }
          if (index < lastStringIndex) {
            const dynamicText = document.createComment(htmlPlaceholder);
            preparedTexts.push(dynamicText);
          }
        }
        nodeReplaces.set(node, preparedTexts);
      }
      for (const [node, texts] of nodeReplaces) {
        const parentNode = node.parentNode;
        for (const text of texts) {
          parentNode.insertBefore(text, node);
        }
        parentNode.removeChild(node);
      }

      const traceWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          return ((node instanceof Element) || (node instanceof Comment && node.nodeValue.startsWith(htmlPlaceholder)))
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      /** @type {Array<Node>} */
      const palceholderNodes = [];
      while (traceWalker.nextNode()) {
        const node = traceWalker.currentNode;
        if (node instanceof Comment) {
          palceholderNodes.push(node);
        }
        else if (node instanceof Element) {
          const attrLength = node.attributes.length;
          for (let attrIndex = 0; attrIndex < attrLength; attrIndex++) {
            const attr = node.attributes.item(attrIndex);
            if (attr.value.startsWith(htmlPlaceholder)) {
              palceholderNodes.push(attr);
            }
          }
        }
        else {
          throw new Error('Invalid node type');
        }
      }

      /** @type {Array<Array<Array<number>>>} */
      const nodeRoutes = [];
      for (const palceholderNode of palceholderNodes) {
        const nodeRoute = [];
        let iNode = palceholderNode;
        while (iNode !== rootNode) {
          if (iNode instanceof Attr) {
            const ownerElement = iNode.ownerElement;
            assertInstanceOf(Element, ownerElement);
            nodeRoute.push([
              Node.ATTRIBUTE_NODE,
              Array.prototype.indexOf.call(ownerElement.attributes, iNode),
            ]);
            iNode = ownerElement;
          }
          else if (iNode instanceof Node) {
            const parentNode = iNode.parentNode;
            nodeRoute.push([
              Node.ELEMENT_NODE,
              Array.prototype.indexOf.call(parentNode.childNodes, iNode),
            ]);
            iNode = parentNode;
          }
          else {
            throw new Error('Invalid node type');
          }
        }
        nodeRoutes.push(nodeRoute);
      }

      /** @type {PreparedHtml} */
      const preparedHtmlTemplate = {
        nodeRoutes,
        template,
      };

      htmlCache.set(strings, preparedHtmlTemplate);

      console.debug('html', 'template', preparedHtmlTemplate.template.innerHTML, preparedHtmlTemplate.nodeRoutes, palceholderNodes);

      return preparedHtmlTemplate;
    })();

  const content = document.importNode(preparedTemplate.template.content, true);
  const rootNode = content.childNodes[0];

  let valueIndex = 0;
  /** @type {Array<Array<HtmlValue>>} */
  const interpolations = [];
  for (const nodeRoute of preparedTemplate.nodeRoutes) {
    let node = rootNode;
    for (const [nodeType, attrIndex] of nodeRoute) {
      const value = values[valueIndex++];
      if (nodeType === Node.ATTRIBUTE_NODE) {
        assertInstanceOf(Element, node);
        const placeholderAttr = node.attributes.item(attrIndex);
        interpolations.push([placeholderAttr, value]);
        break;
      }
      else if (nodeType === Node.ELEMENT_NODE) {
        const childNode = node.childNodes.item(attrIndex);
        if (childNode instanceof Comment) {
          interpolations.push([childNode, value]);
          break;
        }
        node = childNode;
      }
      else {
        throw new Error('Invalid node type');
      }
    }
  }

  yield rootNode;

  const iterators = interpolations.map(function ([, value]) {
    return anyToAsyncGenerator(value);
  });

  for await (const [index, newValue] of merge(iterators)) {
    const oldNode = interpolations[index][0];
    assertInstanceOf(Node, oldNode);
    if (newValue instanceof Node) {
      if (newValue !== oldNode) {
        const oldNodeParent = oldNode.parentNode;
        htmlAddInterpolationQueue(function () {
          oldNodeParent.replaceChild(newValue, oldNode);
        });
      }
    }
    else if (typeof newValue === 'function') {
      htmlAddInterpolationQueue(function () {
        const newNode = newValue(oldNode);
        if (newNode instanceof Node) {
          if (newNode !== oldNode) {
            const oldNodeParent = oldNode.parentNode;
            assertInstanceOf(Node, oldNodeParent);
            if (oldNodeParent) {
              oldNodeParent.replaceChild(newNode, oldNode);
            }
          }
        }
        else if (newNode === undefined) {
          removeNode(oldNode);
        }
      });
    }
    else {
      if (isAsyncGenerator(newValue)) {
        throw new Error('Nested dynamic interpolation is not supported yet.');
      }
      htmlAddInterpolationQueue(function () {
        oldNode.nodeValue = `${newValue}`;
      });
    }
  }
}

/** @type {Array<() => void>} */
let htmlQueuedInterpolations = [];
let htmlQueueScheduled = false;
let htmlQueueNextTickPromise = Promise.resolve();

/** @param {() => void} interpolation */
function htmlAddInterpolationQueue(interpolation) {
  htmlQueuedInterpolations.push(interpolation);
  if (htmlQueueScheduled) return;
  /** @type {PromiseWithResolvers<void>} */
  const { promise, resolve } = Promise.withResolvers();
  htmlQueueNextTickPromise = promise;
  requestAnimationFrame(function () {
    for (const interpolation of htmlQueuedInterpolations) {
      interpolation();
    }
    htmlQueuedInterpolations = [];
    resolve();
    htmlQueueScheduled = false;
  });
  htmlQueueScheduled = true;
}
