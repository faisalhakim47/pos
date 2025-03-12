// @ts-check

async function* rootPage() {
  yield 'Hello, world!';
}

for await (const chunk of rootPage()) {
}

/**
 * @typedef {string} HtmlValue
 */

/** @type {Map<TemplateStringsArray, HTMLTemplateElement>} */
const templateCache = new Map();
const templatePlaceholder = '___P___';

/**
 * @param {TemplateStringsArray} strings
 * @param {...Array<HtmlValue>} values
 * @returns 
 */
function html(strings, ...values) {
  const template = templateCache.get(strings)
    ?? (function () {
      const template = document.createElement('template');
      template.innerHTML = strings.join(templatePlaceholder);
      /** @type {Array<(value: HtmlValue) => void>} */
      const operations = [];
      const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ATTRIBUTE | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.nodeValue.includes(templatePlaceholder)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      /** @type {Map<Node, DocumentFragment>} */
      const replaces = new Map()
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node instanceof Text) {
          const templateStrings = node.nodeValue.split(templatePlaceholder);
          for (const [index, text] of templateStrings.entries()) {
          }
        }
        else if (node instanceof Attr) {
        }
        else {
          console.error('Unexpected node type:', node);
        }
      }
      templateCache.set(strings, template);
      return template;
    })();

  /**
   * @param {DocumentFragment} [old]
   */
  return function (old) {

  };
}
