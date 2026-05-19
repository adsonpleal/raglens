// Shared "como configurar o ntfy" help modal. Used by every addon
// whose settings expose an ntfy.sh push channel (pet-feeder,
// disconnect-notify, …). Stacked above the AddonSettingsModal
// (z-index 110 > base 100) so click-outside picks this one first.

import { Modal } from "./Modal";

type Props = {
  onClose: () => void;
  /** Topic example tailored to the addon (e.g. "pet-abelha-rainha-x7k2").
   *  Shown in step 2 so users see a realistic name for their use case. */
  topicExample: string;
};

export function NtfyHelpModal({ onClose, topicExample }: Props) {
  return (
    <Modal title="Como configurar o ntfy" onClose={onClose} zIndex={110}>
      <section className="modal-section">
        <p>
          <strong>ntfy</strong> é um serviço gratuito de notificações
          por push. O Raglens envia uma mensagem para um{" "}
          <em>tópico</em> e o app do ntfy no seu celular recebe e
          mostra como notificação — sem cadastro, sem chave de API.
        </p>
        <ol className="modal-numbered">
          <li>
            Instale o app <strong>ntfy</strong> no celular:
            <ul>
              <li>
                Android: na Play Store ou em{" "}
                <code>https://ntfy.sh/app</code>
              </li>
              <li>iOS: na App Store, busque por “ntfy”</li>
            </ul>
          </li>
          <li>
            No app, toque em <strong>“Subscribe to topic”</strong> e
            escolha um <strong>nome único</strong>. Qualquer pessoa
            que souber o nome recebe as suas notificações, então
            trate como uma senha curta (ex:{" "}
            <code>{topicExample}</code>) — evite nomes óbvios.
          </li>
          <li>
            Cole o mesmo nome no campo <strong>“Tópico ntfy”</strong>{" "}
            aqui no Raglens e marque o toggle do canal Push. Pronto.
          </li>
        </ol>
        <p className="muted modal-hint">
          O servidor padrão é o público <code>ntfy.sh</code>. Mais
          informações em <code>https://docs.ntfy.sh</code>.
        </p>
      </section>
    </Modal>
  );
}
