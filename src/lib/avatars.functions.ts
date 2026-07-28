import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const avatarPathsSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(300)).max(100),
});

/**
 * Generates short-lived signed URLs for avatar images in the private
 * `avatars` bucket. Storage RLS only lets each user read their own folder,
 * so this narrow, read-only bridge lets signed-in staff see colleagues'
 * photos (activity feed, assignees) without opening the bucket.
 */
export const getAvatarUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => avatarPathsSchema.parse(input))
  .handler(async ({ data }) => {
    const paths = [...new Set(data.paths)];
    if (paths.length === 0) return { urls: {} as Record<string, string> };

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: signed, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrls(paths, 60 * 60);
    if (error) throw new Error(error.message);

    const urls: Record<string, string> = {};
    for (const item of signed ?? []) {
      if (item?.path && item.signedUrl) urls[item.path] = item.signedUrl;
    }
    return { urls };
  });
