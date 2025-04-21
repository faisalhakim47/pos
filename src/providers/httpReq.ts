import { inject, reactive, watchEffect, type InjectionKey, type Ref } from 'vue';
import { provide } from 'vue';

type HttpReqContext = {
  baseUrl: string;
};

const httpReqKey = Symbol() as InjectionKey<HttpReqContext>;

export function provideHttpReq(context: HttpReqContext) {
  provide(httpReqKey, context);
}

type HttpReqOptions = Ref<RequestInit & { url: string }>;

export function useHttpReq(options: HttpReqOptions) {
  const httpReqContext = inject(httpReqKey);

  if (!httpReqContext) {
    throw new Error('useHttpReq must be used within a provideHttpReq');
  }

  const state = reactive({
    isReady: false,
    response: undefined as Response | undefined,
    error: undefined as unknown,
  });

  watchEffect(async function () {
    state.isReady = false;
    state.response = undefined;
    state.error = undefined;
    const url = options.value.url.startsWith('http')
      ? new URL(options.value.url)
      : new URL(options.value.url, httpReqContext.baseUrl);
    fetch(url, options.value)
      .then(function (response) {
        state.response = response;
      })
      .catch(function (error) {
        state.error = error as Error;
      })
      .finally(function () {
        state.isReady = true;
      });
  });

  return state;
}
