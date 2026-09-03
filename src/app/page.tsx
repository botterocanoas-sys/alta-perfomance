import { redirect } from "next/navigation";

import { sessaoAtual } from "@/lib/sessao-cookie";

export default async function Raiz() {
  const sessao = await sessaoAtual();
  redirect(sessao ? "/painel" : "/entrar");
}
