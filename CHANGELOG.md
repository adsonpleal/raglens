# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-05-18

### Adicionado

- Captura de pacotes via WinDivert em modo *sniff* (somente leitura,
  contrato herdado do ragmarket — sem injeção, sem leitura de memória,
  sem envio de pacotes ao servidor).
- Pipeline de despacho por opcode (`src-tauri/src/dispatch.rs`):
  - Walker de segmento TCP que fatia um pacote Ragnarok por iteração
    — opcodes de tamanho fixo via tabela (`fixed_packet_length`,
    25 entradas populadas), variáveis lendo o campo de length em
    offset 2-3.
  - Lookup `decoders::lookup(u16)` que cada decodificador novo
    registra.
  - Eventos Tauri tipados (`packet:<event-name>`) com payload `serde`.
- Decodificadores:
  - `0x0283` ZC_AID — extrai o account ID da conexão e o associa ao
    PID dono da 4-tupla.
  - `0x0a30` ZC_ACK_REQNAME_TITLE — extrai o nome do personagem
    (latin-1) e o associa ao AID; emite `client-updated` quando
    o mapeamento muda.
  - `0x0acc` ZC_NOTIFY_EXP — pacote de delta de XP. Emite
    `packet:exp-gain { pid, aid, delta, kind, from_quest }`.
  - `0x0acb` ZC_LONGPAR_CHANGE — totais correntes e limites do
    próximo nível (tipos 1/2/22/23). Emite `packet:exp-totals`.
- Identificação de cliente:
  - PID dono da 4-tupla resolvido via `GetExtendedTcpTable` no
    momento em que a conexão é observada pela primeira vez, e
    cacheado.
  - Painel **Clientes detectados** mostra uma linha por PID com
    fallback de label: `Tucano · AID 1031076 · PID 15916` →
    `AID 1031076 · PID 15916` → `Cliente · PID 15916` (com nome do
    executável e horário de abertura na linha secundária).
  - Filtro: clicar num cliente faz o Raglens processar só os
    pacotes daquele cliente para o opcode logger; o data path dos
    decoders sempre dispara (cada overlay filtra por seu próprio
    PID na frontend).
- Watcher de foreground (`foreground.rs`):
  - Poll de `GetForegroundWindow` + `GetWindowThreadProcessId` a
    cada 150 ms.
  - Emite `foreground-changed { pid }` só quando o PID muda.
  - Inicia no setup do app; tear-down no `RunEvent::Exit`.
- Logger dev de opcodes (`RAGLENS_LOG_OPCODES=1`):
  - Arquivo diário rotacionado em
    `%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`.
  - Uma linha por pacote Ragnarok (o walker fatia o segmento
    antes de gravar), não por segmento bruto.
  - Formato: `ISO ts | direção | client ↔ server | opcode | len | payload-hex`.
- Janela principal de controle (pt-BR):
  - Seletor de interface de rede (auto-escolhe primeira não-loopback,
    IP plumbed no filtro WinDivert).
  - Iniciar / Parar captura, contagem de pacotes em tempo real.
  - Painel **Clientes detectados** com radio de seleção e botão
    "Seguir todas".
  - Lista de addons com switch on/off, checkbox "Sempre visível",
    checkbox "Travado" e botão "Configurar" por addon. Mais um par
    de botões globais "Travar overlays" / "Destravar overlays".
- Infraestrutura de overlay multi-janela:
  - `spawnAddonOverlay` cria um `WebviewWindow` por addon habilitado
    (`alwaysOnTop`, `decorations:false`, `skipTaskbar`, `resizable`).
  - Click-through ("Travado") via `setIgnoreCursorEvents` do Tauri 2.
  - Drag JS-driven via `useDraggableWindow` (escapa do Aero Snap).
  - Posição e tamanho persistidos via `tauri-plugin-store` com
    debounce de 400 ms.
  - Visibility model: hidden quando não há cliente selecionado;
    quando há, segue o foreground do Windows (mostra quando o
    Ragexe associado ou o próprio Raglens está em foco). "Sempre
    visível" sobrepõe o foreground; o atalho global faz o
    `userHidden` toggle ortogonal.
- Modal de configuração por addon (botão **Configurar**):
  - Editor de atalho de teclado (sintaxe accelerator do Tauri,
    e.g. `Alt+Shift+E`, com botão "Padrão" pra voltar pro default
    do manifesto).
  - Seção específica por addon — para o XP meter:
    - Janela de tempo (radio group: 1 min / 5 min / 15 min /
      30 min / 1 h).
    - Visibilidade por linha (checkboxes pra cada uma das seis
      linhas do overlay).
- Atalho de teclado global por addon (`tauri-plugin-global-shortcut`):
  - Padrão `Alt+Shift+E` pro Medidor de Experiência (no manifesto).
  - Override por usuário persistido em `overlay.<id>.shortcut`.
  - Pressionar em qualquer janela (incluindo o cliente do RO)
    alterna `userHidden` daquele addon.
- Addon **Medidor de Experiência** (funcional):
  - Consumidor real de `packet:exp-gain` e `packet:exp-totals`.
  - Underlying rate computado sobre uma janela móvel de 5 min com
    denominador adaptativo — se ainda não há 5 min de gravação,
    divide pelo tempo real desde o primeiro sample (mín. 1 s pra
    evitar spike).
  - Seletor de janela é puramente multiplicador de display:
    `XP base/5min = (XP/min) × 5`, etc. ETA computa a partir do
    rate por minuto, independente do multiplicador.
  - Labels dinâmicos: `XP base/5min`, `% base/5min`, etc. ETAs
    como `Próximo base` / `Próximo job` (sem sufixo de janela).
- Workflow do GitHub Actions (`.github/workflows/release.yml`):
  - Build manual via `workflow_dispatch`.
  - Verifica coerência de versão (`package.json` ↔ `Cargo.toml` ↔ tag).
  - Roda `npm test` (Vitest) **e** `cargo test`.
  - Gera `SHA256SUMS.txt`.
  - `softprops/action-gh-release` pinado por SHA.
- Bundle: instalador NSIS único (`raglens-vX.Y.Z-setup.exe`) com
  WinDivert embutido.

### Robustez

- `start_capture(ipv4)` valida o input como dotted-quad antes de
  embutir na expressão de filtro WinDivert.
- `connections::observe` libera o mutex enquanto faz o syscall
  `GetExtendedTcpTable` — outras observações concorrentes não ficam
  bloqueadas atrás de uma chamada Win32 lenta.
- Race do recv/close eliminada herdando o padrão `Mutex<Option<usize>>`
  do ragmarket: `stop_capture` só sinaliza shutdown, o close acontece
  no thread de captura na saída do loop.
- `RunEvent::Exit` no `lib.rs` para tear-down limpo das threads de
  background (capture loop via `WinDivertShutdown`, foreground watcher
  via flag de running).
- `useAddonShortcuts` serializa o reconciler via promise chain
  + token counter — toggles rápidos não fazem duas reconciliações
  concorrentes mutarem o mesmo registry.
- Listener pattern com `aborted.current` herdado do ragmarket em
  todos os hooks que assinam eventos Tauri.

### Notas conhecidas

- **Transparência do overlay**: a janela do overlay tem fundo opaco
  (`rgba(15, 15, 20, 0.92)`) por ora. `transparent: true` no Tauri 2
  + WebView2 no Windows tem um bug upstream conhecido (tauri#4881,
  #8308, #8632, #10318, #12450) onde a janela renderiza com fundo
  escuro mesmo com `setBackgroundColor(null)` e CSS `background:
  transparent`. Tentamos várias abordagens (resize-nudge,
  `SetWindowCompositionAttribute` com `ACCENT_ENABLE_TRANSPARENTGRADIENT`,
  `DwmExtendFrameIntoClientArea` com margens -1, `shadow: false`) sem
  sucesso. Parked pra ser revisitado.
- **Reassembly TCP**: não fazemos reassembly. A maioria dos pacotes
  Ragnarok cabe num único segmento; um pacote que cruza fronteira
  de segmento é silenciosamente descartado pelo parse de opcode.
  Aceitável pros decoders atuais; o dia que doer, mover o reassembly
  pro `capture.rs` como buffer por-stream segue o mesmo padrão que o
  `useCapture.ts` do ragmarket usa na frontend.

[Unreleased]: https://github.com/adsonpleal/raglens/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/adsonpleal/raglens/releases/tag/v0.1.0
