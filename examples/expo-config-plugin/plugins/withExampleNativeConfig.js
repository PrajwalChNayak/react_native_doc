/**
 * A config plugin that changes native configuration on both platforms.
 *
 * Under Continuous Native Generation you never hand-edit ios/ or android/ —
 * `npx expo prebuild` regenerates them, and in SDK 57 it clears them first. A
 * plugin is how a native change survives that: it runs during prebuild and
 * re-applies the change every time.
 *
 * This plugin:
 *   - Android: adds a <meta-data> entry to <application> in AndroidManifest.xml
 *   - iOS: adds a key to Info.plist
 *
 * It uses the typed `withAndroidManifest` / `withInfoPlist` mods, not
 * `withDangerousMod`. Typed mods run in a defined order, operate on a parsed
 * model and compose with other plugins; a dangerous mod is raw filesystem access
 * with none of that, and is a last resort.
 *
 * The generated output is committed under `generated-output/` so you can see
 * the diff this plugin produces without running prebuild yourself.
 */
const {AndroidConfig, createRunOncePlugin, withAndroidManifest, withInfoPlist} = require('expo/config-plugins');

const pkg = {name: 'with-example-native-config', version: '1.0.0'};

/** @param {import('expo/config-plugins').ExpoConfig} config */
function withExampleNativeConfig(config, props = {}) {
  const featureFlag = String(props.featureFlag ?? 'enabled');

  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      'com.example.EXAMPLE_FEATURE_FLAG',
      featureFlag,
    );
    return modConfig;
  });

  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.ExampleFeatureFlag = featureFlag;
    return modConfig;
  });

  return config;
}

// createRunOncePlugin stops the plugin applying twice if it is listed twice,
// which would otherwise duplicate the manifest entry.
module.exports = createRunOncePlugin(withExampleNativeConfig, pkg.name, pkg.version);
