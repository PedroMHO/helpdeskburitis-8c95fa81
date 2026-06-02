import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Headset, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso — Chamados Informática Buritis" },
      {
        name: "description",
        content:
          "Entre ou cadastre-se no sistema de chamados de informática Buritis.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) return toast.error("Falha no login", { description: error.message });
    navigate({ to: "/dashboard", replace: true });
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: String(form.get("full_name")) },
      },
    });
    setBusy(false);
    if (error) return toast.error("Falha no cadastro", { description: error.message });
    toast.success("Conta criada!", { description: "Você já pode acessar o sistema." });
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary to-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Headset className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            Chamados Informática Buritis
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema corporativo de helpdesk
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="l-email">E-mail</Label>
                  <Input id="l-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="l-pass">Senha</Label>
                  <Input id="l-pass" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="s-name">Nome completo</Label>
                  <Input id="s-name" name="full_name" type="text" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-email">E-mail</Label>
                  <Input id="s-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-pass">Senha</Label>
                  <Input
                    id="s-pass"
                    name="password"
                    type="password"
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Novos cadastros entram como Usuário Comum. Papéis de Técnico e
          Administrador são definidos por um administrador.
        </p>
      </div>
    </div>
  );
}
