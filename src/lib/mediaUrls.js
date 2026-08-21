import { supabase, supabaseUrl } from "./supabase";

// post-photos/post-videos are private buckets (see supabase/schema.sql) —
// getPublicUrl() still returns a `.../object/public/<bucket>/<path>`-shaped
// string (it's just string building, not a network call), but that URL no
// longer resolves on its own. This turns it back into a short-lived signed
// URL the caller is actually authorized to read, per the storage SELECT
// policy. Non-storage values (local /images/... paths for official posts,
// null) pass through untouched.
const PUBLIC_PREFIX = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/` : null;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function parseStorageUrl(url) {
  if (!PUBLIC_PREFIX || typeof url !== "string" || !url.startsWith(PUBLIC_PREFIX)) return null;
  const rest = url.slice(PUBLIC_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return null;
  return { bucket: rest.slice(0, slashIndex), path: rest.slice(slashIndex + 1) };
}

// Resolves a list of possibly-null/possibly-external URLs in one batch
// (one createSignedUrls call per distinct bucket) and returns a lookup
// function from original URL -> resolved URL.
export async function resolveMediaUrls(urls) {
  const byBucket = new Map();
  for (const url of urls) {
    const parsed = parseStorageUrl(url);
    if (!parsed) continue;
    if (!byBucket.has(parsed.bucket)) byBucket.set(parsed.bucket, []);
    byBucket.get(parsed.bucket).push(parsed.path);
  }

  const signedByUrl = new Map();
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error || !data) continue;
    for (const entry of data) {
      if (entry.signedUrl) signedByUrl.set(`${PUBLIC_PREFIX}${bucket}/${entry.path}`, entry.signedUrl);
    }
  }

  return (url) => signedByUrl.get(url) ?? url;
}
