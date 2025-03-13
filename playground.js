// @ts-check

/**
 * @typedef {undefined|null|string|number|Node} HtmlStaticValue
 */

/**
 * @typedef {HtmlStaticValue|((node: Node) => HtmlStaticValue)} HtmlValue
 */

/** @type {Map<TemplateStringsArray, HTMLTemplateElement>} */
const htmlCache = new Map();
const htmlPlaceholder = '__placeholder__';

/**
 * @param {TemplateStringsArray} strings
 * @param {Array<HtmlValue>} values
 * @returns {Node}
 */
function html(strings, ...values) {
  const preparedTemplate = htmlCache.get(strings)
    ?? (function () {
      const template = document.createElement('template');
      template.innerHTML = strings.join(htmlPlaceholder);
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.nodeValue.includes(htmlPlaceholder)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      /** @type {Map<Node, Array<Text>>} */
      const replaces = new Map();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const contents = node.nodeValue.split(htmlPlaceholder);
        const lastContextIndex = contents.length - 1;
        const preparedTexts = [];
        for (const [index, text] of contents.entries()) {
          const staticText = document.createTextNode(text);
          preparedTexts.push(staticText);
          if (index < lastContextIndex) {
            const dynamicText = document.createTextNode(htmlPlaceholder);
            preparedTexts.push(dynamicText);
          }
        }
        replaces.set(node, preparedTexts);
      }
      for (const [node, texts] of replaces) {
        const parentNode = node.parentNode;
        for (const text of texts) {
          parentNode.insertBefore(text, node);
        }
        parentNode.removeChild(node);
      }
      htmlCache.set(strings, template);
      return template;
    })();

  const content = document.importNode(preparedTemplate.content, true);

  const contentWalker = document.createTreeWalker(content, NodeFilter.SHOW_ATTRIBUTE | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue === htmlPlaceholder
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let index = 0;
  const nodeMutations = [];
  while (contentWalker.nextNode() instanceof Node) {
    const node = contentWalker.currentNode;
    const value = values[index];
    nodeMutations.push(function () {
      return applyHtmlInterpolation(node, value);
    });
    index++;
  }

  for (const mutation of nodeMutations) {
    mutation();
  }

  return content;
}

/**
 * @param {Node} node
 * @param {HtmlValue} value
 * @returns {Node}
 */
function applyHtmlInterpolation(node, value) {
  if (typeof value === 'string') {
    node.nodeValue = value;
    return node;
  }
  if (typeof value === 'undefined' || value === null) {
    return applyHtmlInterpolation(node, '');
  }
  if (typeof value === 'number') {
    return applyHtmlInterpolation(node, value.toString());
  }
  if (typeof value === 'function') {
    return applyHtmlInterpolation(node, value(node));
  }
  if (value instanceof Node) {
    node.parentNode.replaceChild(value, node);
    return value;
  }
  throw new Error('Invalid HtmlSyncValue', {
    cause: value,
  });
}

/**
 * @template T
 * @param {Array<T>} items
 * @param {(item: T, index: number, items: Array<T>) => Node} contentMapper
 * @returns {(node: Node) => Node}
 */
function staticList(items, contentMapper) {
  return function () {
    const fragment = document.createDocumentFragment();
    for (const [index, item] of items.entries()) {
      const content = contentMapper(item, index, items);
      fragment.appendChild(content);
    }
    return fragment;
  };
}

function rootPage() {
  const items = Array.from({ length: 1000 }, function (_, index) {
    return index;
  });
  return html`
    <div>
      <h1>Root Page</h1>
      <ul>
        ${staticList(items, function (item) {
          return html`
            <li>${item.toString().padStart(3, '0')}</li>
          `;
        })}
      </ul>
    </div>
  `;
}

document.body.appendChild(rootPage());
