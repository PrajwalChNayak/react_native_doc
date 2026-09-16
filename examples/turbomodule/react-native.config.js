/**
 * Autolinking metadata for the React Native Community CLI.
 *
 * A library does not strictly need this file: the CLI discovers a package that
 * has an `android/` directory containing a `build.gradle` and an `ios/`
 * directory containing a `.podspec`, and links it. This file exists to state
 * those locations explicitly, so a future directory rename is a one-line
 * change rather than a silent "module not found" at runtime.
 *
 * `dependency.platforms.<platform>` is the shape the CLI reads for a LIBRARY.
 * The `project` and `dependencies` keys are for APPS and must not appear here.
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        // Must match `android { namespace }` in android/build.gradle and the
        // package declaration of the Kotlin sources.
        packageImportPath: 'import com.devicemetadata.DeviceMetadataPackage;',
        packageInstance: 'new DeviceMetadataPackage()',
      },
      ios: {
        podspecPath: `${__dirname}/RNDeviceMetadata.podspec`,
      },
    },
  },
};
