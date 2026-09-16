---
title: Android Signing
description: Generate an upload keystore, wire it into Gradle without committing a secret, and understand what Play App Signing does and does not protect you from.
status: current
toolchain: cli
---

Every Android app is signed. A debug build is signed with a throwaway key that Android Studio
generated for you; a release build must be signed with a key you control, and Android uses that
signature to decide whether an update really came from you.

The consequences of getting this wrong are unusually permanent. A lost signing key used to mean
you could never update your app again — you had to publish a new listing and ask every user to
reinstall. Play App Signing removed most of that risk, but only for apps enrolled in it, and only
for the upload key.

## Why it exists, and what it actually proves

An Android signature proves **continuity**, not identity. It says "the thing that signed this
update also signed the version you have installed". Nothing about the certificate is verified by
a certificate authority — it is self-signed by design, and the `CN=` you type into `keytool` is
whatever you felt like typing.

So the security property is: an attacker who does not have your key cannot push an update to
your users. An attacker who *does* have your key can. That is the whole threat model, and it is
why the key handling below matters more than the cryptography.

## Two keys, once you are on Play App Signing

This is the concept that makes the rest of the page make sense.

| | Upload key | App signing key |
| --- | --- | --- |
| Who holds it | You | Google, in Play's key management infrastructure |
| What it signs | The AAB you upload to the Play Console | The APKs Play generates and delivers to devices |
| What devices verify | Nothing — it never reaches a device | This one |
| If you lose it | Request a reset through Play Console support | Unrecoverable, if you are not enrolled |
| Rotatable | Yes | Effectively no |

When you upload an AAB, Play verifies your upload key, strips that signature, and re-signs the
generated APKs with the app signing key it holds. Losing the upload key is therefore an
inconvenience — you generate a new one and ask Play to register it. Losing the *app signing key*
on an app that is not enrolled in Play App Signing is terminal.

Play App Signing is required for new apps on the Play Store, because new apps must publish as
AABs and the AAB pipeline signs the delivered APKs on Google's side. An app published before that
requirement may still be signing its own APKs, in which case the key on your machine **is** the
app signing key and there is no reset path. Check which situation you are in before you treat a
key casually.

> [!DANGER] Verify which key you are holding before you assume it is replaceable
> In the Play Console, open **Release → Setup → App integrity → App signing**. If it shows both an
> app signing key certificate and an upload key certificate, you are enrolled and your local key
> is the upload key. If it shows only one certificate and no upload key, your local key is the
> app signing key, and losing it ends the app. Back it up accordingly.

## Generating the keystore

`keytool` ships with the JDK, so it is already on your machine from
[Environment Setup](../getting-started/environment-setup.md).

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore awesomeapp-upload-key.keystore \
  -alias awesomeapp-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

What each flag is doing, since the defaults matter:

| Flag | Why this value |
| --- | --- |
| `-storetype PKCS12` | The standard format. The older `JKS` produces a warning on every use and is deprecated |
| `-keyalg RSA -keysize 2048` | What Play accepts for an upload key. 2048-bit RSA is the floor |
| `-validity 10000` | Roughly 27 years. An expired signing certificate cannot sign updates, and 10000 days is the conventional value for exactly this reason |
| `-alias` | You will need this string in Gradle. Name it after the app, not `key0` |

`keytool` prompts for a keystore password, a key password, and a distinguished name. The
distinguished name is cosmetic — it is not verified by anyone — but it is baked into the
certificate permanently, so put your organisation in it rather than test data.

Store the resulting file at `android/app/awesomeapp-upload-key.keystore`, or anywhere outside the
repository. Then, immediately:

```text title=.gitignore
# Never commit a keystore or its credentials.
*.keystore
*.jks
android/keystores/
android/app/*.keystore
```

> [!DANGER] A keystore in git history is compromised, permanently
> `git rm` does not remove it. Anyone with a clone, a fork, or a CI cache still has it, and so
> does every mirror of your repository. If a keystore has ever been committed: treat it as
> public, generate a new one, and — if you are enrolled in Play App Signing — request an upload
> key reset. Deleting the file from `HEAD` fixes nothing.

## Wiring it into Gradle without leaking it

### The credentials

Gradle reads properties from `~/.gradle/gradle.properties` as well as from the project's own.
Putting the credentials in the **user-level** file keeps them off every machine but yours and out
of the repository entirely.

```properties title=~/.gradle/gradle.properties
AWESOMEAPP_UPLOAD_STORE_FILE=awesomeapp-upload-key.keystore
AWESOMEAPP_UPLOAD_KEY_ALIAS=awesomeapp-upload
AWESOMEAPP_UPLOAD_STORE_PASSWORD=*****
AWESOMEAPP_UPLOAD_KEY_PASSWORD=*****
```

The project's `android/gradle.properties` **is** committed — it is where the AGP 9 opt-outs and
JVM settings live — so nothing secret may go in it:

```properties title=android/gradle.properties
# Committed. Configuration only, never credentials.
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

### The signing config

```gradle title=android/app/build.gradle
android {
    signingConfigs {
        release {
            // Resolve from Gradle properties first, then the environment, so the
            // same block works on a developer machine and on a CI runner.
            def storeFilePath = project.findProperty("AWESOMEAPP_UPLOAD_STORE_FILE")
                ?: System.getenv("AWESOMEAPP_UPLOAD_STORE_FILE")
            def alias = project.findProperty("AWESOMEAPP_UPLOAD_KEY_ALIAS")
                ?: System.getenv("AWESOMEAPP_UPLOAD_KEY_ALIAS")
            def storePass = project.findProperty("AWESOMEAPP_UPLOAD_STORE_PASSWORD")
                ?: System.getenv("AWESOMEAPP_UPLOAD_STORE_PASSWORD")
            def keyPass = project.findProperty("AWESOMEAPP_UPLOAD_KEY_PASSWORD")
                ?: System.getenv("AWESOMEAPP_UPLOAD_KEY_PASSWORD")

            if (storeFilePath) {
                storeFile file(storeFilePath)
                keyAlias alias
                storePassword storePass
                keyPassword keyPass
            }
            // If the properties are absent we deliberately leave the config
            // empty rather than substituting the debug key. See below.
        }
    }

    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}
```

> [!WARNING] Never fall back to the debug key
> A common snippet ends with `signingConfig signingConfigs.debug` when the release properties are
> missing. It makes the build "work" on a machine with no credentials — and produces a
> release-looking APK signed with a key every Android developer on earth has. Play rejects it,
> but only after you have handed it to a tester, or shipped it to a device farm. Let the build
> fail instead.

Verify the wiring before you need it:

```bash
cd android
./gradlew signingReport
```

That prints the config, alias, and certificate fingerprints for each variant. If the release row
shows the debug keystore path, the properties are not being found.

## CI: environment variables, not files in the repository

A CI runner has no `~/.gradle/gradle.properties` and must not have your keystore checked in. The
standard approach is to store the keystore base64-encoded as a secret, decode it at the start of
the job, and pass the passwords as environment variables.

```bash
# Locally, once: produce the value to paste into your CI secret store.
base64 -i android/app/awesomeapp-upload-key.keystore -o keystore.b64
```

```yaml title=.github/workflows/release.yml (excerpt)
      - name: Decode the upload keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.ANDROID_UPLOAD_KEYSTORE_BASE64 }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 --decode > android/app/upload.keystore

      - name: Build the release bundle
        env:
          AWESOMEAPP_UPLOAD_STORE_FILE: upload.keystore
          AWESOMEAPP_UPLOAD_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          AWESOMEAPP_UPLOAD_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
          AWESOMEAPP_UPLOAD_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: cd android && ./gradlew bundleProdRelease

      - name: Remove the decoded keystore
        if: always()
        run: rm -f android/app/upload.keystore
```

`storeFile file(...)` resolves relative to `android/app/`, which is why the decoded path above is
`android/app/upload.keystore` and the property value is just `upload.keystore`.

Three rules that make this safe rather than merely working:

1. **Never `echo` a password.** A `set -x` in a shell step prints every variable. Most CI systems
   mask registered secrets in logs, but they cannot mask a value you derived from one.
2. **Delete the decoded keystore in an `always()` step.** Otherwise it can survive into a cached
   workspace or an uploaded artefact.
3. **Do not upload the whole `android/` directory as a build artefact.** Upload the AAB.

## Building and verifying a signed release

```bash
cd android
./gradlew bundleProdRelease     # AAB — what you upload to Play
./gradlew assembleProdRelease   # APK — for direct distribution and testing
```

Outputs land in `android/app/build/outputs/bundle/prodRelease/` and
`android/app/build/outputs/apk/prodRelease/`.

Check that the artefact is signed with the key you think it is:

```bash
# The certificates in an APK. `apksigner` is in the Android SDK build-tools.
$ANDROID_HOME/build-tools/37.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/prodRelease/app-prod-release.apk

# The certificate in your keystore, to compare fingerprints.
keytool -list -v -keystore awesomeapp-upload-key.keystore -alias awesomeapp-upload
```

The SHA-256 fingerprint printed by both must match. An AAB is verified differently — use
`jarsigner -verify -verbose -certs` on the `.aab`, or just upload it and let Play tell you.

### Fingerprints for third-party services

Services such as maps SDKs and app-link verification need your app's signing certificate
fingerprint. This is where Play App Signing surprises people: the certificate that reaches
devices is **Play's**, not yours.

- Register the **app signing key** fingerprint from **Play Console → Release → Setup → App
  integrity**, not the fingerprint of your local upload keystore.
- Register your **debug** fingerprint separately for local development.
- If you also distribute outside Play, that build carries a different certificate again.

Getting this wrong produces a feature that works in debug and fails silently in production,
which is a slow bug to find.

## Security considerations

### Threat

An attacker with your upload key can publish a build to your users. An attacker with your app
signing key, on an app not enrolled in Play App Signing, can sign an APK that Android accepts as
an update to yours — installable outside the store, indistinguishable to the device.

The realistic delivery routes are boring: a keystore committed to a repository, a password in a
CI log, a `.keystore` in a Slack message, or a laptop backup.

### Exploit

```bash
# Find a keystore anywhere in the repository's history, not just its current state.
git log --all --diff-filter=A --name-only --pretty=format: \
  | sort -u | grep -iE '\.(keystore|jks|p12)$'

# Find credentials committed in Gradle properties.
git log -p --all -- '*gradle.properties' | grep -iE 'storePassword|keyPassword|KEY_PASSWORD'
```

Either command printing anything is a finding, not a warning.

### Fix

1. **Rotate.** Generate a new upload key and request a reset through Play Console support. If the
   exposed key is an app signing key on a non-enrolled app, contact Play support before doing
   anything else; your options are limited and time matters.
2. **Move credentials out of the repository** to `~/.gradle/gradle.properties` locally and to
   your CI secret store for automation.
3. **Restrict who can upload.** Play Console permissions are per-user; the set of people who can
   publish to production should be small and reviewed.
4. **Back up the keystore somewhere you control** — a password manager or a company secret store,
   not a personal drive and not only one laptop.

### Verification

```bash
# 1. Nothing keystore-shaped is tracked, now or historically.
git log --all --diff-filter=A --name-only --pretty=format: | sort -u \
  | grep -iE '\.(keystore|jks|p12)$' && echo "FAIL" || echo "OK"

# 2. The committed gradle.properties holds no credentials.
grep -iE 'password|storeFile|keyAlias' android/gradle.properties && echo "FAIL" || echo "OK"

# 3. The release variant really uses the release key.
cd android && ./gradlew signingReport | sed -n '/Variant: prodRelease/,/^$/p'
```

Run the first two in CI. A pre-commit hook that rejects `*.keystore` is cheap and catches the
mistake before it becomes permanent.

## Common mistakes

- **Committing the keystore.** `git rm` later does not help; the object is in history and in every
  clone. Add `*.keystore` and `*.jks` to `.gitignore` on day one.
- **Putting passwords in `android/gradle.properties`.** That file is committed. Use
  `~/.gradle/gradle.properties` or environment variables.
- **Falling back to the debug signing config.** Wrong:
  `signingConfig = signingConfigs.debug` when credentials are missing. Right: let the build fail.
  A debug-signed "release" APK reaches testers and is rejected by Play with a confusing message.
- **Assuming the local keystore is the app signing key.** On an enrolled app it is the upload key,
  and the fingerprint third-party services need is Play's. Check **App integrity** in the console.
- **Registering the upload fingerprint with a maps or auth SDK.** The feature works in debug and
  fails only in production builds delivered by Play.
- **Using `-storetype JKS`.** It is deprecated and every `keytool` invocation warns about it. Use
  `PKCS12`.
- **A short `-validity`.** A certificate that expires cannot sign updates. 10000 days is the
  convention precisely because nobody wants to discover this in year three.
- **Leaving the decoded keystore in the CI workspace.** It can end up in a cache or an uploaded
  artefact. Delete it in a step that runs on failure too.
- **Backing the keystore up in exactly one place.** One laptop is not a backup, and neither is one
  CI secret.

## Related topics

- [AAB and Play Store Submission](play-store-submission.md) — what Play does with the signature after upload.
- [Build Variants and Flavours](build-variants.md) — a signing config per build type and flavour.
- [ProGuard and R8](proguard-and-r8.md) — the other thing `buildTypes.release` turns on.
- [CI Pipelines](ci-pipelines.md) — secrets, decoding, and cleanup in a pipeline.
- [Fastlane](fastlane.md) — automating the signed build and the upload.
- [Environment Configuration](environment-configuration.md) — configuration that may be public, unlike this.
- [Threat Model](../security/threat-model.md) — where signing sits among the risks.
- [Environment Setup](../getting-started/environment-setup.md) — the JDK that provides `keytool`.
- [Release Checklist](release-checklist.md) — signing checks before you upload.
