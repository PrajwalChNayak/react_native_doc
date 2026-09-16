---
title: EAS Update Signing
description: Code signing for expo-updates — why an unsigned update channel lets whoever can publish run code on every install, how to configure updates.codeSigningCertificate, and what key management costs you.
status: current
toolchain: expo
sdk: 57
---

An EAS update is **executable JavaScript** delivered to apps that are already installed. Once an
app accepts it, that code runs with everything your app has: the user's session, SecureStore
entries, camera and location permissions, your API.

Without code signing, an installed app accepts any update your update server serves for its channel
and runtime version. The practical meaning: **whoever can publish to your channel can run code on
every install**. Code signing adds a second requirement: the update must also be signed by a
private key whose certificate is baked into the binary.

## Why it exists / when to use it — and when NOT to

Use code signing when a malicious update would be severe — which is true for most apps that handle
accounts, payments or personal data — and when your team can manage a private key properly.

It protects you against:

- A compromised Expo account, leaked `EXPO_TOKEN`, or over-broad CI access publishing an update.
- An insider or a compromised CI job publishing code that did not go through your release process.
- A self-hosted update server being compromised, if you use one.

It does **not** protect you against:

- Malicious code that reaches the update **through your own build**: a compromised dependency is
  signed along with everything else. See [Dependency Auditing](dependency-auditing.md).
- Theft of the signing private key itself.
- Anything in the store binary. The binary is protected by store signing, a separate system.

> [!NOTE] Plan requirement
> Expo's code signing documentation states that EAS Update Code Signing is only available to
> accounts subscribed to the EAS Production or Enterprise plans. Check the current plan terms on
> docs.expo.dev before you design around it — see [Costs and Limits](../expo-eas/costs-and-limits.md).

## Basic example

Everything here uses the `expo-updates` CLI shipped inside `expo-updates` **57.0.22** (SDK 57
resolves `~57.0.22`). The commands and flags below were read from that installed package.

**1. Generate a key pair and a self-signed certificate.** Put the key directory **outside** the
repository.

```bash
npx expo-updates codesigning:generate \
  --key-output-directory ../keys \
  --certificate-output-directory certs \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "Example Ltd"
```

This writes `private-key.pem` and `public-key.pem` into `../keys` and `certificate.pem` into
`certs/`. The certificate is public and belongs in the repository; the private key does not.

**2. Configure the project.**

```bash
npx expo-updates codesigning:configure \
  --certificate-input-directory certs \
  --key-input-directory ../keys
```

It validates that the certificate matches the key pair, then writes the signing fields into your app
config:

```json title=app.json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "codeSigningCertificate": "./certs/certificate.pem",
      "codeSigningMetadata": {
        "keyid": "main",
        "alg": "rsa-v1_5-sha256"
      }
    }
  }
}
```

The installed `@expo/config-types` for SDK 57 defines exactly these keys:
`updates.codeSigningCertificate` is the local path to a PEM-formatted X.509 certificate, and "when
provided, all updates downloaded by expo-updates must be signed". `codeSigningMetadata.alg` accepts
only `rsa-v1_5-sha256`; `keyid` defaults to `main` when the configure command writes it (the
command also accepts `--keyid`).

**3. Build a new binary.** The certificate is native configuration. Existing installs do not have
it and will keep accepting unsigned updates until they install a build that does.

```bash
eas build --platform all --profile production
```

**4. Publish signed updates.**

```bash
eas update --branch production --message "fix checkout crash" --private-key-path ../keys/private-key.pem
```

`--private-key-path` is a verified `eas update` flag in eas-cli 24.5.0.

> [!NOTE] Expo Go vs development build
> `expo-updates` is native and Expo Go cannot exercise it. Test signed updates on a `preview` or
> `production` build.

## How it works

### The trust chain

```text
build time                                    publish time                       launch time
certs/certificate.pem  ── baked into ──▶  binary
                                          private-key.pem ── signs ──▶ update manifest
                                                                         │
                                          binary downloads manifest ◀────┘
                                          verifies signature against the embedded certificate
                                          valid → apply        invalid or missing → reject
```

Expo's documentation summarises the client rule: the update is applied if the certificate and
signature are valid, and rejected otherwise.

### Why an unsigned channel is a supply-chain risk

Without signing, the only thing standing between an attacker and code execution on every install
is **publish access**:

| Who can publish | How they get it |
| --- | --- |
| Anyone with your Expo account | Password reuse, phishing, a missing second factor |
| Anyone with a robot/access token | `EXPO_TOKEN` in a CI log, a leaked `.env`, a former contractor |
| Any CI job that has the token | A malicious pull request to a workflow with secrets, a compromised action |

Every one of those ships code to production in minutes, bypassing store review — which is exactly
the property that makes updates useful.

With signing, publish access is necessary but not sufficient. The attacker also needs the private
key. If you keep that key off the CI machine that holds `EXPO_TOKEN` (for example, only on a
release machine or in a separate secret store used by a protected release job), compromising one
does not give them the other.

### Signing does not replace account security

Keep doing the basics: two-factor authentication on the Expo account, narrowly scoped robot
tokens, and protected release workflows. Signing is the second lock, not the only one.

## Operational cost

Code signing turns "can we publish an update" into "do we still have the key". Plan for these.

### You now own a private key

- **Storage.** The key must exist somewhere your release process can use it and an attacker cannot
  reach. A secret store with audited access is the usual answer. A developer laptop is not.
- **Access.** Decide who can sign. Fewer people and fewer machines is safer and slower.
- **Backup.** Keep an offline, access-controlled backup.

### Losing the key

If you lose the private key, you **cannot publish updates to any binary that embeds the matching
certificate**. Those installs are frozen on their current update until users install a new build
with a new certificate. Recovery is a store release, not a quick fix.

### Key compromise

If the private key leaks, every binary embedding its certificate will accept updates the attacker
signs — assuming they also obtain publish access. You cannot revoke the certificate inside installed
binaries. The fix is a new key, a new certificate, a new binary, and waiting for users to update.

### Certificate validity and rotation

`--certificate-validity-duration-years` sets how long the certificate is valid. Expo's
documentation notes that updates downloaded before a certificate expires continue to work, and it
describes rotation as: back up the old keys, generate new ones, set a **new runtime version** for
builds with the new certificate, and publish to that runtime with the new key. Rotation therefore
always involves a new binary.

A long validity period means fewer forced rotations and a longer window if the key is compromised.
Pick a duration you will actually rotate within, and put the expiry date on a calendar.

## Common patterns

### Keep the certificate in the repo, the key in the release job only

```yaml title=.github/workflows/update.yml
name: publish-update
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: production-release   # protected environment with required reviewers
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - name: Write signing key from secret
        run: |
          mkdir -p "$RUNNER_TEMP/keys"
          printf '%s' "$UPDATES_PRIVATE_KEY" > "$RUNNER_TEMP/keys/private-key.pem"
        env:
          UPDATES_PRIVATE_KEY: ${{ secrets.UPDATES_PRIVATE_KEY }}
      - run: npx eas-cli@24.5.0 update --branch production --message "${{ github.sha }}" --private-key-path "$RUNNER_TEMP/keys/private-key.pem" --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

Scope both secrets to the protected environment so a pull request workflow never sees them.

### Check the repository never gained the key

```gitignore title=.gitignore
keys/
private-key.pem
```

```bash
git log --all --full-history --name-only -- '*private-key.pem'
```

Any output means the key is in history. Treat it as compromised.

## Security considerations

**Threat.** An attacker who gains publish access to your update channel ships JavaScript that reads
session tokens from SecureStore and sends them to a server they control. Every install that opens
the app runs it.

**Exploit.** Without signing, the attack is an ordinary publish with a stolen token:

```bash
EXPO_TOKEN=<stolen token> npx eas-cli@24.5.0 update --branch production --message "minor fixes" --non-interactive
```

Nothing on the device distinguishes this update from yours.

**Fix.** Configure code signing as above, ship a new binary, keep the private key away from the
systems that hold publish access, and protect the account and tokens.

**Verification.** Prove the client rejects an update not signed by **your** key. Do it on a test
channel with a preview build that embeds your certificate:

1. Generate a second, unrelated key pair to play the attacker:

   ```bash
   npx expo-updates codesigning:generate \
     --key-output-directory ../attacker-keys \
     --certificate-output-directory ../attacker-certs \
     --certificate-validity-duration-years 1 \
     --certificate-common-name "Attacker"
   ```

2. Publish a visibly different update to the test branch, signed with the attacker key:

   ```bash
   eas update --branch signing-test --message "should be rejected" --private-key-path ../attacker-keys/private-key.pem
   ```

3. Cold-start the preview build twice. It must **not** show the change. Surface
   `Updates.updateId` on a debug screen, or read `Updates.readLogEntriesAsync()`, and confirm the
   running update did not change.
4. Publish the same change signed with your real key. It must apply.

If step 3 shows the change, the binary is not enforcing signing — most often because it was built
before `codeSigningCertificate` was added.

## Common mistakes

- **Configuring signing and publishing to old binaries.** Binaries built before the certificate was
  added do not verify anything. Signing protects only builds that embed the certificate.
- **Committing `private-key.pem`.** The certificate is public; the key is the whole control. Keep the
  key directory outside the repository, as the generate command's example output directory does.
- **Storing the signing key next to `EXPO_TOKEN` in the same CI secret scope.** One compromise then
  yields both. Separate them.
- **No backup of the key.** Losing it freezes every signed install until a new binary ships.
- **Forgetting certificate expiry.** Put the date in a calendar and plan the new-runtime-version
  rotation well before it.
- **Treating signing as dependency protection.** A compromised package is signed along with your
  code. Audit dependencies separately.
- **Assuming signing is available on every plan.** Check the plan requirement first.

## Related topics

- [EAS Update](../expo-eas/update.md) — the update system this secures.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — why rotation needs a new runtime version.
- [Credentials Management](../expo-eas/credentials.md) — the store signing credentials, a separate system.
- [Dependency Auditing](dependency-auditing.md) — what signing cannot catch.
- [EAS Secrets and Build-Time Variables](eas-secrets.md) — where CI secrets live.
- [Rollback Strategy](../expo-build-and-release/rollback-strategy.md) — recovering from a bad update, signed or not.
