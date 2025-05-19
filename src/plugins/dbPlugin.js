// @ts-check

import { reactive } from 'vue';

import { usePlatform } from '@/plugins/platformPlugin.js';
import { assertPropertyExists, assertPropertyString } from '@/tools/assertion.js';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} PosFileContext
 * @property {string} [uid]
 * @property {number} [closeRequestedTime]
 */

const posFileKey = /** @type {InjectionKey<PosFileContext>} */ (Symbol());

const POS_FILE_BROADCAST_CHANNEL = 'POS_FILE_BROADCAST_CHANNEL';
const POS_FILE_CLOSE_REQUEST_EVENT = 'POS_FILE_CLOSE_REQUEST_EVENT';
const POS_FILE_CLOSE_REQUESTED_EVENT = 'POS_FILE_CLOSE_REQUESTED_EVENT';

export const posFilePlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    const platform = usePlatform();

    const state = reactive(/** @type {PosFileContext} */({
      uid: undefined,
      closeRequestedTime: undefined,
    }));

    app.provide(posFileKey, {
      uid: undefined,
      closeRequestedTime: undefined,
    });

    const broadcast = new BroadcastChannel(POS_FILE_BROADCAST_CHANNEL);

    broadcast.addEventListener('message', function (event) {
      /** @type {unknown} */
      const data = JSON.parse(event.data);
      assertPropertyExists(data, 'type');
      assertPropertyString(data, 'type');
      if (data.type === POS_FILE_CLOSE_REQUEST_EVENT) {
        state.closeRequestedTime = Date.now();
        broadcast.postMessage(JSON.stringify({
          type: POS_FILE_CLOSE_REQUESTED_EVENT,
        }));
      }
    });
  },
});
