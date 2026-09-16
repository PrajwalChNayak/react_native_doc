/**
 * Navigation manifest — the single source of truth.
 *
 * Drives: the top-bar section menus, breadcrumbs, prev/next links, the search
 * index and the orphan-page check. A page that is not listed here does not
 * exist as far as the site is concerned, and `check.mjs` will flag its file.
 *
 * Shape:
 *   { id, title, pages: [{ slug, title }] }
 * The content file for a page is `content/<section.id>/<page.slug>.md`
 * and it is emitted to `docs/<section.id>/<page.slug>.html`.
 *
 * `groups` splits a long section into labelled clusters inside its dropdown.
 * Order here is the reading order used for prev/next.
 */

export const site = {
  // The site now covers two toolchains, so the brand no longer names one of
  // them. The per-page badge and the family dividers in the top bar carry the
  // toolchain and version, which differ between the two halves.
  title: 'React Native Handbook',
  shortTitle: 'RN Handbook',
  description:
    'A practical handbook for React Native — the Community CLI on 0.87 and Expo SDK 57 on 0.86, documented separately and verified against both.',
  // Version facts surfaced in the UI and in the footer.
  rnVersion: '0.87.1',
  cliVersion: '20.2.0',
  reactVersion: '19.2.3',
  nodeMin: '22.13.0',
  expoSdk: '57',
  expoVersion: '57.0.22',
  expoRnVersion: '0.86.3',
  expoRouterVersion: '57.0.21',
  easCliVersion: '24.5.0',
  verifiedOn: '2026-09-12',
  repo: 'https://github.com/PrajwalChNayak/react-native-doc',
};

/**
 * Top-level navigation.
 *
 * The site documents two toolchains, so every menu declares a `family`. The top
 * bar renders a divider between the families and labels them, because the one
 * thing a reader must never be unsure of is which toolchain — and which React
 * Native version — the page in front of them assumes.
 *
 *   cli  -> React Native Community CLI, React Native 0.87.1
 *   expo -> Expo SDK 57, React Native 0.86.3
 */
export const families = [
  { id: 'cli', title: 'React Native CLI', short: 'CLI', rn: '0.87.1' },
  { id: 'expo', title: 'Expo SDK 57', short: 'Expo', rn: '0.86.3' },
];

export const menus = [
  { id: 'start', title: 'Start', family: 'cli' },
  { id: 'ui', title: 'UI', family: 'cli' },
  { id: 'app', title: 'App', family: 'cli' },
  { id: 'native', title: 'Native', family: 'cli' },
  { id: 'quality', title: 'Quality', family: 'cli' },
  { id: 'ship', title: 'Ship', family: 'cli' },
  { id: 'expo', title: 'Expo', family: 'expo' },
  { id: 'expo-ship', title: 'Expo Ship', family: 'expo' },
];

export const sections = [
  {
    id: 'getting-started',
    menu: 'start',
    title: 'Getting Started',
    description: 'Install the toolchain, create a project with the Community CLI, and run it.',
    pages: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'environment-setup', title: 'Environment Setup' },
      { slug: 'creating-a-project', title: 'Creating a Project' },
      { slug: 'project-structure', title: 'Project Structure' },
      { slug: 'running-on-android', title: 'Running on Android' },
      { slug: 'running-on-ios', title: 'Running on iOS' },
      { slug: 'dev-menu-and-fast-refresh', title: 'Dev Menu and Fast Refresh' },
      { slug: 'your-first-screen', title: 'Your First Screen' },
      { slug: 'learning-path', title: 'Learning Path' },
    ],
  },
  {
    id: 'core-concepts',
    menu: 'start',
    title: 'Core Concepts',
    description: 'How React Native actually works in 0.87: Fabric, TurboModules, JSI, Hermes.',
    pages: [
      { slug: 'new-architecture', title: 'The New Architecture' },
      { slug: 'fabric', title: 'Fabric' },
      { slug: 'turbomodules', title: 'TurboModules' },
      { slug: 'jsi', title: 'JSI' },
      { slug: 'codegen', title: 'Codegen' },
      { slug: 'hermes', title: 'Hermes' },
      { slug: 'render-pipeline', title: 'The Render Pipeline' },
      { slug: 'differences-from-web', title: 'How RN Differs from the Web' },
      { slug: 'threading-model', title: 'JS Thread vs UI Thread' },
      { slug: 'platform-differences', title: 'Platform Differences' },
    ],
  },
  {
    id: 'components',
    menu: 'ui',
    title: 'Components',
    description: 'The core component set, what each is for, and where each stops scaling.',
    pages: [
      { slug: 'view', title: 'View' },
      { slug: 'text', title: 'Text' },
      { slug: 'image', title: 'Image' },
      { slug: 'scrollview', title: 'ScrollView' },
      { slug: 'textinput', title: 'TextInput' },
      { slug: 'pressable-and-touchables', title: 'Pressable and Touchables' },
      { slug: 'flatlist', title: 'FlatList' },
      { slug: 'sectionlist', title: 'SectionList' },
      { slug: 'virtualization-and-flashlist', title: 'Virtualization and FlashList' },
      { slug: 'modal', title: 'Modal' },
      { slug: 'switch', title: 'Switch' },
      { slug: 'activityindicator', title: 'ActivityIndicator' },
      { slug: 'refreshcontrol', title: 'RefreshControl' },
      { slug: 'keyboardavoidingview', title: 'KeyboardAvoidingView' },
      { slug: 'safe-areas', title: 'Safe Areas' },
    ],
  },
  {
    id: 'styling',
    menu: 'ui',
    title: 'Styling and Layout',
    description: 'StyleSheet, flexbox as React Native defines it, density, themes and fonts.',
    pages: [
      { slug: 'stylesheet', title: 'StyleSheet' },
      { slug: 'flexbox', title: 'Flexbox in React Native' },
      { slug: 'units-and-density', title: 'Units and Density' },
      { slug: 'dimensions', title: 'Dimensions and useWindowDimensions' },
      { slug: 'responsive-layouts', title: 'Responsive and Tablet Layouts' },
      { slug: 'platform-specific-styles', title: 'Platform-Specific Styles' },
      { slug: 'shadows-and-elevation', title: 'Shadows and Elevation' },
      { slug: 'dark-mode', title: 'Dark Mode' },
      { slug: 'fonts-and-icons', title: 'Fonts and Icons' },
      { slug: 'styling-approaches', title: 'Styling Approaches Compared' },
    ],
  },
  {
    id: 'navigation',
    menu: 'app',
    title: 'Navigation',
    description: 'React Navigation 7 — native stack, tabs, drawer, typed routes, deep links.',
    pages: [
      { slug: 'fundamentals', title: 'React Navigation Fundamentals' },
      { slug: 'native-stack', title: 'Native Stack' },
      { slug: 'tabs', title: 'Tabs' },
      { slug: 'drawer', title: 'Drawer' },
      { slug: 'nesting', title: 'Nesting Navigators' },
      { slug: 'params-and-typed-routes', title: 'Params and Typed Routes' },
      { slug: 'deep-linking', title: 'Deep Linking and Universal Links' },
      { slug: 'headers', title: 'Headers' },
      { slug: 'modals', title: 'Modals' },
      { slug: 'state-persistence', title: 'State Persistence' },
      { slug: 'navigation-performance', title: 'Navigation Performance' },
    ],
  },
  {
    id: 'state-and-data',
    menu: 'app',
    title: 'State and Data',
    description: 'Hooks in a native context, stores, data fetching, storage and app lifecycle.',
    pages: [
      { slug: 'hooks-in-react-native', title: 'Hooks in a Native Context' },
      { slug: 'context', title: 'Context' },
      { slug: 'zustand-and-redux', title: 'Zustand and Redux Toolkit' },
      { slug: 'data-fetching', title: 'Data Fetching and Caching' },
      { slug: 'offline-first', title: 'Offline-First' },
      { slug: 'asyncstorage-vs-mmkv', title: 'AsyncStorage vs MMKV' },
      { slug: 'secure-storage', title: 'Secure Storage' },
      { slug: 'app-lifecycle', title: 'App Lifecycle and AppState' },
      { slug: 'background-refresh', title: 'Background Refresh' },
    ],
  },
  {
    id: 'platform-apis',
    menu: 'app',
    title: 'Platform APIs',
    description: 'Permissions, camera, location, notifications, files and accessibility.',
    pages: [
      { slug: 'permissions', title: 'Permissions' },
      { slug: 'camera', title: 'Camera' },
      { slug: 'geolocation', title: 'Geolocation' },
      { slug: 'notifications', title: 'Push and Local Notifications' },
      { slug: 'file-system', title: 'File System' },
      { slug: 'clipboard-and-share', title: 'Clipboard and Share' },
      { slug: 'linking', title: 'Linking' },
      { slug: 'biometrics', title: 'Biometrics' },
      { slug: 'haptics', title: 'Haptics' },
      { slug: 'background-tasks', title: 'Background Tasks' },
      { slug: 'accessibility', title: 'Accessibility APIs' },
    ],
  },
  {
    id: 'native-modules',
    menu: 'native',
    title: 'Native Modules',
    description: 'TurboModules and Fabric components end to end, in Kotlin and Swift.',
    pages: [
      { slug: 'when-you-need-native-code', title: 'When You Need Native Code' },
      { slug: 'turbomodules-end-to-end', title: 'TurboModules End to End' },
      { slug: 'fabric-native-components', title: 'Fabric Native Components' },
      { slug: 'codegen-specs', title: 'Codegen and Spec Files' },
      { slug: 'writing-a-module-in-kotlin', title: 'Writing a Module in Kotlin' },
      { slug: 'writing-a-module-in-swift', title: 'Writing a Module in Swift' },
      { slug: 'autolinking', title: 'Autolinking and react-native.config.js' },
      { slug: 'platform-folders', title: 'Platform Folders' },
      { slug: 'publishing-a-native-library', title: 'Publishing a Native Library' },
      { slug: 'debugging-native-code', title: 'Debugging Native Code' },
    ],
  },
  {
    id: 'animation',
    menu: 'ui',
    title: 'Animation and Gestures',
    description: 'Animated vs Reanimated 4, worklets, gesture handler and motion performance.',
    pages: [
      { slug: 'animated-vs-reanimated', title: 'Animated vs Reanimated' },
      { slug: 'worklets', title: 'The UI Thread and Worklets' },
      { slug: 'shared-values', title: 'Shared and Derived Values' },
      { slug: 'layout-animations', title: 'Layout Animations' },
      { slug: 'gesture-handler', title: 'Gesture Handler' },
      { slug: 'scroll-driven-animation', title: 'Scroll-Driven Animation' },
      { slug: 'animation-performance', title: 'Animation Performance Rules' },
      { slug: 'reduce-motion', title: 'Respecting Reduce Motion' },
    ],
  },
  {
    id: 'performance',
    menu: 'quality',
    title: 'Performance',
    description: 'Measure first. Then fix rendering, lists, images, startup, bundle and memory.',
    pages: [
      { slug: 'hermes-and-bytecode', title: 'Hermes and Bytecode' },
      { slug: 'measuring-first', title: 'Measuring Before Optimising' },
      { slug: 'render-performance', title: 'Render Performance and Memoization' },
      { slug: 'list-performance', title: 'List Performance in Depth' },
      { slug: 'image-performance', title: 'Image Performance and Caching' },
      { slug: 'startup-time', title: 'Startup Time' },
      { slug: 'bundle-size', title: 'Bundle Size' },
      { slug: 'memory', title: 'Memory' },
      { slug: 'profiling', title: 'The Profiler and React Native DevTools' },
      { slug: 'common-performance-mistakes', title: 'Common Performance Mistakes' },
    ],
  },
  {
    id: 'debugging',
    menu: 'quality',
    title: 'Debugging and DevTools',
    description: 'React Native DevTools, logs, source maps, crashes and release stack traces.',
    pages: [
      { slug: 'react-native-devtools', title: 'React Native DevTools' },
      { slug: 'console-and-logs', title: 'Console and Logs' },
      { slug: 'source-maps', title: 'Source Maps' },
      { slug: 'network-inspection', title: 'Network Inspection' },
      { slug: 'error-boundaries', title: 'Error Boundaries' },
      { slug: 'crash-reporting', title: 'Crash Reporting' },
      { slug: 'native-crash-logs', title: 'Native Crash Logs' },
      { slug: 'release-stack-traces', title: 'Reading a Release Stack Trace' },
    ],
  },
  {
    id: 'testing',
    menu: 'quality',
    title: 'Testing',
    description: 'Jest, React Native Testing Library, native mocks, Detox, Maestro and CI.',
    pages: [
      { slug: 'jest-setup', title: 'Jest Setup' },
      { slug: 'testing-library', title: 'React Native Testing Library' },
      { slug: 'mocking-native-modules', title: 'Mocking Native Modules' },
      { slug: 'snapshot-testing', title: 'Snapshot Testing' },
      { slug: 'end-to-end', title: 'End-to-End with Detox or Maestro' },
      { slug: 'ci-for-mobile', title: 'CI for Mobile' },
    ],
  },
  {
    id: 'build-and-release',
    menu: 'ship',
    title: 'Build and Release',
    description: 'Variants, signing, store submission, Fastlane, CI and the release checklist.',
    pages: [
      { slug: 'build-variants', title: 'Build Variants and Flavours' },
      { slug: 'environment-configuration', title: 'Environment Configuration' },
      { slug: 'icons-and-splash-screens', title: 'App Icons and Splash Screens' },
      { slug: 'android-signing', title: 'Android Signing' },
      { slug: 'play-store-submission', title: 'AAB and Play Store Submission' },
      { slug: 'proguard-and-r8', title: 'ProGuard and R8' },
      { slug: 'ios-signing', title: 'iOS Signing and Provisioning' },
      { slug: 'app-store-submission', title: 'TestFlight and App Store Submission' },
      { slug: 'versioning', title: 'Versioning Strategy' },
      { slug: 'fastlane', title: 'Fastlane' },
      { slug: 'ci-pipelines', title: 'CI Pipelines' },
      { slug: 'over-the-air-updates', title: 'Over-the-Air Updates' },
      { slug: 'release-checklist', title: 'Release Checklist' },
    ],
  },
  {
    id: 'security',
    menu: 'ship',
    title: 'Security',
    description: 'Threat, exploit, fix and verification for every layer of a shipped app.',
    pages: [
      { slug: 'threat-model', title: 'Threat Model' },
      { slug: 'secrets-in-the-bundle', title: 'Why Secrets in JS Are Readable' },
      { slug: 'secure-storage-keychain-keystore', title: 'Keychain and Keystore' },
      { slug: 'certificate-pinning', title: 'Certificate Pinning' },
      { slug: 'network-security-config', title: 'Network Security Config and ATS' },
      { slug: 'deep-link-validation', title: 'Deep Link Validation' },
      { slug: 'webview-hardening', title: 'WebView Hardening' },
      { slug: 'obfuscation', title: 'Obfuscation and Its Limits' },
      { slug: 'root-and-jailbreak-detection', title: 'Root and Jailbreak Detection' },
      { slug: 'permissions-hygiene', title: 'Permissions Hygiene' },
      { slug: 'dependency-auditing', title: 'Dependency Auditing' },
      { slug: 'safe-logging', title: 'Safe Logging in Release Builds' },
    ],
  },
  {
    id: 'migration',
    menu: 'ship',
    title: 'Upgrading and Migration',
    description: 'Upgrade Helper, 0.87 breaking changes, Strict TypeScript API, CocoaPods to SPM.',
    pages: [
      { slug: 'upgrade-helper-workflow', title: 'The Upgrade Helper Workflow' },
      { slug: 'breaking-changes-087', title: '0.87 Breaking Changes' },
      { slug: 'strict-typescript-api', title: 'Migrating to the Strict TypeScript API' },
      { slug: 'new-architecture-migration', title: 'New Architecture Migration' },
      { slug: 'cocoapods-to-spm', title: 'CocoaPods to Swift Package Manager' },
      { slug: 'native-dependency-compatibility', title: 'Native Dependency Compatibility' },
    ],
  },
  {
    id: 'reference',
    menu: 'quality',
    title: 'Reference',
    description: 'Component and API reference, CLI commands, cheat sheet and troubleshooting.',
    pages: [
      { slug: 'component-reference', title: 'Component Reference' },
      { slug: 'api-reference', title: 'API Reference' },
      { slug: 'cli-reference', title: 'CLI Command Reference' },
      { slug: 'cheat-sheet', title: 'Cheat Sheet' },
      { slug: 'troubleshooting', title: 'Troubleshooting' },
    ],
  },
  /* ------------------------------------------------------------------ Expo
     Everything below targets Expo SDK 57, which ships React Native 0.86.3 —
     NOT the 0.87.1 the CLI sections above document. Section ids are prefixed
     `expo-` and check.mjs keys its toolchain rules off that prefix. */
  {
    id: 'expo-getting-started',
    menu: 'expo',
    title: 'Expo: Getting Started',
    description: 'What Expo actually is, how to create a project with create-expo-app, and how to run it.',
    pages: [
      { slug: 'introduction', title: 'What Expo Actually Is' },
      { slug: 'choosing-expo-or-cli', title: 'Choosing Expo or the Bare CLI' },
      { slug: 'prerequisites', title: 'Prerequisites' },
      { slug: 'creating-a-project', title: 'Creating a Project' },
      { slug: 'project-structure', title: 'Project Structure' },
      { slug: 'running-on-a-simulator', title: 'Running on a Simulator' },
      { slug: 'running-on-a-device', title: 'Running on a Device' },
      { slug: 'running-on-web', title: 'Running on the Web' },
      { slug: 'dev-server-and-fast-refresh', title: 'The Dev Server and Fast Refresh' },
    ],
  },
  {
    id: 'expo-core-concepts',
    menu: 'expo',
    title: 'Expo Core Concepts',
    description: 'Expo Go vs development builds, Continuous Native Generation, prebuild and the app config.',
    pages: [
      { slug: 'expo-go-vs-development-builds', title: 'Expo Go vs Development Builds' },
      { slug: 'continuous-native-generation', title: 'Continuous Native Generation' },
      { slug: 'prebuild', title: 'expo prebuild' },
      { slug: 'app-config', title: 'The App Config' },
      { slug: 'expo-install-and-sdk-alignment', title: 'expo install and SDK Alignment' },
      { slug: 'cng-vs-committed-native', title: 'CNG vs Committed Native Directories' },
    ],
  },
  {
    id: 'expo-router',
    menu: 'expo',
    title: 'Expo Router',
    description: 'File-based routing: the app directory, layouts, typed routes, deep links and API routes.',
    pages: [
      { slug: 'fundamentals', title: 'Expo Router Fundamentals' },
      { slug: 'app-directory', title: 'The app Directory' },
      { slug: 'layouts', title: 'Layouts' },
      { slug: 'stack', title: 'Stack' },
      { slug: 'tabs', title: 'Tabs' },
      { slug: 'drawer', title: 'Drawer' },
      { slug: 'dynamic-routes', title: 'Dynamic and Catch-All Routes' },
      { slug: 'groups', title: 'Groups' },
      { slug: 'typed-routes', title: 'Typed Routes' },
      { slug: 'navigation-and-params', title: 'Navigation and Params' },
      { slug: 'modals', title: 'Modals' },
      { slug: 'nested-navigators', title: 'Nested Navigators' },
      { slug: 'deep-linking', title: 'Deep Links and Universal Links' },
      { slug: 'redirects-and-auth', title: 'Redirects and Auth-Gated Routes' },
      { slug: 'api-routes', title: 'API Routes' },
      { slug: 'error-boundaries', title: 'Error Boundaries' },
      { slug: 'migrating-from-react-navigation', title: 'Migrating from React Navigation' },
    ],
  },
  {
    id: 'expo-sdk',
    menu: 'expo',
    title: 'Expo SDK Libraries',
    description: 'Images, fonts, storage, notifications, camera, location, sensors, auth and permissions.',
    pages: [
      { slug: 'images', title: 'Images with expo-image' },
      { slug: 'fonts-and-splash-screens', title: 'Fonts and Splash Screens' },
      { slug: 'file-system-and-storage', title: 'File System and Storage' },
      { slug: 'secure-store', title: 'Secure Store' },
      { slug: 'sqlite', title: 'SQLite' },
      { slug: 'notifications', title: 'Notifications' },
      { slug: 'camera-and-media', title: 'Camera and Media' },
      { slug: 'location', title: 'Location' },
      { slug: 'sensors', title: 'Sensors' },
      { slug: 'audio-and-video', title: 'Audio and Video' },
      { slug: 'authentication', title: 'Authentication and OAuth' },
      { slug: 'biometrics', title: 'Biometrics' },
      { slug: 'linking', title: 'Linking' },
      { slug: 'clipboard-and-haptics', title: 'Clipboard and Haptics' },
      { slug: 'background-tasks', title: 'Background Tasks' },
      { slug: 'permissions-patterns', title: 'Permissions Patterns' },
    ],
  },
  {
    id: 'expo-development-builds',
    menu: 'expo',
    title: 'Development Builds',
    description: 'Why Expo Go stops being enough, and how to build, install and use a dev client.',
    pages: [
      { slug: 'why-you-need-one', title: 'Why You Need a Development Build' },
      { slug: 'creating-locally', title: 'Creating One Locally' },
      { slug: 'creating-with-eas', title: 'Creating One with EAS' },
      { slug: 'installing-on-a-device', title: 'Installing It on a Device' },
      { slug: 'dev-client-features', title: 'expo-dev-client Features' },
      { slug: 'adding-native-dependencies', title: 'Adding Native Dependencies' },
      { slug: 'debugging', title: 'Debugging a Development Build' },
    ],
  },
  {
    id: 'expo-config-plugins',
    menu: 'expo',
    title: 'Config Plugins',
    description: 'Expressing native configuration as code so Continuous Native Generation stays viable.',
    pages: [
      { slug: 'what-they-are', title: 'What a Config Plugin Is' },
      { slug: 'using-community-plugins', title: 'Using Community Plugins' },
      { slug: 'build-properties', title: 'expo-build-properties' },
      { slug: 'writing-your-own', title: 'Writing Your Own Plugin' },
      { slug: 'mods', title: 'Mods and the Dangerous Mods' },
      { slug: 'verifying-output', title: 'Verifying Generated Native Output' },
      { slug: 'testing-and-failures', title: 'Testing Plugins and Common Failures' },
    ],
  },
  {
    id: 'expo-native-code',
    menu: 'expo',
    title: 'Native Code with Expo',
    description: 'The Expo Modules API in Kotlin and Swift, and when to reach for it instead of TurboModules.',
    pages: [
      { slug: 'expo-modules-api', title: 'The Expo Modules API' },
      { slug: 'module-in-kotlin', title: 'Writing a Module in Kotlin' },
      { slug: 'module-in-swift', title: 'Writing a Module in Swift' },
      { slug: 'view-components', title: 'View Components' },
      { slug: 'vs-turbomodules', title: 'Expo Modules vs TurboModules' },
      { slug: 'local-modules', title: 'Local Modules' },
      { slug: 'publishing', title: 'Publishing an Expo Module' },
      { slug: 'community-interop', title: 'Interoperating with Community Libraries' },
    ],
  },
  {
    id: 'expo-eas',
    menu: 'expo-ship',
    title: 'EAS',
    description: 'Build, Submit, Update and Workflows — profiles, credentials, channels and what they cost.',
    pages: [
      { slug: 'overview', title: 'EAS Overview' },
      { slug: 'eas-json', title: 'eas.json and Build Profiles' },
      { slug: 'credentials', title: 'Credentials Management' },
      { slug: 'building', title: 'Building on EAS' },
      { slug: 'local-builds', title: 'Building Locally' },
      { slug: 'internal-distribution', title: 'Internal Distribution' },
      { slug: 'submit', title: 'EAS Submit' },
      { slug: 'update', title: 'EAS Update' },
      { slug: 'runtime-versions', title: 'Runtime Versions, Channels and Branches' },
      { slug: 'rollouts-and-rollbacks', title: 'Rollouts and Rollbacks' },
      { slug: 'ota-limits-and-policy', title: 'What OTA Updates May Not Change' },
      { slug: 'costs-and-limits', title: 'Costs and Limits' },
      { slug: 'workflows', title: 'EAS Workflows' },
    ],
  },
  {
    id: 'expo-performance',
    menu: 'expo-ship',
    title: 'Expo Performance',
    description: 'Startup, bundle size, Hermes, images, lists and assets — measured, not guessed.',
    pages: [
      { slug: 'measuring-first', title: 'Measuring Before Optimising' },
      { slug: 'startup-time', title: 'Startup Time and the Splash Screen' },
      { slug: 'bundle-size', title: 'Bundle Size and Tree Shaking' },
      { slug: 'hermes', title: 'Hermes' },
      { slug: 'image-performance', title: 'Image Performance with expo-image' },
      { slug: 'list-performance', title: 'List Performance' },
      { slug: 'asset-strategy', title: 'Asset Strategy' },
      { slug: 'profiling', title: 'Profiling' },
    ],
  },
  {
    id: 'expo-security',
    menu: 'expo-ship',
    title: 'Expo Security',
    description: 'What ships in the bundle, EXPO_PUBLIC_ leaks, EAS secrets, OAuth, deep links and update signing.',
    pages: [
      { slug: 'what-ships-in-the-bundle', title: 'What Ships Inside the Bundle' },
      { slug: 'expo-public-env-vars', title: 'EXPO_PUBLIC_ Variables and the Leak They Cause' },
      { slug: 'eas-secrets', title: 'EAS Secrets and Build-Time Variables' },
      { slug: 'secure-store-vs-asyncstorage', title: 'expo-secure-store vs AsyncStorage' },
      { slug: 'oauth-and-pkce', title: 'OAuth with expo-auth-session and PKCE' },
      { slug: 'deep-link-validation', title: 'Deep Link Validation' },
      { slug: 'certificate-pinning', title: 'Certificate Pinning Options' },
      { slug: 'update-signing', title: 'EAS Update Signing' },
      { slug: 'permissions-hygiene', title: 'Permissions Hygiene' },
      { slug: 'dependency-auditing', title: 'Dependency Auditing' },
    ],
  },
  {
    id: 'expo-testing',
    menu: 'expo-ship',
    title: 'Expo Testing',
    description: 'jest-expo, React Native Testing Library, mocking Expo modules, end-to-end and CI.',
    pages: [
      { slug: 'jest-expo', title: 'Jest with jest-expo' },
      { slug: 'testing-library', title: 'React Native Testing Library' },
      { slug: 'mocking-expo-modules', title: 'Mocking Expo Modules' },
      { slug: 'end-to-end', title: 'End-to-End on Development Builds' },
      { slug: 'ci', title: 'Testing in CI' },
    ],
  },
  {
    id: 'expo-build-and-release',
    menu: 'expo-ship',
    title: 'Expo Build and Release',
    description: 'Icons, versioning, per-environment profiles, store metadata, rollout and rollback.',
    pages: [
      { slug: 'icons-and-splash-screens', title: 'App Icons and Splash Screens' },
      { slug: 'versioning', title: 'Versioning and Runtime Versions' },
      { slug: 'environments', title: 'Build Profiles per Environment' },
      { slug: 'store-metadata', title: 'App Store Metadata' },
      { slug: 'submission-checklists', title: 'Submission Checklists' },
      { slug: 'staged-rollouts', title: 'Staged Rollouts' },
      { slug: 'monitoring', title: 'Monitoring' },
      { slug: 'rollback-strategy', title: 'Rollback Strategy' },
    ],
  },
  {
    id: 'expo-vs-bare',
    menu: 'expo-ship',
    title: 'Expo vs Bare CLI',
    description: 'An honest comparison, what Expo costs, and how to move in either direction.',
    pages: [
      { slug: 'comparison', title: 'An Honest Comparison' },
      { slug: 'what-expo-costs', title: 'What Expo Gives You and What It Costs' },
      { slug: 'when-bare-is-better', title: 'When the Bare CLI Is Better' },
      { slug: 'ejecting-is-gone', title: 'Ejecting Is Not a Thing Any More' },
      { slug: 'adopting-expo', title: 'Adopting Expo in an Existing Bare App' },
      { slug: 'moving-to-bare', title: 'Moving from Expo to Bare' },
    ],
  },
  {
    id: 'expo-migration',
    menu: 'expo-ship',
    title: 'Expo Migration and Reference',
    description: 'SDK upgrades, the pairing table, removed commands, CLI and app config reference.',
    pages: [
      { slug: 'upgrading-sdk', title: 'Upgrading Between SDK Versions' },
      { slug: 'install-check-and-fix', title: 'expo install --check and --fix' },
      { slug: 'sdk-react-native-pairing', title: 'SDK to React Native Pairing' },
      { slug: 'removed-commands', title: 'expo init and Other Removed Commands' },
      { slug: 'cli-reference', title: 'Expo CLI Reference' },
      { slug: 'app-config-reference', title: 'App Config Reference' },
      { slug: 'cheat-sheet', title: 'Expo Cheat Sheet' },
      { slug: 'troubleshooting', title: 'Expo Troubleshooting' },
    ],
  },
];

/** Flat reading order, used for prev/next. */
export function flatPages() {
  const out = [];
  for (const section of sections) {
    for (const page of section.pages) {
      out.push({
        ...page,
        section,
        sectionId: section.id,
        path: `${section.id}/${page.slug}`,
        source: `content/${section.id}/${page.slug}.md`,
        output: `docs/${section.id}/${page.slug}.html`,
      });
    }
  }
  return out;
}

export function menuSections(menuId) {
  return sections.filter((s) => s.menu === menuId);
}

export default { site, menus, sections, flatPages, menuSections };
