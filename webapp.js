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
  if ('serviceWorker' in self.navigator) {
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
  if (pathname === '/') {
    outlet = replaceChild(outlet, renderRootRoute(window));
  }
  else if (pathname === '/unsupported-platform') {
    outlet = replaceChild(outlet, renderUnsupportedPlatformNoticeRoute(window));
  }
  else {
    outlet = replaceChild(outlet, renderNotFoundRoute(window));
  }
}

// ====== @UiLibrary ======

/**
 * @typedef {undefined|null|string|number|Node} HtmlStaticValue
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
      replaceChild(node, applyHtmlInterpolation(node, value));
    });
    index++;
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
function replaceChild(oldChild, newChild) {
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
    return value;
  }
  throw new Error('Invalid HtmlSyncValue', {
    cause: value,
  });
}

// ====== @UiOfRootRoute ======

/**
 * @param {Window} window
 * @returns {Node}
 */
function renderRootRoute(window) {
  return html`
    <h1>Hello, World!</h1>
  `;
}

// ====== @UiOfUnsupportedPlatformNoticeRoute ======

/**
 * @param {Window} window
 * @returns {Node}
 */
function renderUnsupportedPlatformNoticeRoute(window) {
  return html`
    <h1>Your browser is not supported!</h1>
  `;
}

// ====== @UiOfNotFoundRoute ======

/**
 * @param {Window} window
 * @returns {Node}
 */
function renderNotFoundRoute(window) {
  return html`
    <h1>Not Found!</h1>
  `;
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
