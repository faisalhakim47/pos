---
applyTo: 'src/**/*.js,src/**/*.vue'
---

# Project Structure
- `sqlite`: Contains main sqlite schemas. All business logic must be implemented in these schemas.
- `src`: Contains frontend code for sqlite application.
- `tests`: Contains e2e test for frontend.

# Frontend Specifications
- Frontend is built as frontend of sqlite application. All ui business logic implementation should follow sqlite schemas. But, in the end of the day, all business logic must follow accounting principles carefully, so when a fault occurs, dont just follow sqlite schemas blindly, fix it instead.
- Frontend is purposely designed to be a single-user offline-first desktop application. It implies that any direct sqlite query is fine.
- Frontend e2e test must use accessibility indicators to identify elements. This is to ensure that the application is properly accessible.

# Code Guidelines
- Prefer `function` over arrow functions

# UI/UX Guidelines
- Use adaptive design, not responsive design. Each view component (located in `src/views/*.vue`) should be designed for a specific screen size. (note: for now we only target small desktop screen 1368x768)
- UI implementation must adhere to the accessibility best practices.
- CSS Styles are implemented in 3 ways:
  - **Global**: Located in `src/global.css`, it applies default global styles.
  - **VUE SFC Style Module**: it main use is to style layout of specific component.
  - **Inline Style**: it is used to style very specific attribute of an element, such as `width` of table column.
- Avoid using class or any custom identifier for styling, instead use hierarchical semantic HTML structure and accessibility attributes to style the element.

# Navigation Guidelines
- The application implements **hierarchical navigation** instead of **chronological navigation**. This ensures that the back button behavior follows the logical structure of the application rather than the history of user clicks.
- Navigation must follow a predictable hierarchy where each view has a defined parent-child relationship. For example:
  - Dashboard (Home) → Account List → Account Item → Account Edit
  - Dashboard (Home) → Currency List → Currency Item → Currency Edit
- **Back Button Behavior**:
  - Always navigates to the hierarchical, regardless of how the user arrived at the current view
  - Works consistently whether accessed through normal navigation flow or direct URL access
  - Utilise `replace` vs `push` properly to ensure hierarchical integrity
- **User Experience Goals**:
  - Users should always know where the back button will take them
  - Navigation behavior should be intuitive and predictable
  - Direct URL access should maintain the same hierarchical back navigation

# Tools
- Use `npx eslint --fix $FILEPATH` to quickly fix linting issues such as import ordering.
- Use `npm run test:frontend` to run entire e2e test suite.
