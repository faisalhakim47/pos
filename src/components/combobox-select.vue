<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { assertPropertyMaybeString, assertPropertyString } from '@/src/tools/assertion.js';

/** @template T @typedef {import('vue').Ref<T>} Ref */
/** @template T @typedef {import('vue').ComputedRef<T>} ComputedRef */
/** @template T @typedef {T extends ComputedRef<infer U> ? U : never} UnwrapComputed */
/** @template T @typedef {T extends Array<infer U> ? U : never} ArrayElement */

/**
 * Fully accessible combobox component implementing ARIA 1.2 specification.
 * Supports both keyboard navigation and mouse interaction with filtering.
 * Options can be grouped for better organization in large datasets.
 */

const props = defineProps({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  ariaLabelledby: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'change']);

// Refs
const inputRef = ref(/** @type {HTMLInputElement} */ (null));
const listboxRef = ref(/** @type {HTMLUListElement} */ (null));
const buttonRef = ref(/** @type {HTMLButtonElement} */ (null));

// State
const isExpanded = ref(false);
const searchQuery = ref('');
const activeDescendantId = ref('');
const focusedOptionIndex = ref(-1);

// Computed
const listboxId = computed(function () {
  return `${props.id}-listbox`;
});
const buttonId = computed(function () {
  return `${props.id}-button`;
});

const options = computed(function () {
  return props.options.map(function (option, index) {
    assertPropertyString(option, 'label');
    assertPropertyString(option, 'value');
    assertPropertyMaybeString(option, 'group');
    return option;
  });
});

/** @typedef {ArrayElement<UnwrapComputed<options>>} OptionType */

// Filter and group options based on search query
const filteredOptions = computed(function () {
  if (!searchQuery.value.trim()) {
    return options.value;
  }
  // Case-insensitive search across both value and label fields
  const query = searchQuery.value.toLowerCase();
  return options.value.filter(function (option) {
    return false
      || option.label.toLowerCase().includes(query)
      || option.value.toLowerCase().includes(query);
  });
});

// Group filtered options
const groupedOptions = computed(function () {
  /** @type {Map<string, Array<OptionType & { originalIndex: number }>>} */
  const groups = new Map();

  // Preserve original index for stable IDs during filtering
  filteredOptions.value.forEach(function (option, index) {
    const groupName = option.group || '';
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push({
      ...option,
      originalIndex: index,
    });
  });

  return Array
    .from(groups.entries())
    .map(function ([groupName, options]) {
      return {
        name: groupName,
        options,
      };
    });
});

// Flatten grouped options for navigation
const flatOptions = computed(function () {
  const flat = [];
  groupedOptions.value.forEach(function (group) {
    flat.push(...group.options);
  });
  return flat;
});

// Find the selected option based on model value
const selectedOption = computed(function () {
  return options.value.find(function (option) {
    return option.value === props.modelValue;
  });
});

// Input value - always shows the actual value for semantic correctness
const inputValue = computed(function () {
  return props.modelValue;
});

// Visual display value - shows label when not actively typing/searching
const visualDisplayValue = computed(function () {
  // Show label if we have a selected option and not actively searching
  if (selectedOption.value && !isExpanded.value) {
    return selectedOption.value.label;
  }
  // When searching, show the search query
  if (isExpanded.value) {
    return searchQuery.value;
  }
  // Default to model value
  return props.modelValue;
});

// Watch for model value changes to reset search state when selection changes externally
watch(function () {
  return props.modelValue;
}, function () {
  // Reset search query when model value changes externally
  searchQuery.value = '';
  closeListbox();
});

// Initialize component state
onMounted(function () {
  // Start with empty search query
  searchQuery.value = '';
});

// Functions
function openListbox() {
  isExpanded.value = true;
  if (flatOptions.value.length > 0) {
    focusedOptionIndex.value = 0;
    updateActiveDescendant();
  }
}

function closeListbox() {
  isExpanded.value = false;
  focusedOptionIndex.value = -1;
  activeDescendantId.value = '';
}

function updateActiveDescendant() {
  // Required for screen readers to announce the currently focused option
  if (focusedOptionIndex.value >= 0 && focusedOptionIndex.value < flatOptions.value.length) {
    const option = flatOptions.value[focusedOptionIndex.value];
    activeDescendantId.value = `${props.id}-option-${option.originalIndex}`;
  }
  else {
    activeDescendantId.value = '';
  }
}

function selectOption(option) {
  const opt = /** @type {{value: string, label: string, group?: string}} */ (option);
  emit('update:modelValue', opt.value);
  emit('change', opt);
  closeListbox();
  inputRef.value?.focus();
}

function selectFocusedOption() {
  if (focusedOptionIndex.value >= 0 && focusedOptionIndex.value < flatOptions.value.length) {
    const option = flatOptions.value[focusedOptionIndex.value];
    selectOption(option);
  }
}

/**
 * @param {'down'|'up'|'first'|'last'} direction
 */
function moveFocus(direction) {
  if (flatOptions.value.length === 0) return;

  // Circular navigation: wrap around at boundaries
  if (direction === 'down') {
    focusedOptionIndex.value = (focusedOptionIndex.value + 1) % flatOptions.value.length;
  }
  else if (direction === 'up') {
    focusedOptionIndex.value = focusedOptionIndex.value <= 0
      ? flatOptions.value.length - 1
      : focusedOptionIndex.value - 1;
  }
  else if (direction === 'first') {
    focusedOptionIndex.value = 0;
  }
  else if (direction === 'last') {
    focusedOptionIndex.value = flatOptions.value.length - 1;
  }

  updateActiveDescendant();
  scrollToFocusedOption();
}

async function scrollToFocusedOption() {
  if (!listboxRef.value || activeDescendantId.value === '') return;
  await nextTick();
  const focusedElement = listboxRef.value.querySelector(`#${activeDescendantId.value}`);
  if (focusedElement) {
    focusedElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }
}

// Event handlers
function handleInputKeydown(event) {
  // ARIA combobox keyboard navigation according to ARIA 1.2 spec
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (isExpanded.value) {
        moveFocus('down');
      }
      else {
        openListbox();
      }
      break;

    case 'ArrowUp':
      event.preventDefault();
      if (isExpanded.value) {
        moveFocus('up');
      }
      else {
        openListbox();
        // When opening with ArrowUp, start at the last option
        if (flatOptions.value.length > 0) {
          focusedOptionIndex.value = flatOptions.value.length - 1;
          updateActiveDescendant();
        }
      }
      break;

    case 'Home':
      if (isExpanded.value) {
        event.preventDefault();
        moveFocus('first');
      }
      break;

    case 'End':
      if (isExpanded.value) {
        event.preventDefault();
        moveFocus('last');
      }
      break;

    case 'Enter':
      if (isExpanded.value && focusedOptionIndex.value >= 0) {
        event.preventDefault();
        selectFocusedOption();
      }
      break;

    case 'Escape':
      if (isExpanded.value) {
        event.preventDefault();
        closeListbox();
        // Return focus to input after closing
        inputRef.value?.focus();
      }
      // Note: When listbox is closed, Escape does not clear the value
      // as this is a select-only combobox (values must come from options)
      break;

    case 'Tab':
      closeListbox();
      break;

    default:
      // Handle Alt+Arrow combinations
      if (event.altKey) {
        if (event.key === 'ArrowDown') {
          // Alt+Down: Open popup without moving focus (if available but not displayed)
          event.preventDefault();
          if (!isExpanded.value && flatOptions.value.length > 0) {
            openListbox();
          }
        }
        else if (event.key === 'ArrowUp') {
          // Alt+Up: Close popup and return focus to combobox (if displayed)
          event.preventDefault();
          if (isExpanded.value) {
            closeListbox();
            inputRef.value?.focus();
          }
        }
      }
      break;
  }
}

function handleInputFocus() {
  // When input gains focus and we have a selected option, switch to search mode
  if (selectedOption.value && !isExpanded.value) {
    const opt = /** @type {{value: string, label: string, group?: string}} */ (selectedOption.value);
    searchQuery.value = opt.label;
    openListbox();
  }
}

function handleInputInput(event) {
  const target = /** @type {HTMLInputElement} */ (event.target);
  const value = target.value;
  searchQuery.value = value;

  // Check if the input value matches any option's label exactly
  const matchingOption = options.value.find(function (option) {
    const opt = /** @type {{value: string, label: string, group?: string}} */ (option);
    return opt.label === value;
  });

  if (matchingOption) {
    // If input matches a label exactly, emit the corresponding value
    const opt = /** @type {{value: string, label: string, group?: string}} */ (matchingOption);
    emit('update:modelValue', opt.value);
  }
  else {
    // For partial matches or free text, emit empty value to indicate no selection
    emit('update:modelValue', '');
  }

  // Auto-open listbox when user starts typing
  if (!isExpanded.value && value.length > 0) {
    openListbox();
  }

  // Reset focused option when search changes
  if (flatOptions.value.length > 0) {
    focusedOptionIndex.value = 0;
    updateActiveDescendant();
  }
}

function handleButtonClick() {
  if (isExpanded.value) {
    closeListbox();
  }
  else {
    openListbox();
  }
  inputRef.value?.focus();
}

function handleOptionClick(option) {
  const opt = /** @type {{value: string, label: string, group?: string}} */ (option);
  selectOption(opt);
}

function handleOptionMouseEnter(index) {
  // Find the flat index that corresponds to this original index
  const flatIndex = flatOptions.value.findIndex(function (option) {
    return option.originalIndex === index;
  });
  if (flatIndex >= 0) {
    focusedOptionIndex.value = flatIndex;
    updateActiveDescendant();
  }
}

function handleClickOutside(event) {
  const target = /** @type {Node} */ (event.target);
  // Close listbox when clicking outside the entire combobox component
  const comboboxElement = inputRef.value?.closest('[role="combobox"]')?.parentElement;
  if (comboboxElement && !comboboxElement.contains(target)) {
    closeListbox();
  }
}

// Lifecycle
onMounted(function () {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(function () {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="combobox-container">
    <div>
      <!-- Hidden input containing the actual semantic value -->
      <input
        type="hidden"
        :name="name"
        :value="inputValue"
      />
      <!-- Visible input for user interaction showing labels/search -->
      <input
        :id="id"
        ref="inputRef"
        type="text"
        role="combobox"
        autocomplete="off"
        :value="visualDisplayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :aria-expanded="isExpanded"
        :aria-controls="isExpanded ? listboxId : undefined"
        :aria-labelledby="ariaLabelledby || undefined"
        aria-autocomplete="list"
        :aria-activedescendant="activeDescendantId"
        @input="handleInputInput"
        @keydown="handleInputKeydown"
        @focus="handleInputFocus"
      />
      <button
        :id="buttonId"
        ref="buttonRef"
        type="button"
        tabindex="-1"
        :disabled="disabled"
        aria-label="dropdown"
        :aria-expanded="isExpanded"
        :aria-controls="isExpanded ? listboxId : undefined"
        @click="handleButtonClick"
      >
        <svg
          width="18"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          <polygon
            stroke-width="0"
            fill-opacity="0.75"
            fill="currentcolor"
            points="3,6 15,6 9,14"
          />
        </svg>
      </button>
    </div>

    <ul
      v-if="isExpanded"
      :id="listboxId"
      ref="listboxRef"
      role="listbox"
    >
      <!-- Render grouped options with headers -->
      <template v-for="(group, groupIndex) in groupedOptions" :key="groupIndex">
        <li
          v-if="group.name"
          role="presentation"
        >
          <strong>{{ group.name }}</strong>
        </li>
        <li
          v-for="(option, optionIndex) in group.options"
          :key="`${groupIndex}-${optionIndex}`"
          :id="`${id}-option-${option.originalIndex}`"
          role="option"
          :aria-selected="flatOptions.findIndex(o => o.originalIndex === option.originalIndex) === focusedOptionIndex"
          @click="handleOptionClick(option)"
          @mouseenter="handleOptionMouseEnter(option.originalIndex)"
        >
          {{ option.label }}
        </li>
      </template>

      <!-- Empty state message -->
      <li v-if="filteredOptions.length === 0" role="presentation">
        <em>No results found</em>
      </li>
    </ul>
  </div>
</template>

<style scoped>
div.combobox-container {
  position: relative;
  display: flex;
  flex-direction: column;

  /* Input group container */
  &> div {
    position: relative;
    display: flex;
  }

  input[role="combobox"] {
    display: block;
    height: 30px;
    width: 100%;
    border-radius: 4px;
    border: 1px solid var(--app-input-border-color);
    box-sizing: border-box;
    outline: none;
    background-color: var(--app-main-bg-color);
    color: var(--app-main-text-color);

    &:focus,
    &:focus-visible {
      border-color: var(--app-input-focus-border-color);
      box-shadow: 0 0 0 2px var(--app-input-focus-border-color);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  button {
    position: absolute;
    right: 0;
    top: 0;
    height: 30px;
    width: 30px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0 4px 4px 0;

    &:hover {
      background-color: var(--app-btnflat-hover-bg-color);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    svg {
      forced-color-adjust: auto;
    }
  }

  ul[role="listbox"] {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background-color: var(--app-main-bg-color);
    border: 1px solid var(--app-input-border-color);
    border-radius: 4px;
    z-index: 1000;
    margin: 0;
    padding: 0;
    list-style: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    /* Group headers */
    li[role="presentation"] {
      padding: 8px 12px;
      cursor: default;

      strong {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--app-light-text-color, #666);
        display: block;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--app-input-border-color);
      }

      em {
        color: var(--app-light-text-color, #666);
        font-style: italic;
      }
    }

    li[role="option"] {
      padding: 8px 12px;
      cursor: pointer;
      border: 2px solid transparent;

      &:hover {
        background-color: var(--app-btnflat-hover-bg-color);
      }

      /* Visual indicator for keyboard-focused option */
      &[aria-selected="true"] {
        background-color: var(--app-btnflat-active-bg-color);
        border-top: 2px solid var(--app-input-focus-border-color);
        border-bottom: 2px solid var(--app-input-focus-border-color);
        padding-top: 6px;
        padding-bottom: 6px;
      }
    }
  }

  @media (prefers-color-scheme: dark) {
    ul[role="listbox"] {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
  }
}
</style>
