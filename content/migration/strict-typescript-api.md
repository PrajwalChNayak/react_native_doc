---
title: Migrating to the Strict TypeScript API
description: How the react-native exports map makes deep imports a type error in 0.87, the ref and prop type renames that came with it, and a migration order for a large codebase.
status: current
toolchain: cli
---

The Strict TypeScript API became the default in React Native 0.87. It was opt-in from 0.80. The
visible symptom is that imports which compiled yesterday are errors today; the cause is a change to
the `exports` map inside the `react-native` package, and understanding that mechanism is what lets
you fix the errors instead of suppressing them.

[Introduction](../getting-started/introduction.md) states the change. This page explains why it
happens, what else moved with it, and the order to fix a large codebase in.

## Why it exists / when to use it — and when NOT to

For most of React Native's history, the public API and the file layout were the same thing. A type
you could reach, you could import — so people imported `react-native/Libraries/StyleSheet/StyleSheet`
directly, and the React Native team could not move a file without breaking somebody.

The Strict API draws a line. What the package root exports is public and supported. Everything
inside `Libraries/` and `src/private/` is an implementation detail, and the type system now says so.
That is what makes internal refactors — including the ones that deleted the legacy architecture —
possible at all.

There is no "when not to". It is the default and there is no supported way to stay on the old
surface past 0.88. The opt-out below exists to unblock a build for a few weeks, not to be adopted.

## How it works — the mechanism

Modern TypeScript resolves types through the `exports` field in a package's `package.json`, the same
way a bundler resolves runtime code. Read straight out of
`node_modules/react-native/package.json` at version 0.87.1:

```json title=node_modules/react-native/package.json (exports, verbatim)
"exports": {
  ".": {
    "react-native-legacy-deep-imports": "./types/index.d.ts",
    "types": "./types_generated/index.d.ts",
    "default": "./index.js"
  },
  "./Libraries/*": {
    "react-native-legacy-deep-imports": "./Libraries/*.d.ts",
    "types": null,
    "default": "./Libraries/*.js"
  },
  "./Libraries/*.js": {
    "types": null,
    "default": "./Libraries/*.js"
  },
  "./scripts/*": "./scripts/*.js",
  "./scripts/*.sh": "./scripts/*.sh",
  "./scripts/*.rb": "./scripts/*.rb",
  "./asset-registry": {
    "types": null,
    "default": "./src/asset-registry.js"
  },
  "./react-private-interface": {
    "types": null,
    "default": "./src/react-private-interface.js"
  },
  "./setup-env": "./src/setup-env.js",
  "./unstable-internals-do-not-use": {
    "react-native-unstable-internals": "./src/unstable-internals-do-not-use.d.ts",
    "types": null,
    "default": "./src/unstable-internals-do-not-use.js"
  },
  "./src/fb_internal/*": "./src/fb_internal/*",
  "./package.json": "./package.json"
}
```

Three lines in that block explain everything:

**`"types": "./types_generated/index.d.ts"` on `.`** — when TypeScript asks `react-native` for
types, it gets the generated, curated surface in `types_generated/`. That file is machine-generated
from React Native's Flow definitions and contains exactly the supported public API.

**`"types": null` on `./Libraries/*`** — when TypeScript asks for the types of
`react-native/Libraries/anything`, the answer is literally "there are none". That is what makes a
deep import a type error. It is not a lint rule, a deprecation warning or a convention. The package
declines to provide types for that path.

**`"react-native-legacy-deep-imports": "./types/index.d.ts"`** — a custom resolution condition. If
your `tsconfig.json` declares that condition, TypeScript takes this branch instead, and the old
hand-written `types/` directory is used, deep imports included. This is the escape hatch, and it is
temporary.

Note also `"./src/private/"` has no entry at all. Those imports are not untyped, they are
unresolvable — removed rather than hidden.

The runtime is unaffected. `"default": "./Libraries/*.js"` still resolves, so a deep import
*executes* and fails only at compile time. That is precisely why the errors appear all at once
during an upgrade rather than gradually.

## Basic example

```diff title=The error the exports map produces
-import StyleSheet from 'react-native/Libraries/StyleSheet/StyleSheet';
-import type {ViewProps} from 'react-native/Libraries/Components/View/ViewPropTypes';
-// error TS2307: Cannot find module 'react-native/Libraries/StyleSheet/StyleSheet'
-//              or its corresponding type declarations.
+import {StyleSheet} from 'react-native';
+import type {ViewProps} from 'react-native';
```

Almost everything you reached for through a deep import is exported from the root. If it is not, it
was never public. Check before you assume:

```bash
grep -n "SomeTypeName" node_modules/react-native/types_generated/index.d.ts
```

## The three migrations, in order of how many files they touch

### 1. Deep imports become root imports

The mechanical case. `tsc --noEmit` lists every one.

```diff
-import Platform from 'react-native/Libraries/Utilities/Platform';
-import Dimensions from 'react-native/Libraries/Utilities/Dimensions';
-import type {TextStyle} from 'react-native/Libraries/StyleSheet/StyleSheetTypes';
+import {Platform, Dimensions} from 'react-native';
+import type {TextStyle} from 'react-native';
```

A handful of former deep-import destinations moved to the root under new names. The ones people hit
most:

| Was reached through | Now |
| --- | --- |
| `Libraries/Core/InitializeCore` | `import 'react-native/setup-env'` — a real subpath export |
| `@react-native/assets-registry/registry` | `import {AssetRegistry} from 'react-native'` |
| `src/private/types/HostInstance` | `import type {HostInstance} from 'react-native'` |
| `src/private/devsupport/devmenu/DevMenu` | `import {DevMenu} from 'react-native'` |
| `src/private/components/virtualview/VirtualView` | `unstable_VirtualView`, `VirtualViewMode` from the root |

### 2. `*Properties` becomes `*Props`

A rename, not a redesign. The old aliases are gone from the strict surface.

```diff
-import type {ViewProperties, TextProperties, ImageProperties} from 'react-native';
+import type {ViewProps, TextProps, ImageProps} from 'react-native';

-type CardProps = ViewProperties & {title: string};
+type CardProps = ViewProps & {title: string};
```

The same applies to `ScrollViewProperties`, `TextInputProperties`, `SwitchProperties`,
`FlatListProperties`, `SectionListProperties`, `ModalProperties`, `ActivityIndicatorProperties`,
`RefreshControlProperties` and every `Touchable*Properties`.

A safe bulk edit, because the type name is unambiguous:

```bash
# Review the diff before committing — the pattern is narrow but not zero-risk.
grep -rln --include=*.ts --include=*.tsx "Properties" src/ \
  | xargs sed -i -E 's/\b(View|Text|Image|ScrollView|TextInput|Switch|FlatList|SectionList|Modal|ActivityIndicator|RefreshControl|Touchable[A-Za-z]*)Properties\b/\1Props/g'
```

### 3. Ref types: `NativeMethods` out, instance types in

This is the one that needs thought rather than search-and-replace.

`NativeMethods` and `NativeMethodsMixin` described "an object with `measure`, `focus`, `blur` and
friends". They are gone from the strict surface. Two replacements exist, and picking the right one
matters.

**Per-component instance types** are the default. Each component exports its own:
`ViewInstance`, `TextInstance`, `TextInputInstance`, `ScrollViewInstance`, `FlatListInstance`,
`SectionListInstance`, `PressableInstance`, `ModalInstance`, `SwitchInstance`,
`ActivityIndicatorInstance`, `RefreshControlInstance`, `ImageInstance`,
`KeyboardAvoidingViewInstance`, `TouchableHighlightInstance`, `TouchableOpacityInstance`,
`TouchableNativeFeedbackInstance`, `ButtonInstance`, `VirtualizedListInstance`,
`SafeAreaViewInstance` and more. They carry the component's own imperative methods —
`TextInputInstance` has `focus()`, `ScrollViewInstance` has `scrollTo()` — which `NativeMethods`
never did.

```diff
-import type {NativeMethods} from 'react-native';
-const input = useRef<NativeMethods | null>(null);
-// input.current?.focus()  — did not type-check even before, because
-// NativeMethods had no focus()
+import type {TextInputInstance} from 'react-native';
+const input = useRef<TextInputInstance | null>(null);
+input.current?.focus();
```

**`HostInstance`** is the generic form, for helpers that accept any host element:

```tsx title=After — both replacements in one file
import {useRef, useCallback} from 'react';
import {View, TextInput, ScrollView, Button, StyleSheet} from 'react-native';
import type {
  HostInstance,
  ViewInstance,
  TextInputInstance,
  ScrollViewInstance,
} from 'react-native';

// HostInstance replaces NativeMethods for code that does not care which
// component it was handed.
function measureInWindow(node: HostInstance | null): void {
  node?.measureInWindow((x, y, width, height) => {
    console.log('rect', x, y, width, height);
  });
}

export function Editor() {
  const row = useRef<ViewInstance | null>(null);
  const input = useRef<TextInputInstance | null>(null);
  const scroller = useRef<ScrollViewInstance | null>(null);

  const focusAndScroll = useCallback(() => {
    // Component-specific methods are only available on the specific instance type.
    input.current?.focus();
    scroller.current?.scrollTo({y: 0, animated: true});
    measureInWindow(row.current);
  }, []);

  return (
    <ScrollView ref={scroller} contentContainerStyle={styles.content}>
      <View ref={row}>
        <TextInput ref={input} inputMode="email" autoCapitalize="none" />
      </View>
      <Button title="Focus" onPress={focusAndScroll} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {padding: 16, gap: 12},
});
```

For a component of your own that forwards a ref to a host element, type the forwarded ref as the
instance type of whatever it lands on:

```tsx title=Forwarding a ref with the right type
import type {Ref} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {ViewInstance} from 'react-native';

type Props = {
  label: string;
  // In React 19 `ref` is an ordinary prop — no forwardRef wrapper needed.
  ref?: Ref<ViewInstance>;
};

export function Card({label, ref}: Props) {
  return (
    <View ref={ref} style={styles.card}>
      <Text>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {padding: 16, borderRadius: 12, backgroundColor: '#f2f4f7'},
});
```

## The temporary opt-out

> [!DEPRECATED] This is a migration aid with an expiry date
> `customConditions: ["react-native", "react-native-legacy-deep-imports"]` restores the old type
> surface. It works **only through 0.88** and is **intended for removal in 0.89**. Use it to unblock
> a build while you fix imports, with a ticket and a date attached. It is not a configuration to
> adopt, and a project that still needs it when 0.89 lands has an emergency rather than a setting.

```json title=tsconfig.json — temporary only
{
  "extends": "@react-native/typescript-config",
  "compilerOptions": {
    "customConditions": ["react-native", "react-native-legacy-deep-imports"]
  }
}
```

Two details decide whether this works at all.

**`customConditions` replaces, it does not append.** `@react-native/typescript-config@0.87.1`
already sets `"customConditions": ["react-native"]`. Writing only
`["react-native-legacy-deep-imports"]` drops the `react-native` condition and breaks resolution of
platform-specific files. Both entries must be present.

**It requires `moduleResolution: "bundler"` or `node16`/`nodenext`.** `customConditions` is ignored
under the older `node` resolution, so nothing changes and the errors persist — which reads as "the
opt-out does not work" when the real problem is the resolution mode. The base config already sets
`"moduleResolution": "bundler"`.

To prove it is no longer needed, delete the `customConditions` override and run `npx tsc --noEmit`.
If it is clean, remove the key permanently and commit.

## A migration order for a large codebase

Fixing several hundred errors at once produces an unreviewable diff. This order keeps each step
mechanical and separately revertable.

**Step 0 — measure.** Before changing anything, get the shape of the problem.

```bash
npx tsc --noEmit 2>&1 | tee /tmp/strict-before.txt
grep -c "error TS" /tmp/strict-before.txt

# What kind of errors, and where?
grep -rn --include=*.ts --include=*.tsx "react-native/Libraries/" src/ | wc -l
grep -rn --include=*.ts --include=*.tsx "react-native/src/private/" src/ | wc -l
grep -rnE --include=*.ts --include=*.tsx "\b[A-Za-z]+Properties\b" src/ | wc -l
grep -rn --include=*.ts --include=*.tsx "NativeMethods" src/ | wc -l
```

**Step 1 — turn on the opt-out and land the upgrade.** Get to 0.87 with a building, shipping app.
Separating "the upgrade" from "the type migration" means a failure in one does not block the other.
Open the ticket to remove the opt-out on the same day you add it.

**Step 2 — the `*Properties` rename.** One commit, one `sed`, reviewable by pattern. It touches the
most files and carries the least risk, so it clears the noise from the error list.

**Step 3 — deep imports, one directory at a time.** Start with leaf modules (utilities, hooks) and
work up to screens. Most become a root import; a few need the table above. Anything with no root
equivalent was private — find the supported API rather than reaching for
`unstable-internals-do-not-use`.

**Step 4 — `src/private/` imports.** Smaller, and each one needs a decision because these were never
public. Expect a handful to need a genuine redesign.

**Step 5 — ref types.** Requires per-site judgement, so do it last when the error list is short
enough to read. Take one component at a time: change the `useRef` type annotation, then follow the
compiler to every consumer.

**Step 6 — remove the opt-out.** Delete `customConditions` from `tsconfig.json`, run
`npx tsc --noEmit`, fix the remainder, commit.

**Step 7 — stop it coming back.** The compiler now enforces it, but make CI run the check and make
the failure obvious:

```bash
npx tsc --noEmit        # this is the highest-value CI check in a 0.87 project
```

Add an ESLint rule so a deep import is flagged in the editor rather than in CI:

```json title=.eslintrc.json (excerpt)
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["react-native/Libraries/*", "react-native/src/private/*"],
            "message": "Import from 'react-native' instead. Deep imports have no types in 0.87."
          }
        ]
      }
    ]
  }
}
```

If a dependency in `node_modules` does the deep importing, you cannot fix it from your side. Check
for a newer version, and if there is none, treat it the way you would any other unmaintained native
dependency — see [Native Dependency Compatibility](native-dependency-compatibility.md).

## Platform differences

The `exports` map is platform-agnostic; nothing here differs between iOS and Android, and the
migration can be done entirely on Linux or Windows.

One resolution detail is platform-related. The `react-native` custom condition — the one already in
`@react-native/typescript-config` — is what lets TypeScript resolve `.ios.tsx` / `.android.tsx`
files. Dropping it while adding the legacy condition breaks platform-specific modules, which is why
both entries must appear in the array.

## Performance considerations

Type resolution, not runtime. `types_generated/index.d.ts` is a curated 184-line entry point rather
than a sprawl of hand-written declarations, so the strict surface generally type-checks faster than
the legacy one. If `tsc` is slow, the cause is usually elsewhere: `skipLibCheck: false`, an
over-broad `include`, or a very large union type in your own code.

## Common mistakes

- **Adding `// @ts-expect-error` above a deep import.** Wrong: suppressing TS2307. Right: import
  from the root. The suppression hides the fact that the module has no types at all, so every value
  you take from it is `any` and nothing downstream is checked.
- **Writing `customConditions: ["react-native-legacy-deep-imports"]` alone.** Wrong: replacing the
  array. Right: `["react-native", "react-native-legacy-deep-imports"]`. Dropping the `react-native`
  condition breaks `.ios` / `.android` resolution, and the resulting errors look unrelated.
- **Treating the opt-out as configuration.** Wrong: leaving it in `tsconfig.json` indefinitely.
  Right: a ticket with a date. It works only through 0.88 and is intended for removal in 0.89.
- **Using `HostInstance` everywhere.** Wrong: `useRef<HostInstance | null>(null)` for a `TextInput`.
  Right: `TextInputInstance`. `HostInstance` has no `focus()`, so you will reach for a cast, and the
  cast is how a real bug gets through.
- **Assuming a deep import is broken at runtime.** Wrong: "it still runs, so it is fine". The
  `default` condition still resolves the JavaScript — only the types are withheld. The code runs
  unchecked, which is worse than broken.
- **Renaming `*Properties` with an unbounded regex.** Wrong: `s/Properties/Props/g`. Right: anchor
  on the component names. An unbounded replace mangles your own `UserProperties`, `AnimationProperties`
  and every `LayoutAnimationProperties` in the core types.
- **Doing the whole migration in one commit.** Wrong: one 400-file diff. Right: the ordered steps
  above. Nobody reviews a 400-file diff, and when something regresses you cannot bisect it.

## Related topics

- [0.87 Breaking Changes](breaking-changes-087.md) — the complete removal and deprecation checklist.
- [The Upgrade Helper Workflow](upgrade-helper-workflow.md) — the process this migration sits inside.
- [Native Dependency Compatibility](native-dependency-compatibility.md) — when the deep import is in somebody else's package.
- [New Architecture Migration](new-architecture-migration.md) — the refactors the Strict API was introduced to enable.
- [Introduction](../getting-started/introduction.md) — the short version of this change.
- [API Reference](../reference/api-reference.md) — what the root of `react-native` actually exports.
- [CI for Mobile](../testing/ci-for-mobile.md) — making `tsc --noEmit` a gate.
