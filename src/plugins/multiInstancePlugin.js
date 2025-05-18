// @ts-check

/** @template T @typedef {import('vue').Plugin<T>} Plugin */

const MULTI_INSTANCE_BROADCAST_CHANNEL = 'MULTI_INSTANCE_BROADCAST_CHANNEL';

export const multiInstancePlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    const broadcast = new BroadcastChannel(MULTI_INSTANCE_BROADCAST_CHANNEL);

  },
});
