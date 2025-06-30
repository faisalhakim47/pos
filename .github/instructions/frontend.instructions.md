---
applyTo: 'src/**/*.vue'
---

# Project Structure
- `sqlite/`: The main SQLite schemas where all business logic implemented
- `src/`: The frontend code for the SQLite application
- `tests/`: The end-to-end tests for the frontend

# Frontend Specifications
- The frontend serves as the user interface for the SQLite application. All UI business logic must follow the SQLite schemas while adhering to proper accounting principles. When conflicts arise, prioritize correct accounting practices over blind schema compliance.
- The application is designed as a single-user, offline-first desktop application, allowing direct SQLite queries without restrictions.

# End-to-End Test Guidelines
- Use accessibility attributes for element selection instead of `page.locator`
- When tests require accessibility attributes that are missing from templates, add the necessary attributes to the template rather than modifying the test
- Use `data-testid` attributes only as a last resort when accessibility attributes are insufficient

# Code Guidelines
- Prefer `function` declarations over arrow functions including as callbacks.

# UI/UX Guidelines

## Design Approach
- Implement **adaptive design** targeting specific screen sizes rather than responsive design
- Each view component in `src/views/*.vue` should be optimized for a particular screen size (currently targeting 1368x768 desktop screens)

## Accessibility Requirements
- All UI implementations must follow accessibility best practices
- Maintain uniform structure conventions across all views
- Include all necessary accessibility attributes to ensure proper screen reader support
- Avoid redundant `role` attributes on semantic elements (e.g., do not use `role="button"` on `<button>` elements)

## CSS Architecture
The application follows a three-tier styling approach:
- **Global Styles**: Defined in `src/main.css` for application-wide defaults and basic element styling
- **Vue SFC Styles**: Used for component-specific layout and structure
- **Inline Styles**: Applied for element-specific attributes (e.g., table column widths, dynamic positioning)

## Styling Guidelines
- Prioritize semantic HTML structure and accessibility attributes over custom classes for styling
- Avoid using custom classes or `data-*` identifiers for styling purposes
- Use custom classes only when absolutely necessary (e.g., complex animations or specific layout requirements that cannot be achieved through semantic HTML)
- Utilize nested CSS selectors to reflect the logical hierarchy of HTML structure
- Ensure all basic elements (buttons, inputs, selects, tables, etc.) use Global Styles for consistent appearance throughout the application

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
