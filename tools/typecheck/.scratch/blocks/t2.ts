import * as Keychain from 'react-native-keychain';

export async function save(u: string, p: string) {
  await Keychain.setGenericPassword(u, p, {
    service: 'x',
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
  });
  const r = await Keychain.getGenericPassword({service: 'x', authenticationPrompt: {title: 'a', cancel: 'b'}});
  if (r) { console.log(r.username, r.storage); }
  await Keychain.resetInternetCredentials({server: 'https://example.com'});
  const t = await Keychain.getSupportedBiometryType();
  console.log(t === Keychain.BIOMETRY_TYPE.FACE_ID);
}
