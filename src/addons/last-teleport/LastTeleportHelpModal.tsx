// Help modal explaining how the two windows work, where the map
// image comes from, what the Prev/Next/Copy buttons do, and the
// locked-state semantics. Opens on top of the addon settings modal
// (z-index 110) via the "?" button on the addon row in the main
// window, or from inside the settings modal.

import { Modal } from "../../components/Modal";

type Props = {
  onClose: () => void;
};

export function LastTeleportHelpModal({ onClose }: Props) {
  return (
    <Modal title="Como funciona — Última Localização" onClose={onClose} zIndex={110}>
      <section className="modal-section">
        <p>
          Este addon registra os últimos pontos onde você teleportou e
          desenha marcadores sobre a imagem do mapa atual. Útil para
          voltar rapidamente a um lugar onde ficou um item, um MVP
          vivo, uma carta no chão, etc.
        </p>
        <p>
          O addon é dividido em <strong>duas janelas</strong>:
        </p>
        <ul className="modal-checklist">
          <li>
            <span>
              <strong>Última Localização — Mapa:</strong> mostra a
              imagem do mapa em que você está agora, com os
              marcadores de teleporte por cima. Coloque em qualquer
              lugar da tela, em qualquer tamanho — a proporção
              acompanha o mapa carregado.
            </span>
          </li>
          <li>
            <span>
              <strong>Última Localização — Controles:</strong> janela
              pequena, livre pra você posicionar onde quiser. Contém
              os botões (Anterior, Próximo, Copiar /navi) e o rótulo
              da localização ativa.
            </span>
          </li>
        </ul>
        <p className="muted modal-hint">
          As duas janelas se comunicam entre si (selecionar um ponto
          nos controles destaca o marcador no mapa). Você pode
          habilitar só uma delas se quiser.
        </p>
      </section>

      <section className="modal-section">
        <h3>De onde vem a imagem do mapa</h3>
        <p>
          As imagens são baixadas do{" "}
          <code>divine-pride.net</code> na primeira vez que você
          visita cada mapa e ficam salvas em disco
          (<code>map-images/</code> dentro da pasta de dados do
          Raglens). Nas visitas seguintes a imagem carrega
          instantaneamente, mesmo offline. Se um mapa não tiver
          imagem disponível, o fundo fica transparente — os
          marcadores continuam aparecendo no lugar certo, só sem o
          mapa por baixo.
        </p>
      </section>

      <section className="modal-section">
        <h3>Atalhos de teclado</h3>
        <p>
          As três ações (Anterior, Próximo, Copiar /navi) têm atalhos
          globais configuráveis nas configurações do addon. Globais
          significa que funcionam mesmo com o jogo em foco — você não
          precisa alt-tabar pro Raglens. Os padrões são{" "}
          <code>Alt+Shift+Left</code>, <code>Alt+Shift+Right</code> e{" "}
          <code>Alt+Shift+C</code>.
        </p>
      </section>

      <section className="modal-section">
        <h3>Botões</h3>
        <ul className="modal-checklist">
          <li>
            <span>
              <strong>◀ Anterior</strong> — seleciona uma localização
              mais antiga no histórico. O marcador ativo muda de cor.
            </span>
          </li>
          <li>
            <span>
              <strong>▶ Próximo</strong> — seleciona uma localização
              mais recente. Quando chegar no topo da pilha, fica
              desabilitado.
            </span>
          </li>
          <li>
            <span>
              <strong>📋 Copiar</strong> — copia para a área de
              transferência um comando no formato{" "}
              <code>/navi mapa X/Y</code> com a localização ativa. Cole
              no chat do jogo e o Navi te guia até lá.
            </span>
          </li>
        </ul>
        <p className="muted modal-hint">
          <strong>Importante:</strong> o Raglens nunca envia comandos
          para o jogo — apenas escuta os pacotes que chegam. Os botões
          movem só o cursor do histórico aqui no overlay; quem cola o
          comando no chat é você.
        </p>
      </section>

      <section className="modal-section">
        <h3>Estado bloqueado</h3>
        <ul className="modal-checklist">
          <li>
            <span>
              <strong>Mapa bloqueado:</strong> a janela vira
              click-through total — cliques passam para o que estiver
              embaixo dela na tela. Para mover ou redimensionar,
              desbloqueie no menu do addon.
            </span>
          </li>
          <li>
            <span>
              <strong>Controles bloqueados:</strong> a janela não
              arrasta nem redimensiona, mas os botões continuam
              clicáveis. A área de fundo dela absorve cliques (não
              passa pro que estiver embaixo).
            </span>
          </li>
        </ul>
      </section>
    </Modal>
  );
}
