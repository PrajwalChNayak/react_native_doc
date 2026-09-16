/**
 * The public surface a consuming app imports.
 *
 * Apps should not import `./specs/NativeDeviceMetadata` directly. Keeping a
 * wrapper here means you can add argument validation, caching or a JS-side
 * fallback without changing every call site, and it keeps the Codegen spec
 * free of anything Codegen cannot parse.
 */

import NativeDeviceMetadata from './specs/NativeDeviceMetadata';
import type {Spec} from './specs/NativeDeviceMetadata';

export type DeviceMetadataModule = Spec;

/** The device's name, as the OS reports it. */
export function getDeviceName(): string {
  return NativeDeviceMetadata.getDeviceName();
}

/** Total physical RAM in bytes. */
export function getTotalMemoryBytes(): number {
  return NativeDeviceMetadata.getTotalMemoryBytes();
}

/** Total physical RAM in whole mebibytes, rounded down. */
export function getTotalMemoryMiB(): number {
  return Math.floor(NativeDeviceMetadata.getTotalMemoryBytes() / (1024 * 1024));
}

/**
 * Whether the OS is currently in a battery-saving mode.
 *
 * Worth treating as a hint rather than a fact: the two platforms mean slightly
 * different things by it (see the README's platform differences table), and on
 * Android the value can change while your app is running.
 */
export function isLowPowerModeEnabled(): Promise<boolean> {
  return NativeDeviceMetadata.isLowPowerModeEnabled();
}

/**
 * Attach a short tag to this module's native log output.
 *
 * Fire-and-forget: the spec declares `void`, so JS neither waits for the call
 * nor learns if it failed.
 */
export function setDebugTag(tag: string): void {
  NativeDeviceMetadata.setDebugTag(tag);
}

export default NativeDeviceMetadata;
