import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início | HelpDesk Buritis" },
      { name: "description", content: "Acesso ao sistema de chamados de informática de Buritis." },
      { property: "og:title", content: "Início | HelpDesk Buritis" },
      { property: "og:description", content: "Acesso ao sistema de chamados de informática de Buritis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
