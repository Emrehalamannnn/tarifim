// Deterministic placeholder follower/following counts, derived from a seed
// string (e.g. the user's name) so they don't change on every render. There
// is no backend/social graph — see CLAUDE.md "Mocked auth & social features".
export function mockSocialStats(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return {
    followers: 20 + (h % 480),
    following: 10 + ((h >> 3) % 150),
  };
}

export function initialsFrom(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
