# React.js Frontend Development Guidelines

## === foundation rules ===

# Foundational Context

This application uses React.js for its frontend.

- Always inspect the installed React version before using React APIs.
- Follow the existing project architecture, coding conventions, and component patterns.
- Do not assume the application uses TypeScript, JavaScript, Vite, Next.js, Redux, or any particular library.
- Before relying on a package's API, confirm its installed version.
- For JavaScript dependencies, inspect `package.json` and the lockfile.
- Use APIs compatible with the installed versions of React and other dependencies.
- Prefer official React APIs and established project conventions over unnecessary third-party libraries.

## Conventions

- Follow existing code conventions and naming patterns.
- Inspect sibling components before creating or editing components.
- Reuse existing components, hooks, utilities, and styles whenever possible.
- Use descriptive names for components, variables, functions, and props.
- Use PascalCase for React component names.
- Use camelCase for variables, functions, hooks, and properties.
- Custom React hooks must start with `use`.
- Avoid unnecessary abstractions and overly complicated implementations.
- Keep changes focused and avoid unrelated refactoring.
- Do not duplicate existing functionality.

## Project Structure

- Follow the existing directory structure.
- Do not introduce new root-level directories without approval.
- Organize files according to the application's existing architectural conventions.
- Keep related components, hooks, utilities, and styles logically organized.
- Do not move or rename existing files unless necessary.
- Avoid creating excessively large components or files.

## Dependencies

- Do not install, remove, or upgrade dependencies without approval.
- Prefer existing dependencies and native React capabilities.
- Avoid introducing libraries for functionality that can be implemented simply with existing tools.
- Do not modify package versions or lockfiles unnecessarily.
- Use the existing package manager based on the project's lockfile.

## Documentation Files

- Only create documentation files when explicitly requested.
- Use JSDoc for complex or reusable functions when documentation improves maintainability.
- Keep comments focused on explaining non-obvious implementation decisions.

---

## === react rules ===

# React Development

## Components

- Prefer functional components and React hooks.
- Use reusable components when they provide meaningful value.
- Keep components focused on a single responsibility.
- Avoid unnecessarily large components.
- Separate complex business logic from UI presentation when appropriate.
- Avoid deeply nested JSX.
- Use composition instead of creating components with excessive conditional behavior.
- Define components outside other components unless there is a specific reason to do otherwise.
- Avoid unnecessary prop drilling; use existing context or state-management solutions when appropriate.
- Define clear and consistent component interfaces.
- Avoid unnecessary default exports or named exports that conflict with existing project conventions.

## JSX

- Use semantic HTML elements whenever possible.
- Keep JSX readable and maintain consistent formatting.
- Avoid complex calculations and business logic directly inside JSX.
- Extract complex conditional rendering into descriptive variables or helper functions.
- Always provide stable and unique keys when rendering lists.
- Avoid using array indexes as keys when items can be reordered, inserted, or deleted.
- Do not use direct DOM manipulation when React state and rendering can handle the behavior.
- Avoid unnecessary fragments and wrapper elements.

## React Hooks

- Follow the Rules of Hooks.
- Never call hooks conditionally, inside loops, or inside nested functions.
- Keep hook dependencies accurate.
- Avoid suppressing React hook dependency warnings without a valid reason.
- Use `useEffect` only for synchronizing with external systems or managing side effects.
- Do not use `useEffect` for values that can be calculated during rendering.
- Clean up subscriptions, event listeners, timers, and other external resources when necessary.
- Use `useMemo` and `useCallback` only when they provide a measurable or meaningful benefit.
- Avoid premature optimization.
- Use custom hooks to reuse complex stateful logic when appropriate.

## State Management

- Use local component state for component-specific behavior.
- Lift state to the nearest common parent when multiple components need to share it.
- Use React Context for appropriate shared application state.
- Follow the existing state-management solution if the project uses Redux, Zustand, MobX, or another library.
- Avoid introducing a global state solution for simple local state.
- Do not duplicate the same state across multiple components unnecessarily.
- Avoid storing values in state that can be derived from existing state or props.
- Keep state updates immutable.
- Use functional state updates when the new state depends on the previous state.

## Props

- Pass only the properties a component actually needs.
- Use descriptive prop names.
- Avoid excessive prop drilling.
- Provide sensible defaults where appropriate.
- Avoid modifying props directly.
- Keep component interfaces predictable.
- Avoid passing large unrelated objects when individual properties are sufficient.

---

## === javascript / typescript rules ===

# JavaScript

- Use modern JavaScript features supported by the project's runtime and build configuration.
- Prefer `const` by default and use `let` when reassignment is required.
- Avoid `var`.
- Use arrow functions where appropriate and follow existing conventions.
- Use template literals for dynamic strings.
- Prefer destructuring when it improves readability.
- Use optional chaining and nullish coalescing when appropriate.
- Avoid unnecessary type conversions.
- Handle `null`, `undefined`, and empty values explicitly when necessary.
- Avoid deeply nested conditional expressions.
- Use descriptive boolean variable names such as `isLoading`, `hasPermission`, and `canSubmit`.
- Avoid unnecessary global variables.
- Avoid modifying built-in JavaScript prototypes.

## TypeScript (when applicable)

- Follow the existing TypeScript configuration.
- Define explicit types for component props and important data structures.
- Prefer interfaces or type aliases according to existing conventions.
- Avoid using `any`; prefer specific types or `unknown` when appropriate.
- Avoid unnecessary type assertions.
- Type event handlers correctly.
- Define reusable types for shared application data.
- Use discriminated unions for complex state when appropriate.
- Keep types close to the functionality they describe unless they are shared across the application.
- Do not introduce TypeScript into a JavaScript-only project without approval.

---

## === styling rules ===

# CSS and Styling

- Follow the existing styling solution and conventions.
- Reuse existing design tokens, CSS variables, and theme definitions.
- Do not introduce another styling framework without approval.
- Avoid unnecessary inline styles.
- Avoid global CSS rules that can unintentionally affect unrelated components.
- Prefer component-scoped styling when supported by the project.
- Use consistent spacing, typography, colors, and border-radius values.
- Avoid hardcoding repeated design values when existing variables or tokens are available.
- Ensure responsive layouts work across mobile, tablet, and desktop.
- Avoid unnecessary CSS overrides and excessive specificity.
- Avoid using `!important` unless absolutely necessary.
- Keep animations subtle and avoid unnecessary transitions.
- Respect `prefers-reduced-motion`.
- Support existing light and dark themes when applicable.
- Ensure interactive elements have visible hover, focus, active, and disabled states.

## UI Consistency

- Reuse existing buttons, inputs, modals, dropdowns, tables, and other shared UI components.
- Follow the application's established design system.
- Do not create duplicate UI components with slightly different styling.
- Keep spacing and alignment consistent.
- Ensure loading, empty, error, and success states are handled.
- Avoid unnecessary visual changes outside the requested scope.

---

## === api and data handling rules ===

# API Integration

- Follow the existing API client and request conventions.
- Reuse existing API services, clients, and utilities.
- Do not introduce a new HTTP client without approval.
- Keep API communication separate from presentation components when appropriate.
- Handle loading, success, empty, and error states.
- Handle network failures and unexpected API responses.
- Avoid duplicate API requests.
- Cancel or ignore outdated requests when appropriate.
- Avoid unnecessary requests during component rendering.
- Follow existing authentication and session-management mechanisms.
- Never hardcode API credentials, access tokens, or secrets in frontend code.
- Never assume that frontend validation replaces backend validation.
- Follow existing API response structures instead of introducing new formats.

## Data Management

- Avoid unnecessary data transformations.
- Keep data structures consistent.
- Handle missing and optional properties safely.
- Use pagination for large datasets when supported by the API.
- Avoid loading large datasets unnecessarily.
- Avoid repeated calculations over large collections.
- Use existing caching and server-state solutions when available.
- Do not store sensitive information in localStorage or sessionStorage unnecessarily.

## Forms and Validation

- Reuse existing form components and validation utilities.
- Keep form state predictable.
- Validate user input before submission.
- Display clear and meaningful validation messages.
- Prevent duplicate submissions when appropriate.
- Handle submission loading and failure states.
- Preserve user input when a submission fails.
- Use appropriate input types and semantic form elements.
- Ensure keyboard navigation works correctly.
- Follow existing form libraries and validation conventions.

---

## === security rules ===

# Frontend Security

- Never expose secrets, private API keys, or credentials in frontend source code.
- Never trust client-side validation for security decisions.
- Never rely exclusively on frontend authorization or permission checks.
- The backend must enforce authentication and authorization.
- Avoid using `dangerouslySetInnerHTML`.
- If rendering HTML from external or user-provided sources is necessary, sanitize it using an established sanitization solution.
- Never construct unsafe URLs from untrusted input.
- Avoid storing authentication tokens in insecure locations.
- Do not expose sensitive information through console logs.
- Avoid leaking internal API errors or stack traces to users.
- Validate and safely handle data received from external sources.
- Follow the application's existing Content Security Policy and authentication architecture.

---

## === accessibility rules ===

# Accessibility

- Use semantic HTML elements.
- Ensure interactive elements are keyboard accessible.
- Provide accessible labels for form controls.
- Use appropriate ARIA attributes when necessary.
- Do not use ARIA when native HTML semantics already provide the required accessibility.
- Ensure sufficient color contrast.
- Do not rely on color alone to communicate information.
- Provide meaningful alternative text for informative images.
- Ensure modals manage keyboard focus correctly.
- Support visible keyboard focus indicators.
- Use appropriate heading hierarchy.
- Ensure buttons and links have meaningful accessible names.

---

## === performance rules ===

# React Performance

- Avoid unnecessary component re-renders.
- Keep state as local as reasonably possible.
- Avoid unnecessary context updates.
- Use `React.memo` only when it provides a meaningful performance benefit.
- Use lazy loading for large components when appropriate.
- Use code splitting when it improves initial loading performance.
- Optimize images and other large assets.
- Avoid unnecessarily large dependencies.
- Avoid expensive calculations during every render.
- Use virtualization for very large lists when appropriate.
- Avoid unnecessary effects and duplicate API requests.
- Measure performance before introducing complex optimizations.

---

## === testing rules ===

# Frontend Testing

- Add or update tests for behavior and logic changes when meaningful regression coverage is possible.
- Prefer testing user-visible behavior over internal implementation details.
- Follow the existing testing framework and project conventions.
- Inspect installed testing-library and test-runner versions before using their APIs.
- Reuse existing test utilities, fixtures, and mock configurations.
- Test important user interactions.
- Test loading, success, empty, and error states where applicable.
- Test important validation and failure scenarios.
- Avoid testing implementation details that do not affect application behavior.
- Do not introduce a new testing framework without approval.
- Run the narrowest relevant test suite after making changes.
- Fix failing tests caused by the changes before finalizing.

## Test Coverage

- Test components with meaningful conditional behavior.
- Test custom hooks when they contain reusable business logic.
- Test API integration behavior when appropriate.
- Test permission-dependent UI behavior.
- Test important edge cases.
- Avoid unnecessary tests for pure styling and layout-only changes.

---

## === build and verification rules ===

# Frontend Build

- Inspect available scripts in `package.json` before running commands.
- Use the existing package manager.
- Run the project's relevant lint and formatting commands when available.
- Run relevant tests after behavior changes.
- Run the production build when appropriate.
- Resolve compilation errors and warnings introduced by the changes.
- Do not modify build configuration unless necessary.
- Do not modify environment configuration without approval.
- If frontend changes are not reflected in the browser, inspect the development server and build configuration before changing unrelated code.

## Verification

Before finalizing changes:

1. Verify that the requested functionality works.
2. Verify important failure and edge cases.
3. Run relevant tests.
4. Run linting and formatting checks when available.
5. Run a production build when appropriate.
6. Check for unintended changes to existing functionality.
7. Report any verification steps that could not be completed.

---

## === architecture rules ===

# Frontend Architecture

- Follow the existing application architecture.
- Keep components focused and maintainable.
- Separate presentation, business logic, and data access when appropriate.
- Reuse existing hooks and shared utilities.
- Avoid unnecessary abstraction layers.
- Avoid creating generic components that are harder to maintain than the original implementation.
- Use dependency injection or context only when appropriate to the existing architecture.
- Avoid circular dependencies.
- Avoid tightly coupling unrelated components.
- Keep shared application logic in appropriate shared locations.
- Prefer simple solutions over unnecessary design patterns.
- Do not introduce new architectural patterns without a clear benefit.

## Routing

- Follow the existing routing library and conventions.
- Use existing route definitions and navigation utilities.
- Avoid hardcoded URLs when named routes or route helpers are available.
- Handle invalid routes and missing resources appropriately.
- Protect restricted pages using the existing authentication and authorization architecture.
- Preserve existing navigation behavior.

---

## === ai development workflow ===

# AI Coding Workflow

Before making any changes:

1. Inspect the existing project structure.
2. Read `package.json` and identify installed dependency versions.
3. Identify the application's React version and build tooling.
4. Inspect existing implementations related to the requested functionality.
5. Check sibling components and reusable utilities.
6. Identify applicable project-specific rules.
7. Understand the current implementation before proposing a replacement.

Before writing code:

- Identify the files that need to be changed.
- Reuse existing components and utilities whenever possible.
- Follow existing naming and architectural conventions.
- Consider potential impacts on other components.
- Avoid unnecessary dependencies and architectural changes.

While implementing:

- Make the smallest necessary changes.
- Preserve existing functionality.
- Avoid unrelated refactoring.
- Do not create duplicate implementations.
- Do not introduce unnecessary complexity.
- Keep the code readable and maintainable.

Before finalizing:

- Review all modified files.
- Run relevant tests and verification commands.
- Fix issues introduced by the changes.
- Confirm that the implementation follows project conventions.
- Summarize what changed.
- Report tests and build commands executed, including any failures.

# Core Principle

Understand the existing application first. Reuse what already works. Make the smallest maintainable change. Verify that it works without breaking existing functionality.