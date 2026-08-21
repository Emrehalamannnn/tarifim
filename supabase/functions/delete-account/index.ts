// Deletes the calling user's ENTIRE account: their uploaded storage objects
// (post photos/videos, avatars), then the auth.users row itself — which
// cascades through profiles into posts, comments, likes, saves, follows,
// direct messages, feedback and subscriptions (every table references
// profiles with ON DELETE CASCADE — see supabase/schema.sql). Required by
// App Store Guideline 5.1.1(v): an app with account creation must offer
// in-app account deletion, and it must delete the account, not just a row.
//
// Runs server-side because auth.admin.deleteUser needs the service-role
// key, which must never reach the client. The only account it can ever
// delete is the one owning the JWT in the Authorization header.
//
// Deploy: supabase functions deploy delete-account
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USER_MEDIA_BUCKETS = ["post-photos", "post-videos", "avatars"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Storage objects don't cascade with the auth row, so clear the user's
    // folder in each bucket first (uploads are always keyed "<uid>/<file>").
    // A listing/removal failure here must not orphan the whole deletion —
    // log it and continue; the account itself is the thing that must go.
    for (const bucket of USER_MEDIA_BUCKETS) {
      const { data: files, error: listError } = await admin.storage
        .from(bucket)
        .list(user.id, { limit: 1000 });
      if (listError) {
        console.error(`delete-account: listing ${bucket}/${user.id} failed`, listError);
        continue;
      }
      if (files?.length) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) {
          console.error(`delete-account: removing from ${bucket} failed`, removeError);
        }
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("delete-account: deleteUser failed", deleteError);
      return json({ error: "Account deletion failed" }, 500);
    }

    return json({ deleted: true });
  } catch (err) {
    console.error("delete-account error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
