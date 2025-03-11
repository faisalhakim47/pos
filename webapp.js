// @ts-check

// ===========================================
// ===== POINT OF SALES WEB APPLICATION ======
// ===========================================

// ===== @AboutWebApp =====

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

// ===== @TableOfContent ======

/**
 * @AboutWebApp
 * @TableOfContent
 * @AppDependencies The import is always the first
 * @TheDatabase Schema, Migration, and More
 * @DataSerde Data serialization and deserialization for communication between workers
 * @ServiceWorkerMechanism Service worker registration and initialization
 * @GeneralAssertionFunctions Types checking and stuff
 */

// ===== @AppDependencies =====

/**
 * You said it is sigle-file app? what is this then?
 * Well, we sorry, we can't reinvent all the wheels.
 * We will use as little dependencies as possible.
 */

/** @typedef {import('./vendor/sqlean.js').Sqlite3Static} Sqlite3Static */

async function importSqlite3InitModule() {
  const importedSqlean = await import('./vendor/sqlean.js');
  return importedSqlean.default.default;
}

// ===== @TheDatabase =====

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

// ===== @DataSerde =====

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

// ===== #ServiceWorkerMechanism =====

if (self.ServiceWorkerGlobalScope && self instanceof ServiceWorkerGlobalScope) {
  const serviceWorker = self;

  serviceWorker.addEventListener('install', async function (event) {
    assertInstanceOf(ExtendableEvent, event);
    await serviceWorker.skipWaiting();
  });

  serviceWorker.addEventListener('activate', async function (event) {
    assertInstanceOf(ExtendableEvent, event);
    await serviceWorker.clients.claim();
  });

  serviceWorker.addEventListener('message', async function (event) {
    assertInstanceOf(ExtendableMessageEvent, event);
    console.debug('ServiceWorkerGlobalScope', 'message', event);
  });

  serviceWorker.addEventListener('messageerror', async function (event) {
    console.debug('ServiceWorkerGlobalScope', 'messageerror', event);
  });

  serviceWorker.addEventListener('sync', async function (event) {
    console.debug('ServiceWorkerGlobalScope', 'sync', event);
  });
}

else if (self.Window && self instanceof Window) {
  window.addEventListener('load', async function () {
    if (!('serviceWorker' in navigator)) {
      alert('This app reqire service workers');
      throw new Error('Service workers are required for this app');
    }

    navigator.serviceWorker.addEventListener('message', async function (event) {
      console.debug('ServiceWorkerContainer', 'message', event);
    });

    navigator.serviceWorker.addEventListener('messageerror', async function (event) {
      console.debug('ServiceWorkerContainer', 'messageerror', event);
    });

    navigator.serviceWorker.addEventListener('controllerchange', async function (event) {
      console.debug('ServiceWorkerContainer', 'controllerchange', event);
      // window.location.reload();
    });

    const { active: serviceWorker } = await navigator.serviceWorker.register('./webapp.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'all',
    });

    console.debug('Window', 'load', serviceWorker);

    serviceWorker.addEventListener('statechange', async function (event) {
      console.debug('ServiceWorker', 'statechange', event);
    });

    serviceWorker.postMessage({ method: 'version' });

  });
}

else {
  throw new Error('Unknown context');
}

// ===== #GeneralAssertionFunctions =====

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
