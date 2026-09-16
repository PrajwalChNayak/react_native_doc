module.exports = {
  preset: '@react-native/jest-preset',
  // React Navigation ships ES modules (`main` points at `lib/module`), so it
  // has to go through Babel. The default React Native pattern only transforms
  // `react-native` and `@react-native*`.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-safe-area-context)/)',
  ],
};
