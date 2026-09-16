# React Native Handbook

A documentation site for React Native, with two halves documented separately:

| Half | Toolchain | React Native | Sections |
| --- | --- | --- | --- |
| **CLI** | React Native Community CLI 20.2.0 | **0.87.1** | `content/getting-started` … `content/reference` |
| **Expo** | Expo SDK 57 (expo 57.0.22, expo-router 57.0.21, eas-cli 24.5.0) | **0.86.3** | every `content/expo-*` section |

**The two halves are on different React Native versions, and the site never blurs them.**
React Native 0.87 made the Strict TypeScript API the default and added per-component ref types
(`ViewInstance`, `TextInputInstance`) that do not exist in 0.86. So code copied between the
halves does not compile. Every page declares its toolchain in front matter and shows it as a
badge, and the top bar separates the two families of menus.

The CLI half targets the **New Architecture** only (Fabric, TurboModules, JSI, Codegen and
Hermes), because as of React Native 0.82 there is no other architecture.

## Verified against

| Thing | Version | Half |
| --- | --- | --- |
| `react-native` | 0.87.1 | CLI |
| `@react-native-community/cli` | 20.2.0 | CLI |
| `react` | 19.2.3 (peer `^19.2.3`) | both |
| Node.js | minimum 22.13.0 | CLI |
| `expo` | 57.0.22 (SDK 57) | Expo |
| `react-native` via SDK 57 | 0.86.3 | Expo |
| `expo-router` | 57.0.21 | Expo |
| `eas-cli` | 24.5.0 | Expo |

Versions and APIs were checked against the npm registry, docs.expo.dev and the **installed
`react-native@0.87.1` and `expo@57.0.22` packages**. Expo versions come from
`expo/bundledNativeModules.json`, the file `npx expo install` itself reads. The SDK↔React Native
pairing (SDK 55 → 0.83.10, SDK 56 → 0.85.3, SDK 57 → 0.86.3) was read out of each SDK release's
own copy of that file.

## Repository layout

```text
content/           Markdown source, one topic per file, grouped by section
docs/              Generated HTML — this is what GitHub Pages serves
assets/            Theme CSS and the client runtime (copied into docs/assets)
scripts/           Generator and validation tooling (plain Node ESM, no dependencies)
  nav.mjs          Navigation manifest — the single source of truth
  build.mjs        Static site generator
  markdown.mjs     Markdown renderer and syntax highlighter
  check.mjs        Link, structure and banned-API validation
  typecheck-blocks.mjs  Type-checks every fenced ts/tsx block for real
  serve.mjs        Local preview server
examples/          Runnable example apps, each with its own package.json and README
                     (CLI examples, and expo-* examples for SDK 57)
tools/typecheck/        Harness: real react-native 0.87.1, for the CLI half
tools/typecheck-expo/   Harness: real expo 57.0.22 + react-native 0.86.3 + TypeScript 6.0.3,
                        for the Expo half
CONTRIBUTING.md    Authoring conventions and the verified-facts reference
```

## Building the site

The generator is plain Node ESM with **zero npm dependencies**, so this works on a fresh clone
with no install step:

```bash
node scripts/build.mjs
```

Preview it locally:

```bash
node scripts/serve.mjs
```

Then open <http://localhost:4173>.

## Validation

```bash
node scripts/check.mjs
```

Validates front matter, required sections, internal links, heading anchors and orphan pages,
and **fails on banned patterns** — deep imports into `react-native/Libraries/`, the ignored
architecture flags, `InteractionManager`, removed `Modal` / `StatusBar` props, `NativeMethods`,
`*Properties` aliases, `ImageBackground`, `InitializeCore`, a bare `#import <RCTAppDelegate.h>`,
and any Expo reference outside the single allow-listed scope note.

```bash
node scripts/typecheck-blocks.mjs          # every page
node scripts/typecheck-blocks.mjs styling  # one section
```

This is the highest-value check in the repository. It extracts every fenced `ts` and `tsx`
block and compiles it against the **real installed types for that page's toolchain**:

- **CLI pages:** `react-native@0.87.1` with the Strict API active.
- **Expo pages** (`content/expo-*`): `expo@57.0.22` plus `react-native@0.86.3` and TypeScript
  6.0.3, extending `expo/tsconfig.base` exactly as a real SDK 57 project does.

A snippet copied across the boundary fails. `ViewInstance` does not exist on 0.86, and a deep
`react-native/Libraries/` import is a type error on 0.87. Errors are reported against the
Markdown file and line.

Each harness needs one install:

```bash
cd tools/typecheck && npm install
```

```bash
cd tools/typecheck-expo && npm install
```

`check.mjs` enforces the toolchain boundary in both directions. CLI pages may not mention Expo,
apart from one allow-listed scope note. Expo pages may not teach:

- `expo init` or `expo eject`
- a bare `npm install` of an SDK package where `npx expo install` is required
- the retired "managed/bare workflow" framing
- a React Native 0.87-only ref type

Blocks tagged `ts-fragment` / `tsx-fragment` are highlighted but skipped — for snippets that
genuinely cannot stand alone, such as a partial config or a block importing a module an earlier
block on the same page defined.

```bash
node scripts/check-deps.mjs
```

Extracts every npm package the docs and examples name, then asks the registry whether it
exists, what the current version is, and whether its `react-native` peer range admits 0.87.1.
Requires network access and takes a few minutes; it is not part of the CI workflow for that
reason. A permissive `"react-native": "*"` peer is reported as **unverifiable** rather than
compatible — an absence of information is not a compatibility claim.

## Publishing to GitHub Pages

The site is generated into `docs/` specifically so GitHub Pages can serve it with no
configuration and no build action.

1. Build and commit the output:

   ```bash
   node scripts/build.mjs
   git add docs
   git commit -m "Build site"
   git push origin main
   ```

2. In the repository on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set the branch to **`main`** and the folder to **`/docs`**, then **Save**.
5. Wait for the Pages deployment to finish. The site appears at
   `https://<user>.github.io/<repo>/`.

A `.nojekyll` file is emitted into `docs/` so Pages serves the output verbatim instead of
running Jekyll over it. Every link the generator emits is relative, so the site works correctly
from a repository subpath.

To rebuild after editing content, run `node scripts/build.mjs` and commit `docs/` again. The
included GitHub Actions workflow (`.github/workflows/docs.yml`) also verifies on every push
that the checks pass and that the committed `docs/` output is up to date with `content/`.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before writing anything. It carries the verified facts,
the removed and deprecated API lists for 0.87, the no-Expo scope rule, the required page shape
and the markdown features available. The React Native ecosystem changed fundamentally between
0.76 and 0.87, and content written from memory is reliably wrong.
