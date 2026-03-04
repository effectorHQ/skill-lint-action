/**
 * Source entry point for skill-lint-action.
 *
 * The dist/index.js is the bundled version of this file (with parser.js and rules.js inlined).
 * If you're modifying the action, edit the src/ files and then run `npm run build`
 * to update dist/index.js.
 *
 * For the self-contained dist version (no build step), see dist/index.js directly.
 */
export { run } from './runner.js';
