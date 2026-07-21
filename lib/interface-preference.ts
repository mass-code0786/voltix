export const interfacePreferenceCookie = "voltix_interface";
export const interfacePreferenceStorageKey = "voltix-interface";

export type InterfacePreference = "current" | "clean";

export function parseInterfacePreference(value: string | null | undefined): InterfacePreference {
  return value === "clean" ? "clean" : "current";
}
