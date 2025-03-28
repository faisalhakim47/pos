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
 * @ObservableData Pull-based state management
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

if (isWindow(self) && !('serviceWorker' in self.navigator)) (async function () {
  for await (const _ of once(iterableEvents(self, 'load'))) {
    navigateAction.push('/unsupported-platform');
  }
  throw new Error('Service worker is not supported');
})();

// ====== @Initialization ======


if (isWindow(self)) (async function () {
  for await (const _ of iterateServiceWorkerRegistration()) { }
})();

else if (isServiceWorkerGlobalScope(self)) (async function () {
  initServiceWorker(self);
})();

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

async function* iterateServiceWorkerRegistration() {


  // window.navigator.serviceWorker.register('./webapp.js');

  // window.navigator.serviceWorker.addEventListener('message', async function (event) {
  //   console.debug('ServiceWorkerContainer', 'message', event);
  // });

  // window.navigator.serviceWorker.addEventListener('messageerror', async function (event) {
  //   console.debug('ServiceWorkerContainer', 'messageerror', event);
  // });

  // window.navigator.serviceWorker.addEventListener('controllerchange', async function (event) {
  //   console.debug('ServiceWorkerContainer', 'controllerchange', event);
  //   // window.location.reload();
  // });

  // const { active: serviceWorker } = await window.navigator.serviceWorker.register('./webapp.js', {
  //   scope: '/',
  //   type: 'module',
  //   updateViaCache: 'all',
  // });

  // console.debug('Window', 'load', serviceWorker);

  // serviceWorker.addEventListener('statechange', async function (event) {
  //   console.debug('ServiceWorker', 'statechange', event);
  // });

  // serviceWorker.postMessage({ method: 'version' });
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

// ====== @ObservableData ======

/**
 * @template T
 * @typedef {AsyncGenerator<T, void, undefined>} DataIterable
 */

/**
 * @param {unknown} instance
 * @returns {instance is AsyncGenerator<unknown, unknown, unknown>}
 */
function isAsyncGenerator(instance) {
  return typeof instance === 'object'
    && instance !== null
    && Symbol.asyncIterator in instance;
}

/**
 * @template T
 */
class SubjectIterator {
  /** @type {(value: T) => void} */
  #resolve;

  /** @type {T} */
  #lastValue;
  /**
   * @param {T} value
   */
  push(value) {
    this.#resolve(value);
  }

  /**
   * @returns {DataIterable<T>}
   */
  async *iterate() {
    if (this.#lastValue !== undefined) {
      yield this.#lastValue;
    }
    while (true) {
      /** @type {PromiseWithResolvers<T>} */
      const { promise, resolve } = Promise.withResolvers();
      this.#resolve = resolve;
      this.#lastValue = yield await promise;
    }
  }
}

/**
 * @source
 * @param {EventTarget} eventTarget
 * @param {string} eventName
 * @returns {DataIterable<Event>}
 */
async function* iterableEvents(eventTarget, eventName) {
  /** @type {PromiseWithResolvers<Event>} */
  let { promise, resolve } = Promise.withResolvers();
  /** @type {EventListenerOrEventListenerObject} */
  const listener = function (event) {
    resolve(event);
  };
  eventTarget.addEventListener(eventName, listener);
  try {
    while (true) {
      yield await promise;
      ({ promise, resolve } = Promise.withResolvers());
    }
  }
  finally {
    eventTarget.removeEventListener(eventName, listener);
  }
}

/**
 * @template TIn
 */
class Pipe {
  /**
   * @template T
   * @param {DataIterable<T>} iterator
   */
  static inlet(iterator) {
    const pipe = new Pipe(iterator);
    return pipe;
  }

  #input;

  /**
   * @param {DataIterable<TIn>} input
   */
  constructor(input) {
    this.#input = input;
  }

  /**
   * @template TOut
   * @param {(input: DataIterable<TIn>) => DataIterable<TOut>} operator
   * @returns {Pipe<TOut>}
   */
  pipe(operator) {
    const output = operator(this.#input);
    return new Pipe(output);
  }
}

/**
 * @template T
 * @typedef {T extends DataIterable<infer U> ? U : never} TypeOfDataIterable
 */

/**
 * @operator
 * @template {Array<DataIterable<unknown>>} T
 * @param {T} iterables
 * @returns {DataIterable<{ [K in keyof T]: TypeOfDataIterable<T[K]> }>}
 */
async function* combineLatest(iterables) {
  const results = await Promise.all(iterables.map(function (iterable) {
    return iterable.next();
  }));
  // @ts-ignore
  yield results.map(function (result) {
    return result.value;
  });
  /**
   * @template T
   * @param {DataIterable<T>} iterable
   * @param {number} index
   */
  const next = async function (iterable, index) {
    return {
      index,
      result: await iterable.next(),
    };
  };
  const promises = iterables.map(next);
  while (true) {
    if (promises.length === 0) {
      break;
    }
    const first = await Promise.race(promises);
    results[first.index] = first.result;
    // @ts-ignore
    yield results.map(function (result) {
      return result.value;
    });
    if (first.result.done) {
      promises.splice(first.index, 1);
    }
    else {
      promises[first.index] = next(iterables[first.index], first.index);
    }
  }
}

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @param {(value: T) => boolean|Promise<boolean>} predicate
 * @returns {DataIterable<T>}
 */
async function* filter(iterable, predicate) {
  for await (const value of iterable) {
    if (await predicate(value)) {
      yield value;
    }
  }
}

/**
 * @template TIn, TOut
 * @param {DataIterable<TIn>} iterable
 * @param {(value: TIn) => TOut|Promise<TOut>|DataIterable<TOut>} mapper
 * @returns {DataIterable<TOut>}
 */
async function* map(iterable, mapper) {
  for await (const value of iterable) {
    const mappedValue = mapper(value);
    if (isAsyncGenerator(mappedValue)) {
      yield* takeUntil(mappedValue, iterable);
    }
    else if (mappedValue instanceof Promise) {
      yield await mappedValue;
    }
    else {
      yield mappedValue;
    }
  }
}

/**
 * @template {Array<DataIterable<unknown>>} T
 * @param {T} iterables
 * @returns {DataIterable<[number, TypeOfDataIterable<T[number]>]>}
 */
async function* merge(iterables) {
  /**
   * @template T
   * @param {DataIterable<T>} iterable
   * @param {number} index
   */
  const next = async function (iterable, index) {
    return {
      index,
      result: await iterable.next(),
    };
  };
  const promises = iterables.map(next);
  while (true) {
    if (promises.length === 0) {
      break;
    }
    const first = await Promise.race(promises);
    // @ts-ignore
    yield [first.index, first.result.value];
    if (first.result.done) {
      promises.splice(first.index, 1);
    } else {
      promises[first.index] = next(iterables[first.index], first.index);
    }
  }
}

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @returns {DataIterable<T>}
 */
async function* once(iterable) {
  for await (const value of iterable) {
    yield value;
    break;
  }
}

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @param {DataIterable<unknown>} until
 * @returns {DataIterable<T>}
 */
async function* takeUntil(iterable, until) {
  for await (const value of merge([iterable, until])) {
    if (value[0] === 1) {
      break;
    }
    // @ts-ignore
    yield value[1];
  }
}

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @param {DataIterable<unknown>} after
 * @returns {DataIterable<T>}
 */
async function* takeAfter(iterable, after) {
  for await (const _ of after) { }
  yield* iterable;
}

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @param {T} initialValue
 * @returns {DataIterable<T>}
 */
async function* startWith(iterable, initialValue) {
  yield initialValue;
  for await (const value of iterable) {
    yield value;
  }
}

/**
 * @template T
 * @param {...T} args
 * @returns {DataIterable<T>}
 */
async function* anyToAsyncGenerator(...args) {
  for (const arg of args) {
    if (isAsyncGenerator(arg)) {
      for await (const value of arg) {
        // @ts-ignore
        yield value;
      }
    }
    else if (arg instanceof Promise) {
      yield await arg;
    }
    else {
      yield arg;
    }
  }
}

/**
 * @returns {DataIterable<Window>}
 */
async function* takeWindow() {
  if (isWindow(self)) {
    yield self;
  }
}

takeWindow();

// ====== @WebRouter ======

/** @type {SubjectIterator<string>} */
var navigateAction = new SubjectIterator();

async function* iterateRouter() {
  const navigationAction$ = map(navigateAction.iterate(), function (path) {
    history.pushState(null, '', path);
  });

  const navigationChange$ = merge([
    navigationAction$,
    iterableEvents(window, 'popstate'),
  ]);

  const location$ = startWith(map(navigationChange$, function () {
    return {
      pathname: window.location.pathname,
    };
  }), {
    pathname: window.location.pathname,
  });

  yield* map(location$, async function* (location) {
    console.info('Router', 'location', location);
    if (location === undefined) {
      yield* html``;
    }
    else if (location.pathname === '/') {
      yield* renderRootRoute();
    }
    else if (location.pathname === '/unsupported-platform') {
      yield* renderUnsupportedPlatformNoticeRoute();
    }
    else {
      yield* renderNotFoundRoute();
    }
  });
}

// ====== @UiLibrary ======

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
async function* html(strings, ...values) {
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

async function* htmlTick() {
  while (true) {
    yield await htmlQueueNextTickPromise;
  }
}

/**
 * @param {Node} oldChild
 * @param {Node} newChild
 * @return {Node}
 */
function replaceNode(oldChild, newChild) {
  const parentOfOldChild = oldChild.parentNode;
  assertInstanceOf(Node, parentOfOldChild);
  parentOfOldChild.replaceChild(newChild, oldChild);
  return newChild;
}

/**
 * @param {Node} node
 */
function removeNode(node) {
  const parentNode = node.parentNode;
  assertInstanceOf(Node, parentNode);
  parentNode.removeChild(node);
}

/**
 * @template T
 * @param {Array<T>|DataIterable<Array<T>>} items
 * @param {(item: T, index: number) => string} keyMapper
 * @param {(item: DataIterable<T>, index: number) => DataIterable<Node>} itemView
 * @returns {DataIterable<Node>}
 */
async function* list(items, keyMapper, itemView) {
  const items$ = isAsyncGenerator(items)
    ? items
    : anyToAsyncGenerator(items);

  const endOfList = document.createComment('');
  yield endOfList;
  const beginOfList = document.createComment('');
  const contentNode = endOfList.parentNode;
  assertInstanceOf(Node, contentNode);
  contentNode.insertBefore(beginOfList, endOfList);

  /** @type {Map<string, { key: string, node: Node, itemSubject: SubjectIterator<T>, removeSubject: SubjectIterator<void> }>} */
  let currentItemStateMap = new Map();

  for await (const items of items$) {
    /** @type {Map<string, ValueOfMap<currentItemStateMap>>} */
    const newItemStateMap = new Map();
    /** @type {Array<ValueOfMap<currentItemStateMap>>} */
    const newItemStates = [];
    for (const [itemIndex, item] of items.entries()) {
      const key = keyMapper(item, itemIndex);
      const existingItem = currentItemStateMap.get(key);
      if (existingItem) {
        newItemStates.push(existingItem);
      }
      else {
        const itemSubject = new SubjectIterator();
        const removeSubject = new SubjectIterator();
        const itemView$ = itemView(itemSubject.iterate(), itemIndex);
        const firstItemView = await once(itemView$).next();
        const node = firstItemView.value;
        assertInstanceOf(Node, node);
        newItemStates.push({ key, node, itemSubject, removeSubject });
        (async function (state) {
          for await (const nextNode of takeUntil(itemView$, removeSubject.iterate())) {
            if (state.node !== nextNode) {
              state.node = replaceNode(state.node, nextNode);
            }
          }
          removeNode(state.node);
        })(newItemStates[itemIndex]);
      }
      newItemStateMap.set(key, newItemStates[itemIndex]);
    }

    for (const [key, item] of currentItemStateMap) {
      if (!newItemStateMap.has(key)) {
        item.removeSubject.push();
      }
    }

    const lastIndexOfNewItemStates = newItemStates.length - 1;
    for (let itemIndex = lastIndexOfNewItemStates; itemIndex >= 0; itemIndex--) {
      const itemState = newItemStates[itemIndex];
      const itemNode = itemState.node;
      if (itemIndex === lastIndexOfNewItemStates) {
        htmlAddInterpolationQueue(function () {
          contentNode.insertBefore(itemNode, endOfList);
        });
      }
      else {
        const nextItemState = newItemStates[itemIndex + 1];
        const nextItemNode = nextItemState.node;
        if (itemNode !== nextItemNode) {
          htmlAddInterpolationQueue(function () {
            contentNode.insertBefore(itemNode, nextItemNode);
          });
        }
      }
      itemState.itemSubject.push(items[itemIndex]);
    }

    currentItemStateMap = newItemStateMap;
  }
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
        ownerElement.addEventListener('click', function (event) {
          event.preventDefault();
          navigateAction.push(path);
        });
      }
    }
    return attr;
  };
}

// ====== @UiOfTypography ======

/**
 * @param {DataIterable<Node>} content
 * @returns {DataIterable<Node>}
 */
function renderTypography(content) {
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

// ====== @UiOfTheme ======

/**
 * @param {DataIterable<Node>} content
 * @returns {DataIterable<Node>}
 */
function renderTheme(content) {
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

// ====== @UiOfBasicLayout ======

/**
 * @param {DataIterable<Node>} content
 * @returns {DataIterable<Node>}
 */
function renderBasicLayout(content) {
  return renderTypography(renderTheme(html`
    <div class="app-basic-layout">
      <style>
        .basic-layout {
          max-width: 720px;
          margin: 0 auto;
        }
      </style>
      <div class="basic-layout">
        ${content}
      </div>
    </div>
  `));
}

// ====== @UiOfRootRoute ======

function renderRootRoute() {
  return renderBasicLayout(html`
    <div class="roor-route">
      <h1>Point of Sales</h1>
    </div>
  `);
}

// ====== @UiOfUnsupportedPlatformNoticeRoute ======

function renderUnsupportedPlatformNoticeRoute() {
  const suggestedBrowsers = [
    { name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
    { name: 'Mozilla Firefox', url: 'https://www.mozilla.org/firefox/' },
  ];
  return renderBasicLayout(html`
    <div class="unsupported-platform-notice-route">
      <h1>Browser anda tidak didukung</h1>
      <p>Beberapa fitur pada browser anda tidak tersedia. Silahkan perbarui browser atau gunakan browser standard terbaru berikut:</p>
      <ul>
        ${list(suggestedBrowsers, (browser) => browser.url, (browser$) => html`
          <li>
            <a
              href=${map(browser$, (b) => b.url)}
              target="_blank"
            >${map(browser$, (b) => b.name)}</a>
          </li>
        `)}
      </ul>
    </div>
  `);
}

// ====== @UiOfNotFoundRoute ======

function renderNotFoundRoute() {
  return renderBasicLayout(html`
    <div class="not-found-route">
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang anda kunjungi tidak ditemukan.</p>
      <p><a href="${anchorTo('/')}">Kembali ke halaman utama</a></p>
    </div>
  `);
}

// ====== @GeneralTypeAssertionFunctions ======

/**
 * @template T
 * @typedef {T extends Map<unknown, infer V> ? V : never} ValueOfMap
 */

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
 * @param {string} [message]
 * @returns {asserts instance is T}
 */
function assertInstanceOf(constructor, instance, message) {
  if (!(instance instanceof constructor)) {
    if (typeof message === 'string') {
      throw new Error(message);
    }
    else {
      throw new Error(`Expected instance of ${constructor.name}, got ${instance}`);
    }
  }
}
