// Lightweight password-strength heuristic — no external dependency (a
// zxcvbn-style library is heavier than this MVP needs). Scores 0-4 across a
// handful of independent signals; used by both the strength meter UI and to
// gate signup submission (LoginPanel won't call signUpWithPassword below
// MIN_SCORE).
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "password", "password1", "qwerty123",
  "11111111", "abc12345", "letmein1", "iloveyou", "admin123",
  "welcome1", "monkey123", "1q2w3e4r", "sunshine1", "princess1",
]);

export const MIN_PASSWORD_LENGTH = 8;

export function getPasswordStrength(password) {
  const value = password ?? "";

  if (value.length === 0) {
    return { score: 0, label: "", tooShort: false };
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: "Çok kısa", tooShort: true };
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return { score: 0, label: "Çok yaygın", tooShort: false };
  }

  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;

  score = Math.min(score, 4);

  const labels = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü"];
  return { score, label: labels[score], tooShort: false };
}

// Minimum bar for allowing signup at all — length + not-a-common-password
// is the floor; the meter above communicates the rest as a nudge, not a hard
// gate, so we don't force esoteric complexity rules on people.
export function isPasswordStrongEnough(password) {
  const { score, tooShort } = getPasswordStrength(password);
  return !tooShort && score >= 2;
}
