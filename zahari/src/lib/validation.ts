export const PASSWORD_HELP =
  "Use 7–18 characters, including a letter and a number.";
export const PASSCODE_HELP =
  "Use exactly 8 lowercase letters or numbers. Keep it somewhere safe.";
export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export function validUsername(value: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(value);
}
export function validPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 7 &&
    value.length <= 18 &&
    /[a-z]/i.test(value) &&
    /\d/.test(value)
  );
}
export function validPasscode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{8}$/.test(value);
}
