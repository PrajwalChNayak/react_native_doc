// Jest transforms TypeScript with Babel rather than ts-jest on purpose.
//
// Babel only strips types, so the test run never has to reconcile the strict
// ESM settings that @react-native/typescript-config sets ("module": "esnext",
// "moduleResolution": "bundler", "customConditions": ["react-native"]) with the
// CommonJS module system Jest runs under. Type correctness is checked
// separately and authoritatively by `npm run typecheck` (tsc --noEmit) against
// the real react-native 0.87 Strict API types.
module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    '@babel/preset-typescript',
  ],
};
