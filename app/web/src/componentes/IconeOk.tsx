/**
 * Ok e Não ok em ícone redondo (pedido de 25/10): círculo verde com o visto e círculo vermelho com o X. Sem emoji: é um
 * SVG, igual em qualquer aparelho. `apagado` = o botão ainda não escolhido (contorno cinza).
 */
export default function IconeOk({ ok, apagado = false, tamanho = 22 }: { ok: boolean; apagado?: boolean; tamanho?: number }) {
  const classe = `icone-ok ${ok ? "icone-ok-sim" : "icone-ok-nao"}${apagado ? " icone-ok-apagado" : ""}`;
  return (
    <svg className={classe} width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" />
      {ok ? <path d="M7 12.5l3.2 3.2L17 9" /> : <path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" />}
    </svg>
  );
}
