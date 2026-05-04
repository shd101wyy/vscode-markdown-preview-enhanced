/**
 * Re-export crossnote's findFragmentTargetLine.  The implementation
 * lived here briefly while we shaped it; it's now a public helper in
 * the crossnote library so any host can use the same parsing rules.
 *
 * Keeping this thin shim file means existing imports inside MPE keep
 * working with no churn, and the unit test
 * (test/find-fragment-target-line.test.js) can still load the helper
 * via the local path.
 */
export { findFragmentTargetLine } from 'crossnote';
