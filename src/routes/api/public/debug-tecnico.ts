import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debug-tecnico")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const url = process.env.SUPABASE_URL!;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const { data: linkData, error: linkErr } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: "valdinei@gmail.com",
          });
        if (linkErr)
          return Response.json({ step: "generateLink", error: linkErr.message });

        const props = linkData.properties;
        const verifyRes = await fetch(`${url}/auth/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anon },
          body: JSON.stringify({
            type: "magiclink",
            token: props?.email_otp,
            email: "valdinei@gmail.com",
          }),
        });
        const session = await verifyRes.json();
        const token = session.access_token;
        if (!token) return Response.json({ step: "verify", session });

        const rpcRes = await fetch(
          `${url}/rest/v1/rpc/technicians_directory`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anon,
              Authorization: `Bearer ${token}`,
            },
            body: "{}",
          },
        );
        const rpcBody = await rpcRes.json();

        return Response.json({ rpcStatus: rpcRes.status, rpcBody });
      },
    },
  },
});
