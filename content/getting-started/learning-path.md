---
title: Learning Path
description: A suggested reading order through this handbook, what to read now, what to read when you hit the problem, and what you can honestly skip.
status: current
toolchain: cli
---

This handbook has fifteen sections and well over a hundred pages. Read in order, front to back,
that is a poor use of your time: half of it is reference material that only makes sense once you
have the problem it solves.

What follows is a reading order that tracks how a real project grows, with an honest note on each
stage about what you can skip. The only genuinely non-optional part is the first stage.

## Why it exists / when to use it — and when NOT to

Use this page when you are new to the handbook, or when you are picking React Native back up after
a couple of years and need to know which of your habits are now wrong. Skip it if you arrived
looking for one specific API — go straight to [Component Reference](../reference/component-reference.md)
or [API Reference](../reference/api-reference.md).

## Stage 1 — Before you write any code

**Read all of this. It is about two hours and it saves considerably more.**

1. [Introduction](introduction.md) — the version timeline, and why most tutorials you will find are
   now wrong. The single most important page here.
2. [Environment Setup](environment-setup.md) — Node, JDK 17, the Android SDK, Xcode. Most
   "React Native does not build" reports are a toolchain problem, not a code problem.
3. [Creating a Project](creating-a-project.md) — `init`, version pinning, and the first run.
4. [Project Structure](project-structure.md) — which of the generated files you will actually edit.
5. [Running on Android](running-on-android.md) and [Running on iOS](running-on-ios.md) — read the
   one for the platform you are on now, and the other when you get to it.
6. [Dev Menu and Fast Refresh](dev-menu-and-fast-refresh.md) — the development loop.
7. [Your First Screen](your-first-screen.md) — a real screen, typed, on current APIs.

**What you can skip:** nothing. If you are tempted to skip Environment Setup because you "already
have Node", check the version anyway — the floor is 22.13.0, not 22.11.0.

## Stage 2 — Understand what is running

**Read [The New Architecture](../core-concepts/new-architecture.md) now. Read the rest when you
hit something that does not make sense.**

React Native 0.82 removed the Bridge, and 0.87 turned on the Strict TypeScript API. If your mental
model is from before that, it will mislead you in specific, expensive ways — mostly by making you
optimise things that are no longer slow.

| Page | Read it when |
| --- | --- |
| [The New Architecture](../core-concepts/new-architecture.md) | Now. It is the map for everything else |
| [How RN Differs from the Web](../core-concepts/differences-from-web.md) | Now, if you come from web development |
| [Platform Differences](../core-concepts/platform-differences.md) | As soon as you write anything platform-specific |
| [JS Thread vs UI Thread](../core-concepts/threading-model.md) | When something janks, or before touching animation |
| [The Render Pipeline](../core-concepts/render-pipeline.md) | When a re-render costs more than it should |
| [Fabric](../core-concepts/fabric.md) | When you need to reason about mounting and measurement |
| [Hermes](../core-concepts/hermes.md) | When you care about startup time or bundle size |
| [JSI](../core-concepts/jsi.md), [TurboModules](../core-concepts/turbomodules.md), [Codegen](../core-concepts/codegen.md) | Before you write native code, and not before |

**What you can skip for now:** JSI, TurboModules and Codegen are genuinely deferrable. They matter
enormously when you write a native module and not at all until then.

## Stage 3 — Build screens

This is where most of your time goes, and it is best read on demand rather than in a block.

Start with the components you will use on every screen:
[View](../components/view.md), [Text](../components/text.md), [Image](../components/image.md),
[ScrollView](../components/scrollview.md), [TextInput](../components/textinput.md),
[Pressable and Touchables](../components/pressable-and-touchables.md) and
[FlatList](../components/flatlist.md).

Then the styling pages, in this order, because each builds on the last:

1. [StyleSheet](../styling/stylesheet.md) — how styles are declared and merged.
2. [Flexbox in React Native](../styling/flexbox.md) — the four defaults that differ from the web.
   If you read one styling page, read this one.
3. [Units and Density](../styling/units-and-density.md) — why there is no `px`.
4. [Safe Areas](../components/safe-areas.md) — notches, status bars and gesture bars.

**What you can skip until you need it:** [SectionList](../components/sectionlist.md),
[Modal](../components/modal.md), [Switch](../components/switch.md),
[RefreshControl](../components/refreshcontrol.md),
[Virtualization and FlashList](../components/virtualization-and-flashlist.md),
[Responsive and Tablet Layouts](../styling/responsive-layouts.md),
[Fonts and Icons](../styling/fonts-and-icons.md) and
[Styling Approaches Compared](../styling/styling-approaches.md). All are good pages; none is a
prerequisite for anything.

## Stage 4 — More than one screen

The moment you have a second screen, you need navigation, and it is worth doing properly the first
time because retrofitting typed routes is tedious.

1. [React Navigation Fundamentals](../navigation/fundamentals.md)
2. [Native Stack](../navigation/native-stack.md)
3. [Params and Typed Routes](../navigation/params-and-typed-routes.md) — do this early
4. [Tabs](../navigation/tabs.md) or [Drawer](../navigation/drawer.md), whichever your design needs

**What you can skip:** [Nesting Navigators](../navigation/nesting.md) until your structure demands
it, [State Persistence](../navigation/state-persistence.md) until someone asks for it, and
[Deep Linking and Universal Links](../navigation/deep-linking.md) until you actually ship links —
though read [Deep Link Validation](../security/deep-link-validation.md) at the same time, because
an unvalidated deep-link handler is a real vulnerability rather than a theoretical one.

## Stage 5 — Make it do something

State and data, roughly in dependency order:

1. [Hooks in a Native Context](../state-and-data/hooks-in-react-native.md) — what changes about
   hooks when there is no DOM.
2. [Context](../state-and-data/context.md) — before reaching for a library.
3. [Data Fetching and Caching](../state-and-data/data-fetching.md) — the part most apps are
   actually made of.
4. [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) and
   [Secure Storage](../state-and-data/secure-storage.md) — read both together. The difference
   between them is a security decision, not a performance one.
5. [App Lifecycle and AppState](../state-and-data/app-lifecycle.md) — mobile apps get backgrounded,
   and web habits do not cover it.

Platform APIs are pure reference — read the page for the capability you are adding.
[Permissions](../platform-apis/permissions.md) is the exception: read it before your first
permission-gated feature, not during.

**What you can skip:** [Zustand and Redux Toolkit](../state-and-data/zustand-and-redux.md) until
Context is genuinely hurting, [Offline-First](../state-and-data/offline-first.md) until offline is a
requirement, and [Background Refresh](../state-and-data/background-refresh.md) until you have a
reason.

## Stage 6 — Motion and gestures

Read this section when an interaction needs to follow a finger or survive a busy JS thread. It is
not a prerequisite for shipping.

1. [Animated vs Reanimated](../animation/animated-vs-reanimated.md) — decide before you install
   anything. Core `Animated` is enough more often than people assume.
2. [The UI Thread and Worklets](../animation/worklets.md) — the mental model everything else in the
   section depends on.
3. [Shared and Derived Values](../animation/shared-values.md)
4. [Gesture Handler](../animation/gesture-handler.md)
5. [Animation Performance Rules](../animation/animation-performance.md) and
   [Respecting Reduce Motion](../animation/reduce-motion.md) — short, and both are the kind of thing
   that is much cheaper to get right up front.

**What you can skip:** [Layout Animations](../animation/layout-animations.md) and
[Scroll-Driven Animation](../animation/scroll-driven-animation.md) until you want those specific
effects.

## Stage 7 — Native code

**Only read this section when you have established that you need it.** Most apps never do, and the
cost of a native module is ongoing — it is code you maintain across two platforms and every
upgrade.

Start with [When You Need Native Code](../native-modules/when-you-need-native-code.md), which is
mostly about talking yourself out of it. If you still need it, the section covers the whole path:
spec file, Codegen, Kotlin, Swift, registration and autolinking.

## Stage 8 — Make it good

Performance work is worth doing in a strict order, and the order starts with measuring.

1. [Measuring Before Optimising](../performance/measuring-first.md) — read this first or you will
   spend a week on the wrong thing.
2. [Common Performance Mistakes](../performance/common-performance-mistakes.md) — the cheap wins.
3. Then whichever of [Render Performance and Memoization](../performance/render-performance.md),
   [List Performance in Depth](../performance/list-performance.md),
   [Image Performance and Caching](../performance/image-performance.md),
   [Startup Time](../performance/startup-time.md) or [Memory](../performance/memory.md) your
   measurements point at.

Debugging and testing alongside:
[React Native DevTools](../debugging/react-native-devtools.md),
[Jest Setup](../testing/jest-setup.md) and
[React Native Testing Library](../testing/testing-library.md) are the three that pay for themselves
immediately. [End-to-End with Detox or Maestro](../testing/end-to-end.md) pays for itself much
later, and only if someone maintains it.

## Stage 9 — Ship it

[Release Checklist](../build-and-release/release-checklist.md) is the index for this stage. Read it
first and work backwards to the pages it references —
[Android Signing](../build-and-release/android-signing.md),
[iOS Signing and Provisioning](../build-and-release/ios-signing.md),
[Build Variants and Flavours](../build-and-release/build-variants.md) and
[Environment Configuration](../build-and-release/environment-configuration.md) are the ones you
cannot avoid.

Security is not a stage you reach; it is a set of decisions spread across the others. The two
pages to read **before** you ship anything, not after, are
[Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) and
[Threat Model](../security/threat-model.md). Both are short and both change how you design.

## Stage 10 — Keep it alive

React Native ships a minor release roughly every few months and supports a narrow window of
versions. Falling four releases behind turns a routine upgrade into a project.

[The Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md) is the process.
[0.87 Breaking Changes](../migration/breaking-changes-087.md) is the list of what moved most
recently, and worth reading even on a new project so you recognise stale advice when you see it.

## If you are coming back after a few years

Read these five, in this order, and skip everything else until you have:

1. [Introduction](introduction.md) — what changed and when.
2. [0.87 Breaking Changes](../migration/breaking-changes-087.md) — the removal list.
3. [The New Architecture](../core-concepts/new-architecture.md) — the Bridge is gone.
4. [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — why your deep
   imports are now type errors.
5. [New Architecture Migration](../migration/new-architecture-migration.md) — the legacy patterns
   and their replacements.

That is the whole "why does none of my old code work" story.

## Common mistakes

- **Reading the Native Modules section early because it looks important.** It is the section most
  people never need. Wrong: writing a TurboModule to read a preference. Right: check whether a
  maintained library already does it, and read
  [When You Need Native Code](../native-modules/when-you-need-native-code.md) first.
- **Skipping Environment Setup because Node is installed.** The floor is 22.13.0 and JDK 17 is
  required. A version that is merely "recent" produces build errors that look like framework bugs.
- **Optimising before measuring.** Wrong: memoising every component because a list feels slow.
  Right: [Measuring Before Optimising](../performance/measuring-first.md), then fix what the
  measurement names.
- **Treating security as a final checklist item.** Storage choice, deep-link handling and what goes
  in the bundle are all design decisions. Retrofitting them means changing shipped behaviour.
- **Following a tutorial that predates 0.82 alongside this handbook.** They contradict each other
  on the architecture, on `NativeModules`, and on deep imports. Pick one, and prefer the one whose
  version numbers you can verify.
- **Reading the whole Reference section up front.** It is lookup material. It will not stick, and
  none of it is a prerequisite.

## Related topics

- [Introduction](introduction.md) — scope, the version timeline, and what changed in 0.87.
- [Environment Setup](environment-setup.md) — stage one, and the one you cannot skip.
- [Your First Screen](your-first-screen.md) — the end of stage one.
- [The New Architecture](../core-concepts/new-architecture.md) — the map for stage two.
- [Cheat Sheet](../reference/cheat-sheet.md) — the short version of a lot of this.
- [Troubleshooting](../reference/troubleshooting.md) — when a stage goes wrong.
