---
applyTo: 'src/**/*.js,src/**/*.vue'
---

# Project Structure
- `sqlite`: Contains main SQLite schemas. All business logic must be implemented in these schemas.
- `src`: Contains frontend code for the SQLite application.
- `tests`: Contains e2e tests for the frontend.

# Frontend Specifications
- The frontend is built as a frontend for the SQLite application. All UI business logic implementation should follow SQLite schemas. However, ultimately, all business logic must follow accounting principles carefully, so when a fault occurs, don't just follow SQLite schemas blindly—fix it instead.
- The frontend is purposely designed to be a single-user offline-first desktop application. This implies that any direct SQLite query is acceptable.
- Frontend e2e tests must use accessibility indicators to identify elements. This ensures that the application is properly accessible.

# Code Guidelines
- Prefer `function` declarations over arrow functions.

# UI/UX Guidelines
- Use adaptive design, not responsive design. Each view component (located in `src/views/*.vue`) should be designed for a specific screen size. (Note: for now we only target small desktop screens at 1368x768)
- UI implementation must adhere to accessibility best practices.
- CSS styles are implemented in 3 ways:
  - **Global**: Located in `src/global.css`, which applies default global styles.
  - **Vue SFC Style Module**: Its main use is to style the layout of a specific component.
  - **Inline Style**: Used to style very specific attributes of an element, such as the `width` of a table column.
- Avoid using classes or any custom identifiers for styling; instead, use hierarchical semantic HTML structure and accessibility attributes to style elements.

# Navigation Guidelines
- The application implements **hierarchical navigation** instead of **chronological navigation**. This ensures that the back button behavior follows the logical structure of the application rather than the history of user clicks.
- Navigation must follow a predictable hierarchy where each view has a defined parent-child relationship. For example:
  - Dashboard (Home) → Account List → Account Item → Account Edit
  - Dashboard (Home) → Currency List → Currency Item → Currency Edit
- **Back Button Behavior**:
  - Always navigates to the hierarchical parent, regardless of how the user arrived at the current view
  - Works consistently whether accessed through normal navigation flow or direct URL access
  - Utilize `replace` vs `push` properly to ensure hierarchical integrity
- **User Experience Goals**:
  - Users should always know where the back button will take them
  - Navigation behavior should be intuitive and predictable
  - Direct URL access should maintain the same hierarchical back navigation

# Tools
- Use `npx eslint --fix $FILEPATH` to quickly fix linting issues such as import ordering.
- Use `npm run test:frontend` to run the entire e2e test suite.
