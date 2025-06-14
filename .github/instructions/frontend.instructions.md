---
applyTo: 'src/**/*.js,src/**/*.vue'
---

# Project Structure
- `sqlite/`: Contains main SQLite schemas where all business logic must be implemented
- `src/`: Contains frontend code for the SQLite application
- `tests/`: Contains end-to-end tests for the frontend

# Frontend Specifications
- This frontend serves as the user interface for the SQLite application. All UI business logic must follow the SQLite schemas while adhering to proper accounting principles. When conflicts arise, prioritize correct accounting practices over blind schema compliance.
- The application is designed as a single-user, offline-first desktop application, allowing direct SQLite queries without restrictions.

# End-to-End Test Guidelines
- Use accessibility attributes for element selection instead of `page.locator`
- When tests require accessibility attributes that are missing from templates, add the necessary attributes to the template rather than modifying the test
- Use `data-testid` attributes only as a last resort when accessibility attributes are insufficient

# Code Guidelines
- Prefer `function` declarations over arrow functions including as callbacks.

# UI/UX Guidelines
- Use adaptive design targeting specific screen sizes rather than responsive design. Each view component in `src/views/*.vue` should be optimized for a particular screen size (currently targeting 1368x768 desktop screens)
- All UI implementations must follow accessibility best practices
- CSS styling follows a three-tier approach:
  - **Global Styles**: Defined in `src/global.css` for application-wide defaults
  - **Vue SFC Style**: Used for component-specific layout styling
  - **Inline Styles**: Applied for element-specific attributes (e.g., table column widths)
- Avoid using custom classes or data-* identifier to style elements, use semantic HTML structure and accessibility attributes instead.
- Use custom classes only when absolutely necessary, such as for complex animations or specific layout requirements that cannot be achieved with semantic HTML and accessibility attributes.
- Use nested css selectors to represent the hierarchy of the HTML structure, ensuring that styles are applied in a way that reflects the logical structure of the document.

# Navigation Guidelines
- The application implements **hierarchical navigation** rather than **chronological navigation**, ensuring back button behavior follows the logical application structure instead of user click history
- Navigation must follow a predictable hierarchy with defined parent-child relationships:
  - Dashboard (Home) → Account List → Account Item → Account Edit
  - Dashboard (Home) → Currency List → Currency Item → Currency Edit
- **Back Button Behavior**:
  - Always navigates to the hierarchical parent, regardless of entry method
  - Maintains consistency whether accessed through normal flow or direct URL
  - Requires proper use of `replace` vs `push` to preserve hierarchical integrity
- **User Experience Goals**:
  - Predictable back button destination
  - Intuitive and consistent navigation behavior
  - Hierarchical navigation preserved for direct URL access

# Documentation Guidelines
- Do not write unnecessary documentation.
- Only write documentation when there is implicit knowledge that cannot be easily inferred from the code itself.
- Do not write external documentation. All documentation must be written in code comments.

# Development Tools
- Run `npx eslint --fix $FILEPATH` to automatically fix linting issues (e.g., import ordering)
- Run `npm run test:frontend` to execute the complete end-to-end test suite
