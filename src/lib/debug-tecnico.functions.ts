import { createServerFn } from "@tanstack/react-start";

export const debugTecnico = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;

    // Generate a magic link (non-destructive) to obtain a session for a tecnico.
    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: "valdinei@gmail.com",
      });
    if (linkErr) return { step: "generateLink", error: linkErr.message };

    const props = linkData.properties;
    // Verify OTP to get an access token acting as the tecnico.
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
    if (!token) return { step: "verify", session };

    // Now call the RPC as the tecnico.
    const rpcRes = await fetch(`${url}/rest/v1/rpc/technicians_directory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      body: "{}",
    });
    const rpcBody = await rpcRes.json();

    const statusRes = await fetch(
      `${url}/rest/v1/technician_status?select=user_id,status,setor_id`,
      {
        headers: { apikey: anon, Authorization: `Bearer ${token}` },
      },
    );
    const statusBody = await statusRes.json();

    return {
      rpcStatus: rpcRes.status,
      rpcBody,
      statusStatus: statusRes.status,
      statusBody,
    };
  },
);
