// @ts-check

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */

import { onMounted, provide, reactive } from 'vue';

import { apiV1FileList } from '@/service-worker/api/handlers/api-v1-file-list.js';

/** @typedef {import('@/service-worker/api/api.js').JsonApiHandlerType<apiV1FileList>} ApiV1FileList */

/**
 * @typedef {object} PosFileContext
 * @property {ApiV1FileList} posFiles
 * @property {() => Promise<void>} refreshPosFiles
 */

const posFileKey = /** @type {InjectionKey<PosFileContext>} */ (Symbol());

export function providePosFile() {
  const context = reactive(/** @type {PosFileContext} */ ({
    posFiles: [],
    async refreshPosFiles() {
    },
  }));

  provide(posFileKey, context);

  onMounted(function () {
  });
}
