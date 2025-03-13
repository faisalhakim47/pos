// @ts-check

// =============================================
// ====== POINT OF SALES WEB APPLICATION ======
// ==========================================

// ====== @AboutWebApp ======

/**
 * This is single-file web application for point of sales system.
 * It is designed to be used in offline mode, with sqlite database on service worker.
 *
 * This program uses user file system to store data like desktop app usually do.
 *
 * Why singe-file?
 * - It is personal challange that I seems fun to me.
 *   When this application is successifully done, the deployment will be breeze.
 *   When an issue arise, we can easily debug it. We have all the context required.
 * - It is LLM friendly. LMM can easily read context from the entire codebase.
 */

const webappVersion = 2025_03_11_05_10;

// ====== @TableOfContent ======

/**
 * @AboutWebApp
 * @TableOfContent
 * @AppDependencies The import is always the first
 * @PlatformFeatureSupportCheck Check if the platform support required features
 * @Initialization
 * @TheDatabase Schema, Migration, and More
 * @DataSerde Data serialization and deserialization for communication between workers
 * @ServiceWorker Service worker registration and initialization
 * @WebRouter
 * @UiLibrary The UI library for the application
 * @UiRouter
 * @UiOfTypography
 * @UiOfTheme
 * @UiOfBasicLayout
 * @UiOfRootRoute
 * @UiOfUnsupportedPlatformNoticeRoute
 * @UiOfNotFoundRoute
 * @GeneralTypeAssertionFunctions Types checking and stuff
 */

// ====== @AppDependencies ======

/**
 * You said it is sigle-file app? what is this then?
 * Well, we sorry, we can't reinvent all the wheels.
 * We will use as little dependencies as possible.
 */

/** @typedef {import('./vendor/sqlean.js').Sqlite3Static} Sqlite3Static */

async function importSqlite3InitModule() {
  const importedSqlean = await import('./vendor/sqlean.js');
  return importedSqlean.default;
}

// ====== @PlatformFeatureSupportCheck ======

if (isWindow(self)) {
  if (!('serviceWorker' in self.navigator)) {
    navigateTo(self, '/unsupported-platform');
  }
}

// ====== @Initialization ======

if (isWindow(self)) {
  initRouter(self);
  registerServiceWorker(self);
}

else if (isServiceWorkerGlobalScope(self)) {
  initServiceWorker(self);
}

// ====== @TheDatabase ======

/**
 * The database will handle the main bussiness logic of the application.
 * It will be implemented using sqlite database.
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Sqlite3Static} sqlite3
 */

/**
 * @returns {Promise<Sqlite3Static>}
 */
async function initializeDatabase() {
  const sqlite3InitModule = await importSqlite3InitModule();
  const sqlite3 = await sqlite3InitModule({
    print(message) {
      console.debug('sqlite3', message);
    },
    printErr(message) {
      console.error('sqlite3', message);
    },
  });
  return sqlite3;
}

// ====== @DataSerde ======

/**
 * @param {unknown} data
 */
function serialize(data) {
  return JSON.stringify(data);
}

/**
 * @param {string} data
 * @returns {unknown}
 */
function deserialize(data) {
  return JSON.parse(data);
}

// ====== @ServiceWorker ======

/**
 * @param {Window} window
 */
async function registerServiceWorker(window) {
  window.navigator.serviceWorker.register('./webapp.js');

  window.navigator.serviceWorker.addEventListener('message', async function (event) {
    console.debug('ServiceWorkerContainer', 'message', event);
  });

  window.navigator.serviceWorker.addEventListener('messageerror', async function (event) {
    console.debug('ServiceWorkerContainer', 'messageerror', event);
  });

  window.navigator.serviceWorker.addEventListener('controllerchange', async function (event) {
    console.debug('ServiceWorkerContainer', 'controllerchange', event);
    // window.location.reload();
  });

  const { active: serviceWorker } = await window.navigator.serviceWorker.register('./webapp.js', {
    scope: '/',
    type: 'module',
    updateViaCache: 'all',
  });

  console.debug('Window', 'load', serviceWorker);

  serviceWorker.addEventListener('statechange', async function (event) {
    console.debug('ServiceWorker', 'statechange', event);
  });

  serviceWorker.postMessage({ method: 'version' });
}

/**
 * @param {ServiceWorkerGlobalScope} self
 */
async function initServiceWorker(self) {
  self.addEventListener('install', async function (event) {
    assertInstanceOf(ExtendableEvent, event);
    await self.skipWaiting();
  });

  self.addEventListener('activate', async function (event) {
    assertInstanceOf(ExtendableEvent, event);
    await self.clients.claim();
  });

  self.addEventListener('message', async function (event) {
    assertInstanceOf(ExtendableMessageEvent, event);
    console.debug('ServiceWorkerGlobalScope', 'message', event);
  });

  self.addEventListener('messageerror', async function (event) {
    console.debug('ServiceWorkerGlobalScope', 'messageerror', event);
  });

  self.addEventListener('sync', async function (event) {
    console.debug('ServiceWorkerGlobalScope', 'sync', event);
  });
}

// ====== @WebRouter ======

/**
 * @param {Window} window
 * @param {string} path
 */
function navigateTo(window, path) {
  window.history.pushState({}, '', path);
}

/**
 * @param {Window} window
 */
function initRouter(window) {
  const outlet = document.createComment(''); 
  const handleRoute = function () {
    applyRoute(window, outlet);
  };
  window.addEventListener('popstate', handleRoute);
  window.addEventListener('load', function () {
    document.body.appendChild(outlet);
    handleRoute();
  });
}

/**
 * @param {Window} window
 * @param {Node} outlet
 */
function applyRoute(window, outlet) {
  const pathname = window.location.pathname;
  console.info('applyRoute', pathname);
  if (pathname === '/') {
    outlet = replaceNode(outlet, renderRootRoute());
  }
  else if (pathname === '/unsupported-platform') {
    outlet = replaceNode(outlet, renderUnsupportedPlatformNoticeRoute());
  }
  else {
    outlet = replaceNode(outlet, renderNotFoundRoute());
  }
}

// ====== @UiLibrary ======

/**
 * @typedef {undefined|null|void|string|number|Node} HtmlStaticValue
 */

/**
 * @typedef {HtmlStaticValue|((node: Node) => HtmlStaticValue)} HtmlValue
 */

/** @type {Map<TemplateStringsArray, HTMLTemplateElement>} */
var htmlCache = new Map();
var htmlPlaceholder = '__placeholder__';

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
      const unpreparedWalker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
      /** @type {Map<Node, Array<Text>>} */
      const nodeReplaces = new Map();
      while (unpreparedWalker.nextNode()) {
        const node = unpreparedWalker.currentNode;
        const strings = node.nodeValue.split(htmlPlaceholder);
        const lastStringIndex = strings.length - 1;
        const preparedTexts = [];
        for (const [index, staticString] of strings.entries()) {
          const trimmedStaticString = staticString.trim();
          if (trimmedStaticString.length) {
            const trimmedStaticText = document.createTextNode(trimmedStaticString);
            preparedTexts.push(trimmedStaticText);
          }
          if (index < lastStringIndex) {
            const dynamicText = document.createTextNode(htmlPlaceholder);
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
      htmlCache.set(strings, template);
      return template;
    })();

  const content = document.importNode(preparedTemplate.content, true);

  const contentWalker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return ((node instanceof Text && node.nodeValue === htmlPlaceholder) || node instanceof Element)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let index = 0;
  const nodeMutations = [];
  while (contentWalker.nextNode() instanceof Node) {
    const node = contentWalker.currentNode;
    const value = values[index];
    if (node instanceof Text) {
      nodeMutations.push(function () {
        replaceNode(node, applyHtmlNodeInterpolation(node, value));
      });
      index++;
    }
    else if (node instanceof Element) {
      for (let attrIndex = 0; attrIndex < node.attributes.length; attrIndex++) {
        const attr = node.attributes.item(attrIndex);
        if (attr.value === htmlPlaceholder) {
          nodeMutations.push(function () {
            replaceAttr(attr, applyHtmlAttrInterpolation(attr, value));
          });
          index++;
        }
      }
    }
  }

  for (const mutateNode of nodeMutations) {
    mutateNode();
  }

  return content;
}

/**
 * @param {Node} oldChild
 * @param {Node} newChild
 * @returns {Node}
 */
function replaceNode(oldChild, newChild) {
  const parentNode = oldChild.parentNode;
  if (parentNode instanceof Node && oldChild !== newChild) {
    parentNode.replaceChild(newChild, oldChild);
  }
  return newChild;
}

/**
 * @param {Node} node
 * @param {HtmlValue} value
 * @returns {Node}
 */
function applyHtmlNodeInterpolation(node, value) {
  if (typeof value === 'string') {
    node.nodeValue = value;
    return node;
  }
  if (typeof value === 'undefined' || value === null) {
    return applyHtmlNodeInterpolation(node, '');
  }
  if (typeof value === 'number') {
    return applyHtmlNodeInterpolation(node, value.toString());
  }
  if (typeof value === 'function') {
    return applyHtmlNodeInterpolation(node, value(node));
  }
  if (value instanceof Node) {
    return value;
  }
  throw new Error('Invalid HtmlNodeInterpolation value', {
    cause: value,
  });
}

/**
 * @param {Attr} oldAttr
 * @param {Attr} newAttr
 * @returns {Attr}
 */
function replaceAttr(oldAttr, newAttr) {
  const ownerElement = oldAttr.ownerElement;
  if (ownerElement instanceof Element && oldAttr !== newAttr) {
    ownerElement.setAttributeNode(newAttr);
    ownerElement.removeAttributeNode(oldAttr);
  }
  return newAttr;
}

/**
 * @param {Attr} attr
 * @param {HtmlValue} value
 */
function applyHtmlAttrInterpolation(attr, value) {
  if (typeof value === 'string') {
    attr.value = value;
    return attr;
  }
  if (typeof value === 'undefined' || value === null) {
    return applyHtmlAttrInterpolation(attr, '');
  }
  if (typeof value === 'function') {
    return applyHtmlAttrInterpolation(attr, value(attr));
  }
  throw new Error('Invalid HtmlAttrInterpolation value', {
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

// ====== @UiRouter ======

/**
 * @param {string} path
 */
function anchorTo(path) {
  /** @param {Node} attr */
  return function (attr) {
    if (attr instanceof Attr && attr.name === 'href') {
      attr.value = path;
      const ownerElement = attr.ownerElement;
      if (ownerElement instanceof Element) {
        console.dir(ownerElement);
        ownerElement.addEventListener('click', function (event) {
          event.preventDefault();
          history.pushState({}, '', path);
        });
      }
    }
  };
}

// ====== @UiOfTypography ======

/**
 * @param {Node} content 
 */
function renderTypography(content) {
  return html`
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
  `;
}

// ====== @UiOfTheme ======

/**
 * @param {Node} content
 */
function renderTheme(content) {
  return html`
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
  `;
}

// ====== @UiOfBasicLayout ======

/**
 * @param {Node} content
 * @returns {Node}
 */
function renderBasicLayout(content) {
  return renderTypography(renderTheme(html`
    <style>
      .basic-layout {
        max-width: 720px;
        margin: 0 auto;
      }
    </style>
    <div class="basic-layout">
      ${content}
    </div>
  `));
}

// ====== @UiOfRootRoute ======

/**
 * @returns {Node}
 */
function renderRootRoute() {
  return renderBasicLayout(html`
    <h1>Point of Sales</h1>
  `);
}

// ====== @UiOfUnsupportedPlatformNoticeRoute ======

/**
 * @returns {Node}
 */
function renderUnsupportedPlatformNoticeRoute() {
  const suggestedBrowsers = [
    { name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
    { name: 'Mozilla Firefox', url: 'https://www.mozilla.org/firefox/' },
  ];
  return renderBasicLayout(html`
    <h1>Browser anda tidak didukung</h1>
    <p>Beberapa fitur pada browser anda tidak tersedia. Silahkan perbarui browser atau gunakan browser standard terbaru berikut:</p>
    <ul>
      ${staticList(suggestedBrowsers, (browser) => html`
        <li><a href=${browser.url} target="_blank">${browser.name}</a></li>
      `)}
    </ul>
  `);
}

// ====== @UiOfNotFoundRoute ======

/**
 * @returns {Node}
 */
function renderNotFoundRoute() {
  return renderBasicLayout(html`
    <h1>Halaman tidak ditemukan</h1>
    <p>Alamat yang anda kunjungi tidak ditemukan.</p>
    <p><a href="${anchorTo('/')}">Kembali ke halaman utama</a></p>
  `);
}

// ====== @GeneralTypeAssertionFunctions ======

/**
 * Check Window instance without referencing Window object.
 *
 * @param {unknown} maybeWindow
 * @returns {value is Window}
 */
function isWindow(maybeWindow) {
  return typeof maybeWindow === 'object'
    && maybeWindow !== null
    && 'window' in maybeWindow
    && maybeWindow.window === maybeWindow
    && 'document' in maybeWindow
    && typeof maybeWindow.document === 'object'
    && 'Document' in maybeWindow
    && typeof maybeWindow.Document === 'function'
    && maybeWindow.document instanceof maybeWindow.Document;
}

/**
 * Check ServiceWorkerGlobalScope instance without referencing ServiceWorkerGlobalScope object.
 * 
 * @param {unknown} maybeServiceWorkerGlobalScope
 * @returns {maybeServiceWorkerGlobalScope is ServiceWorkerGlobalScope}
 */
function isServiceWorkerGlobalScope(maybeServiceWorkerGlobalScope) {
  return typeof maybeServiceWorkerGlobalScope === 'object'
    && maybeServiceWorkerGlobalScope !== null
    && 'ServiceWorkerGlobalScope' in maybeServiceWorkerGlobalScope
    && maybeServiceWorkerGlobalScope.ServiceWorkerGlobalScope === maybeServiceWorkerGlobalScope;
}

/**
 * @template T
 * @param {new (...args: Array<unknown>) => T} constructor
 * @param {unknown} instance
 * @returns {asserts instance is T}
 */
function assertInstanceOf(constructor, instance) {
  if (!(instance instanceof constructor)) {
    throw new Error(`Expected instance of ${constructor.name}, got ${instance}`);
  }
}
