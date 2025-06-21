<script setup>
import { useCssModule } from 'vue';

const props = defineProps({
  busy: { type: Boolean, default: false },
  busyLabel: { type: String, default: '' },
});

const style = useCssModule();
</script>

<template>
  <span :class="style.container">
    <span
      v-if="props.busy"
      :class="style.loadingIndicator"
      :aria-busy="props.busy"
      :aria-label="props.busyLabel"
      :aria-live="props.busy ? 'polite' : 'off'"
    ></span>
    <span
      :aria-hidden="props.busy"
      :style="{
        opacity: props.busy ? 0 : 1,
        visibility: props.busy ? 'hidden' : 'visible',
      }"
    ><slot></slot></span>
  </span>
</template>

<style module>
.container {
  position: relative;
}
@keyframes loading-indicator-rotation {
  0% {
    transform: rotate(0deg);
    opacity: 1;
  }
  50% {
    transform: rotate(360deg);
    opacity: 0.5;
  }
  100% {
    transform: rotate(720deg);
    opacity: 1;
  }
}
.loadingIndicator {
  position: absolute;
  top: calc(50% - 0.5em);
  left: calc(50% - 0.5em);
  display: flex;
  width: 1em;
  height: 1em;
  box-sizing: border-box;
  border: 3px solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
  animation-name: loading-indicator-rotation;
  animation-duration: 2000ms;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
</style>
