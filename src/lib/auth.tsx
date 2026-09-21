import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "tecnico"
  | "usuario"
  | "atendente"
  | "solicitante";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  cargo_setor: string | null;
  setor_id: string | null;
  avatar_url: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isTecnico: boolean;
  isAtendente: boolean;
  isSolicitante: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const signingOutRef = useRef(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile) ?? null);
    setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
  };

  const refresh = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return;
    sessionRef.current = data.session;
    setSession(data.session);
    setUser(data.session.user);
    await loadProfile(data.session.user.id);
  };

  useEffect(() => {
    let mounted = true;

    const acceptSession = (nextSession: Session) => {
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
      sessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextSession.user);
      setLoading(false);
    };

    const clearSession = () => {
      sessionRef.current = null;
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);
      setLoading(false);
    };

    const recoverSession = () => {
      if (recoveryTimerRef.current || signingOutRef.current) return;
      setLoading(true);
      recoveryTimerRef.current = setTimeout(async () => {
        recoveryTimerRef.current = null;
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!error && data.session) {
          acceptSession(data.session);
          await loadProfile(data.session.user.id);
          return;
        }

        const previous = sessionRef.current;
        if (previous?.refresh_token && navigator.onLine) {
          const { data: restored, error: restoreError } =
            await supabase.auth.setSession({
              access_token: previous.access_token,
              refresh_token: previous.refresh_token,
            });
          if (!mounted) return;
          if (!restoreError && restored.session) {
            acceptSession(restored.session);
            await loadProfile(restored.session.user.id);
            return;
          }
        }

        if (!navigator.onLine && previous) {
          acceptSession(previous);
          return;
        }
        clearSession();
      }, 1500);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (sess?.user) {
        acceptSession(sess);
        setTimeout(() => loadProfile(sess.user.id), 0);
        if (event === "SIGNED_IN") {
          // Registra Push (FCM) somente no app nativo; no-op na web.
          void import("@/hooks/useMobileFeatures").then((m) =>
            m.registerPushOnLogin(),
          );
        }
      } else if (signingOutRef.current) {
        clearSession();
      } else {
        recoverSession();
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        acceptSession(data.session);
        await loadProfile(data.session.user.id);
      } else {
        clearSession();
      }
    });

    const refreshOnResume = () => {
      if (document.visibilityState === "visible" && sessionRef.current) {
        void refresh();
      }
    };
    window.addEventListener("online", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);

    return () => {
      mounted = false;
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      window.removeEventListener("online", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    signingOutRef.current = true;
    await supabase.auth.signOut();
    sessionRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setLoading(false);
    signingOutRef.current = false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        isAdmin: roles.includes("admin"),
        isTecnico: roles.includes("tecnico"),
        isAtendente: roles.includes("atendente"),
        isSolicitante: roles.includes("solicitante"),
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
