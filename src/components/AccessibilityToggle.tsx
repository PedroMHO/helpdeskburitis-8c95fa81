import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "a11y-readable-mode";

function applyMode(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("readable-mode", enabled);
}

export function AccessibilityToggle() {
  const [enabled, setEnabled] = useState(false);

  // Carrega a preferência salva ao montar.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) === "1";
    setEnabled(saved);
    applyMode(saved);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    applyMode(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={
        enabled
          ? "Desativar modo de alto contraste"
          : "Ativar modo de alto contraste e reduzir desfoque"
      }
      title={enabled ? "Modo legível ativado" : "Modo legível (acessibilidade)"}
    >
      {enabled ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </Button>
  );
}
