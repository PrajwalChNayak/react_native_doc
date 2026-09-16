---
title: EAS Secrets and Build-Time Variables
description: EAS environment variables keep values out of your repository and out of build logs. They do not keep values out of your app. Where that line falls, exactly.
status: current
toolchain: expo
sdk: 57
---

EAS environment variables let you store configuration on Expo's servers and have it injected
into a build job. Values marked **secret** are never readable back — not on the website, not
through `eas-cli`.

That sounds like a place to put an API key. It is not, and the reason is the single most
misunderstood thing about EAS secrets:

> **A secret protects the value on its way to the build. It does nothing about what the build
> does with it.** If the build inlines the value into your JavaScript bundle, the value is in the
> shipped app and anyone can read it.

## Why it exists / when to use it — and when NOT to

EAS environment variables exist to solve a real problem: a build machine needs values that should
not be committed to git. A private npm registry token, a Sentry auth token used to upload source
maps, a Google Services file, a signing credential for a custom step.

They are the right tool when the value is consumed **by the build process itself** and never
reaches the bundle.

They are the wrong tool when you were hoping they would make a client-side credential safe. For
that, see [EXPO_PUBLIC_ Variables and the Leak They Cause](expo-public-env-vars.md) and
[What Ships Inside the Bundle](what-ships-in-the-bundle.md).

## Basic example

Create or update a variable:

```bash
eas env:set --name SENTRY_AUTH_TOKEN --value "$TOKEN" --environment production --visibility secret
```

List what a project has, and pull the readable ones into a local `.env` file:

```bash
eas env:list --environment production
eas env:pull --environment production
```

Remove one:

```bash
eas env:delete --name SENTRY_AUTH_TOKEN --environment production
```

> [!NOTE] Verify the flags against your installed CLI
> `eas-cli` moves quickly. Run `eas env --help` and `eas env:set --help` against the version you
> have (this site documents **eas-cli 24.5.0**) rather than trusting a flag list copied from a
> blog post. The four subcommands above — `set`, `list`, `pull`, `delete` — are the documented
> set; individual flags change more often.

> [!WARNING] `eas env:pull` writes values to disk
> It creates a `.env` file in your project. Make sure that filename is in `.gitignore` before you
> run it, and remember that a `secret`-visibility variable cannot be pulled at all — that is the
> point of the visibility level.

## How it works

### Visibility levels

EAS environment variables carry a visibility setting. The Expo documentation defines them as:

| Visibility | What it means |
| --- | --- |
| **Plain text** | Visible on the website, in EAS CLI, and in logs |
| **Sensitive** | Obfuscated in EAS Build and Workflows job logs; readable on the website behind a toggle and readable in EAS CLI |
| **Secret** | Not readable outside of the EAS servers — not on the website, not in EAS CLI; obfuscated in job logs |

Every one of these describes **who can read the stored value**. None of them describes what
happens to the value after it is handed to a build job.

Expo's own documentation states the limit plainly: secrets "do not provide any additional
security for values that you end up embedding in your application itself."

### Environments

EAS supports three environments for variables — `development`, `preview` and `production` — and a
build profile in `eas.json` selects which one a build reads.

```json title=eas.json
{
  "cli": {"version": ">= 24.0.0"},
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview"
    },
    "production": {
      "autoIncrement": true,
      "environment": "production"
    }
  }
}
```

You can also set values directly in a profile's `env` block. Anything written there is in your
repository, so it must be non-secret by definition:

```json title=eas.json
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.example.com"
      }
    }
  }
}
```

### The line, drawn sharply

```text
   EAS secret store                build machine                    your app
  ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
  │ SENTRY_AUTH_TOKEN│─inject──▶│ used by a build  │          │  not present     │
  │ (secret)         │          │ step; not in JS  │          │       ✔          │
  ├──────────────────┤          ├──────────────────┤          ├──────────────────┤
  │ EXPO_PUBLIC_KEY  │─inject──▶│ Babel INLINES it │─bundle──▶│  string literal  │
  │ (secret)         │          │ into your JS     │          │       ✘          │
  └──────────────────┘          └──────────────────┘          └──────────────────┘
```

Both variables are stored as "secret". Only the first one stays secret, because only the first
one is never read by client code.

**What EAS environment variables DO protect:**

- The value is not in your git history, so a repository leak does not leak it.
- The value is not printed in build logs (obfuscated for `sensitive` and `secret`).
- A `secret` value cannot be read back by a teammate or by anyone who compromises an account
  with dashboard access.
- Access is centralised, so rotation is one operation rather than a search across machines.

**What they do NOT protect:**

- Anything the build writes into the JavaScript bundle — in particular every `EXPO_PUBLIC_*`
  variable, whatever its visibility setting.
- Anything written into `app.json`/`app.config.js` output that ships with the app.
- Anything a native config plugin bakes into `Info.plist`, `AndroidManifest.xml`, or a resource
  file. Those are inside the app archive.
- The value on the build machine itself. A build step you add can print it; a malicious
  dependency running in `postinstall` can read it from the environment.

### Verify which side of the line a variable is on

Do not reason about it — measure it. Build or export with the value set, then search the output.

```bash
EXPO_PUBLIC_API_KEY=CANARY_VALUE_42 npx expo export --platform android
grep -r -a -c "CANARY_VALUE_42" dist/
```

A non-zero count means the variable is inlined into the bundle and its EAS visibility setting is
irrelevant to its exposure. A zero count means the build consumed it and did not ship it.

## Common patterns

### A server-side proxy, with the key held by EAS only for deploys

The credential that must not ship lives in your backend's own secret store. EAS holds only the
values the *build* needs.

| Value | Where it belongs |
| --- | --- |
| Stripe secret key | Backend secret store. Never in the app, never in EAS. |
| Sentry auth token (source-map upload) | EAS, visibility `secret`. Used by a build step only. |
| Private npm registry token | EAS, visibility `secret`. Used by `npm install` during the build. |
| Public API base URL | `eas.json` `env`, or an EAS variable — it is not a secret. |
| OAuth public client ID | `eas.json` `env`. Public by design. |
| `google-services.json` / `GoogleService-Info.plist` | Provided to the build rather than committed, if your organisation treats it as sensitive. Note that it ends up inside the app archive either way. |

### Keep local and remote configuration consistent

`.env` files drive local development; EAS variables drive cloud builds. Two sources of truth
drift. Reduce the pain by:

- Committing a `.env.example` that lists every key with an empty value.
- Keeping secret-shaped values out of `.env` entirely, so a developer never has one on disk.
- Running `eas env:list` in a review step before a release build so nobody is surprised by a
  value that changed.

### Local builds read your shell, not EAS

`eas build --local` and `npx expo run:android` build on your machine using your environment.
A value that lives only in EAS is absent there, and a value that lives only in your shell is
absent in the cloud. Expect that asymmetry rather than debugging it twice.

## Security considerations

**Threat.** A team marks a third-party API key as an EAS `secret`, concludes it is protected, and
references it from client code as `EXPO_PUBLIC_PARTNER_KEY`. The key ships in every build.

**Exploit.**

```bash
npx expo export --platform android
grep -r -a -o "pk_partner_[A-Za-z0-9]*" dist/
```

The key comes straight out of the bundle. The EAS dashboard still shows it as unreadable, which
is exactly why the mistake survives review: the tooling's "secret" label is about the store, not
about the artifact.

**Fix.**

1. Remove the `EXPO_PUBLIC_` prefix so the value can no longer be inlined. The build will now
   fail or the feature will break — that is the point; it forces the redesign.
2. Move the call to your backend, which reads the key from its own secret store.
3. Rotate the key at the provider and revoke the old one. It shipped, so it is public.

**Verification.** Re-export and grep for the old value; expect zero hits. Then add the check to
CI so it cannot come back:

```yaml title=.github/workflows/no-secrets-in-bundle.yml
name: no-secrets-in-bundle
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx expo export --platform android
      - name: Fail on credential-shaped strings in the bundle
        run: |
          if grep -r -a -q -E "sk_live|sk_test|AKIA|BEGIN (RSA|EC) PRIVATE KEY" dist/; then
            echo "credential-shaped string found in exported bundle"
            exit 1
          fi
```

> [!WARNING] Build machines run your dependencies
> Every `postinstall` script in your dependency tree runs on the build machine with your
> environment variables in scope. That is a real path from a compromised package to your EAS
> secrets. Lockfiles, `npm ci`, and reviewing new dependencies are the mitigation — see
> [Dependency Auditing](dependency-auditing.md).

## Common mistakes

- **Believing "secret" visibility protects a shipped value.** It protects the stored value. The
  bundle is a separate artifact with separate exposure.
- **Prefixing a secret with `EXPO_PUBLIC_` to "make it available in the app".** The prefix is the
  mechanism that publishes it.
- **Putting secrets in `eas.json`'s `env` block.** `eas.json` is committed. Anything there is in
  your repository history.
- **Assuming a `sensitive` variable is hidden from your team.** It is readable in EAS CLI and
  behind a toggle on the website; only `secret` is not.
- **Forgetting that local builds do not see EAS variables.** `eas build --local` uses your shell
  environment.
- **Rotating without revoking.** Issuing a new key while the old one still works leaves the
  attacker's copy live.
- **Not scanning the artifact.** Source review misses values a dependency or a config plugin
  embeds. Scan `dist/` and the built app.

## Related topics

- [EXPO_PUBLIC_ Variables and the Leak They Cause](expo-public-env-vars.md) — the inlining mechanism, demonstrated.
- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — what else is readable in a shipped app.
- [eas.json and Build Profiles](../expo-eas/eas-json.md) — profile structure and the `env` block.
- [Build Profiles per Environment](../expo-build-and-release/environments.md) — mapping profiles to environments.
- [Costs and Limits](../expo-eas/costs-and-limits.md) — what EAS charges for, stated plainly.
- [Dependency Auditing](dependency-auditing.md) — the supply-chain path into your build machine.
- [Testing in CI](../expo-testing/ci.md) — where the bundle scan belongs in a pipeline.
