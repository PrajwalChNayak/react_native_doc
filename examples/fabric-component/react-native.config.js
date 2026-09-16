/**
 * Autolinking metadata. Identical in shape to the TurboModule example — the
 * CLI does not distinguish a component library from a module library here.
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        packageImportPath: 'import com.gradientview.GradientViewPackage;',
        packageInstance: 'new GradientViewPackage()',
      },
      ios: {
        podspecPath: `${__dirname}/RNGradientView.podspec`,
      },
    },
  },
};
