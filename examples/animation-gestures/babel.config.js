module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reanimated 4 does NOT bundle its worklets runtime. `react-native-worklets`
    // is a separate required peer dependency and this is its Babel plugin,
    // which is what turns a function marked 'worklet' into something that can
    // run on the UI thread.
    //
    // `react-native-reanimated/plugin` still resolves — in 4.6.0 that file is a
    // four-line re-export of this one — but the worklets name is canonical.
    //
    // It must be LAST: it needs to see the output of every other transform.
    'react-native-worklets/plugin',
  ],
};
