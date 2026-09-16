/**
 * Validates eas.json against the schema eas-cli itself uses, without an Expo
 * account, a login or a network call.
 *
 * `@expo/eas-json` is the package eas-cli reads eas.json with. Resolving every
 * build and submit profile through it runs the same schema validation and
 * `extends` resolution a real `eas build` would, so a typo in a field name
 * fails here instead of in a paid build queue.
 *
 *   node scripts/validate-eas-json.mjs
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {EasJsonAccessor, EasJsonUtils} from '@expo/eas-json';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORMS = ['android', 'ios'];

async function main() {
  const accessor = EasJsonAccessor.fromProjectPath(ROOT);
  let failures = 0;

  const cli = await EasJsonUtils.getCliConfigAsync(accessor);
  console.log('cli:', JSON.stringify(cli));

  const buildProfiles = await EasJsonUtils.getBuildProfileNamesAsync(accessor);
  console.log(`\nbuild profiles: ${buildProfiles.join(', ')}`);

  for (const name of buildProfiles) {
    for (const platform of PLATFORMS) {
      try {
        const profile = await EasJsonUtils.getBuildProfileAsync(accessor, platform, name);
        const warnings = await EasJsonUtils.getBuildProfileDeprecationWarningsAsync(accessor, platform, name);
        const summary = {
          distribution: profile.distribution,
          developmentClient: profile.developmentClient ?? false,
          channel: profile.channel,
          autoIncrement: profile.autoIncrement ?? false,
          ...(platform === 'android' && profile.buildType ? {buildType: profile.buildType} : {}),
          env: profile.env,
        };
        console.log(`  OK   ${name.padEnd(12)} ${platform.padEnd(8)} ${JSON.stringify(summary)}`);
        for (const warning of warnings) console.log(`       deprecation: ${warning.message}`);
      } catch (error) {
        failures++;
        console.log(`  FAIL ${name.padEnd(12)} ${platform.padEnd(8)} ${error.message}`);
      }
    }
  }

  const submitProfiles = await EasJsonUtils.getSubmitProfileNamesAsync(accessor);
  console.log(`\nsubmit profiles: ${submitProfiles.join(', ')}`);
  for (const name of submitProfiles) {
    for (const platform of PLATFORMS) {
      try {
        await EasJsonUtils.getSubmitProfileAsync(accessor, platform, name);
        console.log(`  OK   ${name.padEnd(12)} ${platform}`);
      } catch (error) {
        failures++;
        console.log(`  FAIL ${name.padEnd(12)} ${platform.padEnd(8)} ${error.message}`);
      }
    }
  }

  console.log(failures ? `\n${failures} profile(s) failed validation.` : '\neas.json: OK');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(`eas.json could not be read: ${error.message}`);
  process.exit(1);
});
