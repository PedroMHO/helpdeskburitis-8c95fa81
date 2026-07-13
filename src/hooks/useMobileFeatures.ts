import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useMobileFeatures — serviço unificado de recursos nativos (Capacitor).
 * =====================================================================
 * Objetivo: isolar as chamadas aos plugins nativos (@capacitor/camera e
 * @capacitor/push-notifications) para que o mesmo código rode:
 *   - Como APK nativo (Capacitor.isNativePlatform() === true): usa a câmera
 *     nativa e registra o token de Push (FCM).
 *   - No navegador web (PWA/desktop/Android Chrome): ignora o Push
 *     silenciosamente e usa o fallback de <input type="file" capture>.
 *
 * Graceful degradation: todos os imports do Capacitor são dinâmicos e
 * protegidos por try/catch, de modo que o bundle web nunca quebre caso um
 * plugin não esteja disponível.
 */

/** Detecta se estamos rodando dentro do container nativo do Capacitor. */
export async function isNativePlatform(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Converte uma dataURL/URI em Blob para upload transparente ao Supabase. */
async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return await res.blob();
}

export interface CapturedPhoto {
  blob: Blob;
  fileName: string;
}

export function useMobileFeatures() {
  /**
   * Captura uma foto usando a câmera nativa quando disponível.
   * Retorna null quando não estiver rodando como app nativo — nesse caso o
   * chamador deve usar o fallback web (<input type="file" capture>).
   */
  const takeNativePhoto = useCallback(async (): Promise<CapturedPhoto | null> => {
    if (!(await isNativePlatform())) return null;
    try {
      const { Camera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
      const uri = photo.webPath ?? photo.path;
      if (!uri) return null;
      const blob = await uriToBlob(uri);
      return { blob, fileName: `foto-${Date.now()}.${photo.format || "jpg"}` };
    } catch {
      return null;
    }
  }, []);

  /**
   * Registra Push Notifications no dispositivo nativo e salva o token FCM
   * atrelado ao usuário na tabela `device_tokens`. No-op no navegador web.
   */
  const registerPushNotifications = useCallback(async (): Promise<void> => {
    if (!(await isNativePlatform())) return; // Web: ignora silenciosamente.
    try {
      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );
      const { Capacitor } = await import("@capacitor/core");

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") return;

      await PushNotifications.addListener("registration", async (token) => {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || !token?.value) return;
        await supabase.from("device_tokens").upsert(
          {
            user_id: uid,
            token: token.value,
            platform: Capacitor.getPlatform(),
          },
          { onConflict: "user_id,token" },
        );
      });

      await PushNotifications.addListener("registrationError", () => {
        // Falha de registro: ignora silenciosamente (sem Push neste device).
      });

      await PushNotifications.register();
    } catch {
      // Plugin indisponível ou erro nativo: degrade sem quebrar o app.
    }
  }, []);

  return { takeNativePhoto, registerPushNotifications, isNativePlatform };
}
