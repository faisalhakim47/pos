---
applyTo: 'src/**/*.js,src/**/*.vue'
---

# Frontend Specifications
- The frontend is purposly designed to be a single-user offline-first desktop application. It implies that any direct sqlite query is fine.

# Code Guidelines
- Prefer `function` over arrow functions

# UI/UX Guidelines
- Use adaptive design, not responsive design. Each view component (located in `src/views/*.vue`) should be designed for a specific screen size. (note: for now we only target small desktop screen 1368x768)
- UI implementation must adhere to the accessibility best practices.
- CSS Styles are implemented in 3 ways:
  - **Global**: Located in `src/global.css`, it applies default global styles. The style will adapt based on semantic and sturcture of the HTML. For example, instead of using `.alert` for styling alert, use semantic accessibility `[role="alert"]` selector to apply the style.
  - **VUE SFC Style Module**: it main use is to style layout of specific component.
  - **Inline Style**: it is used to style very specific attribute of an element, such as `width` of table column.
