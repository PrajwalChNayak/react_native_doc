---
title: Environment Setup
description: Install Node, the JDK, Android Studio and — on macOS — Xcode, so that React Native 0.87 builds on the first try.
status: current
toolchain: cli
---

React Native 0.87 builds real native apps, so the toolchain is a native toolchain: a JavaScript
runtime, a JDK, the Android SDK, and on macOS the Xcode toolchain as well. Almost every
"it does not build" report on a fresh machine traces back to one of four things — a Node version
below the floor, the wrong JDK, a missing Android SDK component, or `ANDROID_HOME` not being set
where the shell can see it.

This page installs each piece, explains why it is needed, and ends with a set of commands you can
run to prove the setup is real before you create a project.

## What you actually need, and what you do not

| Piece | Needed for | Optional? |
| --- | --- | --- |
| Node.js `>= 22.13.0` | Everything — Metro, the CLI, the package manager | No |
| A Node version manager | Switching Node per project | Strongly recommended |
| Watchman | Faster file watching on macOS and Linux | Recommended, not required |
| JDK 17 | Compiling Android and running Gradle | No, for Android |
| Android Studio + SDK | Android builds, the emulator, `adb` | No, for Android |
| Xcode 26 + iOS runtime | iOS builds and the simulator | No, for iOS. **macOS only** |
| Ruby + Bundler | CocoaPods, which installs iOS native dependencies | No, for iOS |

> [!WARNING] iOS requires macOS. There is no way around it
> Building or running an iOS app requires Xcode, and Xcode runs only on macOS. There is no
> supported path on Windows or Linux — not a VM you can license, not a cross-compiler, not a
> container. If you are on Windows or Linux you can build the complete Android app and write all
> of the shared JavaScript, but the iOS half of the project needs a Mac (your own, a colleague's,
> or a hosted macOS CI runner). Android development works on all three operating systems.

## Node, and why the version floor bites

React Native 0.87.1 declares this in its own `package.json`:

```json title=node_modules/react-native/package.json
{
  "engines": {
    "node": "^22.13.0 || ^24.3.0 || >= 26.0.0"
  }
}
```

Read that carefully, because it is not "Node 22 or newer". It is three disjoint ranges:

- `^22.13.0` — Node 22, but **only 22.13.0 and above**. Node 22.11.0 and 22.12.0 do **not** satisfy it.
- `^24.3.0` — Node 24, but only 24.3.0 and above. Node 24.0–24.2 do not satisfy it.
- `>= 26.0.0` — anything from Node 26 up.

Node 23 and Node 25 are odd-numbered, non-LTS lines and are excluded entirely.

> [!WARNING] The minimum is 22.13.0, not 22.11.0
> reactnative.dev's setup page still says "Node 22.11.0 or newer" as of 2026-09-12. The
> `engines` field above was read from the installed `react-native@0.87.1` package, and it is the
> value your package manager actually enforces. On 22.11.0 the install produces an
> unsupported-engine warning rather than a hard failure, so the real symptom arrives later as a
> confusing Metro or Gradle error. Use **22.13.0 or newer**.

### Install Node with a version manager

Install Node through a version manager rather than a system package. You will eventually work on
a project pinned to a different Node line, and swapping the system Node is far more painful than
swapping a managed one.

:::tabs
@tab macOS
```bash
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
nvm install 22
nvm use 22

# or fnm, via Homebrew
brew install fnm
fnm install 22
fnm use 22
```
@tab Windows
```powershell
# fnm, via winget
winget install Schniz.fnm
fnm install 22
fnm use 22

# or nvm-windows
winget install CoreyButler.NVMforWindows
nvm install 22
nvm use 22
```
@tab Linux
```bash
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
nvm install 22
nvm use 22
```
:::

After installing, check the patch number rather than assuming. `nvm install 22` resolves to the
latest 22.x, which today is above the floor — but a machine that installed Node 22 in 2024 may
still be sitting on 22.11.0.

```bash
node -v
```

If that prints anything below `v22.13.0`, `v24.3.0`, or `v26.0.0` for its major line, upgrade
before going further.

### Pin the version per project

Commit a `.nvmrc` (or `.node-version` for fnm) so every machine and CI runner picks the same
line. It costs one file and removes a whole class of "works on my machine".

```text title=.nvmrc
22
```

## Watchman

Watchman is a file-watching service. Metro can watch files without it, but on large trees
Watchman is meaningfully faster and avoids the file-descriptor limits that native watchers hit.
reactnative.dev lists it as **highly recommended, not required**, on macOS and Linux.

:::tabs
@tab macOS
```bash
brew install watchman
```
@tab Windows
Watchman is not part of the official Windows setup instructions for React Native, and Metro's
built-in watcher is what you will use. Skip this step.
@tab Linux
Watchman is not in most distribution repositories at a current version; the official route is
[building it from source](https://facebook.github.io/watchman/docs/install). If you skip it,
raise the inotify watch limit instead, or Metro will fail with `ENOSPC` on a large project:

```bash
echo fs.inotify.max_user_watches=582222 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```
:::

## The JDK

**React Native 0.87 requires JDK 17.** This is confirmed three ways: the React Native 0.87
documentation recommends JDK 17 and warns that higher versions cause problems; the React Native
releases support matrix lists JDK 17 for 0.87; and the shipped `ReactAndroid/build.gradle.kts`
in the installed package compiles against `JavaVersion.VERSION_17` for both source and target
compatibility.

> [!WARNING] A newer JDK is not a better JDK here
> Gradle, the Android Gradle Plugin and Kotlin each support a bounded set of JDKs. Installing
> JDK 21 or 24 because it is newer produces `Unsupported class file major version` or
> `Could not determine java version` errors that read like a Gradle bug and are not one. Install
> 17.

:::tabs
@tab macOS
```bash
brew install --cask zulu@17
```

Azul Zulu is the distribution the React Native docs recommend, and it ships builds for both
Apple silicon and Intel. After installing, point `JAVA_HOME` at it in your shell profile:

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
```
@tab Windows
```powershell
choco install -y microsoft-openjdk17
```

That is the exact package the React Native Windows setup guide uses. Chocolatey sets `JAVA_HOME`
for you; open a new terminal afterwards so the change is picked up.
@tab Linux
Install OpenJDK 17 from your distribution's packager. On Debian and Ubuntu:

```bash
sudo apt install openjdk-17-jdk
```

Then set `JAVA_HOME` in your shell profile:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
```
:::

> [!NOTE] Android Studio bundles its own JDK, and that is not enough
> Android Studio ships an embedded JetBrains Runtime that Gradle uses when you build from inside
> the IDE. The React Native CLI shells out to `./gradlew` from your terminal, where the embedded
> JDK is invisible. You need a JDK 17 that your shell can find, which is what `java -version`
> tells you.

## Android Studio and the Android SDK

Install [Android Studio](https://developer.android.com/studio). In the setup wizard, make sure
these are selected:

- **Android SDK**
- **Android SDK Platform**
- **Android Virtual Device**

Then open **Settings → Languages & Frameworks → Android SDK** (the SDK Manager) and install the
components React Native 0.87 actually compiles against.

### SDK Platforms tab

Tick **Show Package Details**, then select:

- **Android SDK Platform 37** — React Native 0.87 sets `compileSdk = 37`
- A **system image** for the API level you want to emulate, matching your machine's architecture
  (`Google APIs ARM 64 v8a System Image` on Apple silicon, `Google APIs Intel x86_64 Atom System
  Image` on Intel and most Windows/Linux machines)

### SDK Tools tab

Tick **Show Package Details**, then select:

- **Android SDK Build-Tools 37.0.0**
- **Android SDK Command-line Tools (latest)** — this is what provides `sdkmanager` and
  `avdmanager`, and it is the component people most often forget
- **Android SDK Platform-Tools** — provides `adb`
- **Android Emulator**

> [!NOTE] The official setup page lags React Native's own build files
> As of 2026-09-12, reactnative.dev's environment setup page still tells you to install
> **SDK Platform 35** and **Build-Tools 36.0.0**. React Native 0.87.1's own version catalog
> (`node_modules/react-native/gradle/libs.versions.toml`) declares `compileSdk = "37"`,
> `buildTools = "37.0.0"`, `targetSdk = "36"`, `minSdk = "24"`, `agp = "9.2.1"` and
> `kotlin = "2.2.0"`. The version catalog is what Gradle reads, so install **37**. Installing 35
> and 36.0.0 as well does no harm, and Gradle can download a missing platform itself, but the
> build is faster and the failure modes are clearer when the right versions are present up front.

The minimum supported Android API level is `minSdk = 24` (Android 7.0), and Kotlin must be
**2.0 or newer** — 0.87 bundles 2.2.0.

### Environment variables

Gradle and the CLI locate the SDK through `ANDROID_HOME`. Set it in your shell profile, not in a
single terminal session, or it will vanish the next time you open a window.

:::tabs
@tab macOS
Add to `~/.zshrc` (zsh is the default shell) or `~/.bash_profile`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Then reload it:

```bash
source ~/.zshrc
```
@tab Windows
Set these through the GUI so they persist for every new terminal:

1. Open **Control Panel → User Accounts → User Accounts → Change my environment variables**.
2. Under **User variables**, click **New...** and create:
   - Variable name: `ANDROID_HOME`
   - Variable value: `%LOCALAPPDATA%\Android\Sdk`
3. Select the **Path** variable, click **Edit**, then **New**, and add each of these on its own
   line:

```text
%LOCALAPPDATA%\Android\Sdk\platform-tools
%LOCALAPPDATA%\Android\Sdk\emulator
%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin
```

4. Close every open terminal and open a new one. Environment changes are read at process start;
   an already-running PowerShell will not see them.

To confirm in PowerShell:

```powershell
$env:ANDROID_HOME
```
@tab Linux
Add to `~/.bashrc`, `~/.bash_profile` or `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

Then reload it:

```bash
source ~/.bashrc
```
:::

The `emulator` and `cmdline-tools/latest/bin` entries are not strictly required to build, but
without them `emulator` and `sdkmanager` are not on your `PATH` and half the troubleshooting
advice you will read stops working.

### Create an emulator

You can create an Android Virtual Device from Android Studio's **Device Manager**, which is the
easier route the first time: pick a phone profile, pick a system image you installed above,
finish, and press play.

From the terminal, once `cmdline-tools` is on your `PATH`:

```bash
# See what system images you have installed.
sdkmanager --list_installed

# Create an AVD from one of them. The image string must match exactly.
avdmanager create avd -n rn_pixel -k "system-images;android-37;google_apis;arm64-v8a" -d pixel_7

# List AVDs, then boot one.
emulator -list-avds
emulator -avd rn_pixel
```

> [!TIP] Give the emulator enough RAM and use hardware acceleration
> A Metro-driven debug build on an under-provisioned emulator feels broken rather than slow.
> In the Device Manager, give the AVD at least 2 GB of RAM and leave graphics on
> **Hardware - GLES 2.0**. On Windows, use the Android Emulator hypervisor driver or Hyper-V;
> on Apple silicon, use an `arm64-v8a` image rather than an emulated x86 one.

## macOS only: Xcode and the iOS toolchain

### Xcode

Install Xcode from the Mac App Store. **React Native 0.87 requires Xcode 26.0 or newer**, per the
React Native releases support matrix. Xcode is a large download; start it before you need it.

### Command line tools

Xcode's command line tools are separate from Xcode itself, and the build fails without them.
Open **Xcode → Settings → Locations** and choose the most recent version in the
**Command Line Tools** dropdown.

### An iOS simulator runtime

A fresh Xcode may install with no simulator runtimes at all, which produces a confusing
"no devices found" from `npm run ios`. Open **Xcode → Settings → Platforms**, press **+**, and
install an **iOS** runtime.

```bash
# What runtimes and simulators do you actually have?
xcrun simctl list runtimes
xcrun simctl list devices available
```

### Ruby and Bundler, for CocoaPods

CocoaPods installs the iOS native dependencies, and CocoaPods is a Ruby gem. A generated project
ships a `Gemfile` that pins the gem versions known to work, so you install through Bundler rather
than globally. The 0.87 template's `Gemfile` requires **Ruby >= 2.6.10** and pins
`cocoapods >= 1.13` while excluding the broken 1.15.0 and 1.15.1 releases.

The Ruby that ships with macOS satisfies that floor, so you can start with it. If you hit
permission errors installing gems, or you work across projects with different Ruby needs, install
a Ruby version manager instead:

```bash
brew install rbenv ruby-build
rbenv install 3.3.5
rbenv local 3.3.5
```

Then, from inside a generated project:

```bash
cd ios
bundle install              # installs the pinned CocoaPods from the Gemfile
bundle exec pod install     # installs the iOS native dependencies
```

> [!BEST-PRACTICE] Always use `bundle exec pod`, never bare `pod`
> A globally installed `pod` is whatever version you last happened to install. `bundle exec pod`
> is the version the project pinned. Mixing the two is how a `Podfile.lock` ends up churning in
> every pull request.

> [!NOTE] Swift Package Manager is Experimental
> React Native 0.87 ships an opt-in Swift Package Manager path that needs no Ruby, Bundler or
> CocoaPods — only Xcode. **CocoaPods remains the default**, the SPM commands and layout may still
> change, and third-party libraries must ship a `Package.swift` to work with it. Set up the
> toolchain above; see [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md)
> before you consider switching.

## Remove any global React Native CLI

Do this before you create a project, on every operating system. A globally installed
`react-native` binary left over from an older setup shadows the project-local CLI and produces
errors that make no sense against the code in front of you.

```bash
npm uninstall -g react-native-cli @react-native-community/cli
```

The supported way to run the CLI is `npx @react-native-community/cli@latest` for creating a
project, and the project's own `package.json` scripts afterwards.

## Verify your setup

Run these before you create a project. Each one tells you something specific; the table says what
has to be true of the output rather than pretending to show you a transcript from your machine.

```bash
node -v
npm -v
java -version
javac -version
adb --version
echo $ANDROID_HOME        # $env:ANDROID_HOME in PowerShell
```

| Command | What must be true |
| --- | --- |
| `node -v` | `v22.13.0`+ on the 22 line, `v24.3.0`+ on 24, or `v26`+. Not 22.11.0 |
| `npm -v` | Any current version; it ships with Node |
| `java -version` | Reports a **17.x** runtime. If it reports 21, 24 or 1.8, fix `JAVA_HOME` |
| `javac -version` | Reports **17.x** too. A JRE without `javac` cannot build Android |
| `adb --version` | Prints an Android Debug Bridge version. "command not found" means platform-tools is not on `PATH` |
| `echo $ANDROID_HOME` | Prints the SDK path. Empty output is the single most common Android build failure |

On macOS, also:

```bash
xcodebuild -version
xcrun simctl list runtimes
pod --version
```

| Command | What must be true |
| --- | --- |
| `xcodebuild -version` | Reports **Xcode 26.0** or newer. If it errors about a command line tools path, the Locations setting above is unset |
| `xcrun simctl list runtimes` | Lists at least one iOS runtime. An empty list means no simulator is installed |
| `pod --version` | Prints a CocoaPods version. Inside a project, prefer `bundle exec pod --version` |

### The one command that checks everything

The CLI ships a `doctor` command that inspects the whole toolchain and reports each item as
present or missing:

```bash
npx @react-native-community/cli@latest doctor
```

Inside an existing project, the local CLI is already available:

```bash
npx react-native doctor
```

`doctor` groups its findings by platform and offers to fix some of them for you. Treat it as the
final gate: if it reports a missing Android SDK, a missing `ANDROID_HOME` or a JDK it does not
like, fix that before creating a project rather than after.

> [!NOTE] `doctor` does not check everything
> It verifies the toolchain, not your project's correctness. It will not tell you that your Node
> version is on the wrong side of the `engines` range for a specific React Native release, and it
> cannot know which Android system image your emulator needs. Run `node -v` yourself.

## Common mistakes

- **Installing Node 22 and stopping there.** `nvm install 22` is fine on a new machine, but an
  existing 22.11.0 install satisfies "Node 22" and not `^22.13.0`. Check the patch number with
  `node -v`.
- **Installing the newest JDK.** React Native 0.87 needs **JDK 17**. JDK 21 or 24 produces
  `Unsupported class file major version` errors from Gradle that look like a Gradle bug. Wrong:
  `brew install openjdk`. Right: `brew install --cask zulu@17`.
- **Relying on Android Studio's bundled JDK.** It works inside the IDE and is invisible to
  `./gradlew` run from your terminal, which is how the CLI builds. Install a JDK 17 your shell
  can see.
- **Setting `ANDROID_HOME` in one terminal.** `export ANDROID_HOME=...` typed at a prompt lasts
  until you close the window. Put it in `~/.zshrc`, `~/.bashrc` or the Windows environment
  variable GUI.
- **Editing Windows environment variables and not restarting the terminal.** A running shell
  inherited its environment at launch. Close every terminal, including the one inside your
  editor, and open a new one.
- **Skipping "Android SDK Command-line Tools (latest)".** Without it there is no `sdkmanager` and
  no `avdmanager`, and most command-line Android advice you find will not run.
- **Leaving a global `react-native` CLI installed.** It shadows the project-local one and reports
  errors from a version of React Native you are not using. Run
  `npm uninstall -g react-native-cli @react-native-community/cli` first.
- **Running bare `pod install` on macOS.** Use `bundle exec pod install`, so the CocoaPods version
  matches the one the project pinned in its `Gemfile`.
- **Expecting to build iOS on Windows or Linux.** Xcode is macOS-only and there is no supported
  alternative. Plan for a Mac or a hosted macOS runner before you promise an iOS build date.

## Related topics

- [Introduction](introduction.md) — what this handbook covers and what changed in 0.87.
- [Creating a Project](creating-a-project.md) — `init`, version pinning, and the first run.
- [Running on Android](running-on-android.md) — emulators, devices, and reading Gradle failures.
- [Running on iOS](running-on-ios.md) — simulators, CocoaPods drift, and derived data.
- [Project Structure](project-structure.md) — what `init` generated and which files you edit.
- [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md) — the Experimental iOS alternative.
- [Troubleshooting](../reference/troubleshooting.md) — the wider failure catalogue.
- [Learning Path](learning-path.md) — a suggested reading order once the toolchain works.
