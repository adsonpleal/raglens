# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.5.0] - 2026-06-09

### Adicionado

- **Minimizar para a bandeja**: a janela principal agora pode ser
  recolhida para a bandeja do sistema (system tray) sem encerrar o app,
  então os overlays dos addons continuam funcionando sobre o jogo
  enquanto o Raglens fica fora do caminho. Tanto o botão de minimizar
  quanto o de fechar (X) escondem a janela na bandeja em vez de sair; um
  ícone na bandeja oferece o menu **"Mostrar Raglens"** para restaurar
  (clicar no ícone com o botão esquerdo também restaura) e **"Sair"**
  para realmente encerrar o app.

  A janela é escondida, e não fechada, de propósito: o webview da janela
  principal continua vivo, então o watcher de foreground e a lógica de
  visibilidade do `OverlayHost` seguem controlando os overlays sobre o
  jogo normalmente. Como o Tauri não tem um evento de minimizar próprio,
  o caminho de minimizar reage ao `Resized` e verifica `is_minimized()`;
  ao restaurar, a sequência é `unminimize` → `show` → `set_focus`, o que
  cobre tanto a janela fechada quanto a minimizada. O encerramento ainda
  passa por `app.exit(0)`, preservando a limpeza existente em
  `RunEvent::Exit` (parada da captura e dos watchers).

## [0.4.0] - 2026-06-09

### Adicionado

- **Seguir janela**: uma nova opção, disponível em todos os addons com
  overlay e **ligada por padrão**, que ancora a posição de cada overlay
  em relação à janela do cliente Ragnarok. Ao arrastar a janela do jogo
  pela tela, os overlays acompanham o movimento mantendo o mesmo
  deslocamento relativo — o layout que você montou não se desfaz quando
  a janela muda de lugar. Um watcher em segundo plano
  (`window_rect.rs`) acompanha o retângulo da janela do jogo em primeiro
  plano e emite `game-window-rect-changed`; cada overlay visível se
  translada pelo mesmo delta. A cadência de leitura é adaptativa: ~60 Hz
  enquanto a janela está em movimento e cai para 100 ms depois de meio
  segundo parada, então o custo em repouso é praticamente nulo.

  A janela do jogo é identificada pelo foreground + título/classe
  "Ragnarok", e **não** pelo PID, de propósito: a proteção de pacotes do
  latamRO falsifica o `GetWindowThreadProcessId` da janela do jogo (ela
  reporta PID 0) e o processo dono do socket de rede (Ragexe) não possui
  janela nenhuma, então não existe vínculo confiável PID → janela. Cada
  amostra é marcada pelo HWND (token), o que faz os overlays
  re-referenciarem a base ao invés de pularem quando o foco alterna
  entre clientes diferentes (multi-cliente: as duas janelas compartilham
  o mesmo título). Overlays escondidos não se movem, então não derivam
  seguindo a janela de outro cliente enquanto não estão à vista.

## [0.3.0] - 2026-05-22

### Adicionado

- Addon **Informações de Mascote**: a linha que antes mostrava o nível
  do mascote (informação inútil — o número não muda depois que o pet
  para de evoluir) agora mostra **quantas unidades da comida do
  mascote ativo você tem no inventário**. Atualiza ao vivo durante a
  sessão: cada feed decrementa o contador, e o reabastecimento (compra
  na NPC, drop de monstro etc.) reflete na próxima dump de inventário.
  O chip aparece como `Comida: N`; quando o mascote ainda não foi
  identificado (você não abriu o menu de informações do pet desde a
  seleção de personagem) ou quando o servidor latamRO usa um sprite
  customizado que não está na base do rathena, o chip mostra `Comida:
  —` até a primeira alimentação ensinar a relação mascote → comida
  (veja abaixo).

- **Aprendizado automático de mascotes customizados do latamRO**:
  a tabela de comidas embutida no Raglens é gerada a partir do
  `pet_db.yml` oficial do rathena (105 mascotes vanilla), o que cobre
  os mascotes clássicos como Poring, Lunatic e Drops mas perde os
  sprites customizados que o latamRO adicionou (IDs na faixa
  22000+). Pra esses casos, o decoder do `ZC_FEED_PET` (0x01a3 — o
  pacote de confirmação que o servidor envia quando uma alimentação é
  bem-sucedida, carregando o ID da comida consumida) aprende o par
  (sprite do mascote → ID da comida) na primeira vez que você
  alimenta o pet, persiste em `raglens.json` sob
  `addon.pet-feeder.foods`, e usa esse mapeamento em todas as sessões
  futuras. Resultado: o usuário alimenta uma vez manualmente e o chip
  passa a funcionar pra sempre, sem precisar de atualização do
  Raglens cada vez que o servidor adiciona um pet novo.

- **Notificação "Pouca comida"**: novo evento da matriz de
  notificações (push + Windows toast) que dispara uma vez quando o
  contador de comida cai pra ≤ 10 unidades. O latch só rearma quando
  o contador volta a subir acima do limiar (alimentado após
  reabastecer), então o alerta não se repete a cada feed enquanto o
  estoque já está baixo. O corpo da notificação "Mascote alimentado"
  também passou a incluir a quantidade restante de comida — útil pra
  saber se vale parar pra comprar mais antes de continuar farmando.

### Corrigido

- **Snapshot de inventário no select de personagem não estava sendo
  commitado no latamRO**: o servidor envia o dump em uma sequência
  `0x0B08 START / 0x0B09 NORMAL / 0x0B0A EQUIP / 0x0B0B END`, mas
  como o EQUIP costuma ser grande o suficiente pra ultrapassar o
  segmento TCP atual, o dispatcher do raglens dava BAIL e perdia o
  resto do segmento — incluindo o END da bag principal. O único
  `0x0B0B` que chegava ao decoder era do **carrinho** que vem em
  seguida (`invType=1`), com bytes diferentes do que o código
  esperava pra bag principal (`invType=0`), então o snapshot ficava
  acumulado em buffer sem nunca comitar. Resultado prático: o chip
  `Comida` mostraria `—` mesmo com itens no inventário e o mascote
  identificado. Agora cada `0x0B09 NORMAL` commita direto no slot map
  ao vivo e emite `packet:inventory-snapshot` por chunk; o frontend
  faz um único refetch de `getFoodCount` 150ms depois do último emit
  pra coalescer a rajada de packets que um dump multi-segmento gera.

## [0.2.0] - 2026-05-20

### Adicionado

- Novo addon **Última Localização** (`last-teleport`): registra os
  últimos pontos de onde você teleportou e desenha marcadores sobre
  uma imagem real do minimapa do mapa atual — caminho prático pra
  voltar quando uma sequência de Fly Wing deixa item no chão, MVP
  vivo ou carta caída no mapa anterior. Abre duas janelas
  independentes que compartilham configuração e estado: a janela
  do **mapa** (transparente, redimensionada automaticamente pra
  combinar com a proporção real do PNG carregado — não é
  arrastável, o tamanho é controlado pelo slider `Escala` nas
  configurações) e a janela de **controles** (widget mínimo com
  `◀ ▶ 📋` — botões pra navegar o histórico e copiar
  `/navi mapa X/Y` pra área de transferência). As imagens dos
  minimapas são baixadas sob demanda do divine-pride.net na
  primeira visita e cacheadas em
  `%APPDATA%\com.adson.raglens\map-images\raw\`; visitas seguintes
  carregam instantaneamente, mesmo offline. Cada marcador tem
  contorno preto pra destacar contra mapas verdes; a posição atual
  do jogador é um quadrado azul. Atalhos globais configuráveis
  (`Alt+Shift+Left/Right` pra navegar, `Alt+Shift+C` pra copiar).
  Histórico é descartado em troca de mapa (marcadores não fazem
  sentido entre mapas distintos).
- Decoders de pacotes de mudança de mapa do latamRO em
  `src-tauri/src/decoders/`: `0x0091` (ZC_NPCACK_MAPMOVE — warps
  in-zone tradicionais), `0x0092` (ZC_NPCACK_SERVERMOVE — transição
  entre zone servers), `0x0ac5` (carregamento inicial após
  char-select com prefixo de AID), `0x0ac7` (mudança de zone
  hospedada por hostname em vez de IPv4, layout de 64 bytes
  específico do latamRO confirmado via captura de pacotes em
  2026-05-20). Fallback genérico no `dispatch.rs` que emite
  `packet:teleport-location` pra qualquer opcode S→C cujo payload
  contenha um filename `.gat` válido nos offsets padrão — capturas
  futuras de variantes customizadas funcionam sem decoder dedicado.
- Decoder de `0x0087` ZC_NOTIFY_PLAYERMOVE (`player_move.rs`) que
  emite `packet:player-position` em cada passo de caminhada,
  refinando a posição atual do jogador entre teleportes — sem isso
  o quadrado azul ficaria congelado no destino do último warp.
- Tabela de dimensões de células por mapa (`map-dimensions-data.ts`,
  ~1300 entradas geradas via `scripts/extract-map-dimensions.mjs` a
  partir dos arquivos FLD2 do OpenKore). Usada como fallback de
  proporção até a imagem decodificar, e pra colocar marcadores em
  coordenadas de célula relativas ao PNG. Mapas não listados caem
  num default 256×256 e o addon aprende as dimensões observadas
  (`mapBounds`) à medida que o jogador explora.
- Cache HTTP de imagens em Rust (`map_image_cache.rs`) com cliente
  `reqwest` (blocking + rustls-tls), gravação atômica (escreve em
  `.partial`, depois renomeia) e detecção da redireção pro
  `no_img.png` da divine-pride pra evitar cachear o placeholder.
  Roda em `tauri::async_runtime::spawn_blocking`, não bloqueia a
  thread IPC.
- Framework de overlays: novos flags de manifesto `resizable`,
  `secondaryResizable` e `secondaryAutoSize` em
  `src/addons/types.ts`. `resizable: false` desabilita as alças
  de redimensionamento da janela no nível do SO (o addon controla
  o tamanho programaticamente via `setSize`); `secondaryAutoSize:
  true` faz o `OverlayHost` travar largura E altura ao conteúdo
  via `ResizeObserver` (antes só a altura travava — agora o widget
  de controles encolhe pra largura mínima dos botões).

### Modificado

- **Configurações do addon Última Localização**: a seção "Cor de
  fundo" do `AppearanceSection` é ocultada pra esse addon — a
  janela do mapa fica sempre transparente já que a imagem do PNG
  preenche tudo. Adicionado slider de opacidade do mapa (20–100%,
  padrão 80%) pras marcas destacarem do terreno verde por baixo.
  Tamanho do marcador agora vai de 1–9 px (padrão 5 — exato meio
  do slider), antes era 4–24 px com padrão 10.

## [0.1.9] - 2026-05-19

### Corrigido

- **Notificação "Mascote alimentado" duplicada**: o evento `fed` do
  pet-feeder disparava duas vezes por alimentação — primeiro com a
  lealdade antiga e logo depois com a nova. O bump otimista de fome,
  a confirmação do servidor e o pacote de intimidade chegam como três
  updates separados (e em qualquer ordem entre si), então o efeito de
  detecção via `hunger > prev` registrava dois aumentos. Adicionado
  debounce de 800ms em `PetFeeder.tsx` que coalesce todos os updates
  de uma mesma alimentação numa única notificação, lendo a intimidade
  via ref no momento do disparo — sempre carrega a lealdade pós-feed.
- **Pacotes de pet perdidos quando o servidor empacota a resposta**:
  o dispatcher derrubava silenciosamente bundles que chegavam dentro
  de um wrapper `0x07fa` (8 bytes de header `fa 07 00 00 5x 00 01 00`
  seguidos de zero ou mais sub-pacotes `0x00b0`/`0x01a4`/`0x01a3`),
  porque o fallback de variable-length lia `00 00` no offset 2-3 e
  caía no BAIL — descartando junto os sub-pacotes do bundle. Sem o
  `0x01a4` de hunger / intimidade chegando, o overlay nunca via a
  confirmação do servidor e o próximo tick de fome (~30s depois)
  parecia uma nova alimentação. `0x07fa` registrado como opcode de
  comprimento fixo de 8 bytes em `dispatch.rs`: o walker consome só
  o header e segue despachando os pacotes internos normalmente.

## [0.1.8] - 2026-05-19

### Adicionado

- Novo addon **Aviso de Desconexão** (`disconnect-notify`): notifica
  via toast do Windows e/ou push do ntfy.sh quando você é
  desconectado do servidor de forma inesperada. Reutiliza os
  primitivos de notificação do pet-feeder (`winNotify` / `ntfy`) —
  zero duplicação. O usuário escolhe um ou os dois canais e configura
  o tópico de push pelo botão **Configurar**; um botão **Testar**
  por canal valida a configuração antes da próxima queda.
- **Detecção de queda em três frentes**, todas convergindo em um
  único evento `client-disconnect` no backend:
  - **RST TCP** observado na captura: `capture.rs` agora expõe um
    `enum ParsedSegment { Payload | ControlRst | ControlFin }` e
    `packet.rs` lê o byte de flags do header TCP (offset 13, com
    constantes `TCP_FIN`/`TCP_RST`). Segmentos sem payload mas com
    RST setado disparam `disconnect::on_tcp_rst` em vez de virarem
    no-op como antes.
  - **Timeout silencioso** (30s sem pacote enquanto o processo do
    cliente continua vivo): watchdog rodando em paralelo com o loop
    do WinDivert, compartilhando a mesma flag de `running` então
    `shutdown_capture` para os dois com um único shutdown. Cache de
    `process_info(pid)` por tick agrupa múltiplas conexões do mesmo
    Ragexe — uma syscall por PID, não por 4-tupla.
  - **ZC_NOTIFY_BAN (`0x0081`)**: decoder novo em
    `src-tauri/src/decoders/ban.rs` com tabela pt-BR pra cada código
    de razão (kick, sessão duplicada, conta suspensa, manutenção, etc.).
    A mensagem visível ao usuário é unificada — todos os três
    caminhos viram um único toast/push "Desconectado do servidor".
- **Supressão de desconexão intencional**: `restart::decode` marca o
  PID em `RecentRestarts` no momento do ZC_RESTART_ACK bem-sucedido,
  e a janela de 5s suprime o FIN/RST que naturalmente segue um "voltar
  à seleção de personagem". `RecentEmits` (janela de 10s) deduplica
  a sequência BAN → RST que o servidor emite num kick — uma notificação
  por evento lógico, não duas.

### Mudanças internas

- **Padrão de addon "headless"**: `AddonManifest` ganhou `defaultSize`
  e `entryRoute` opcionais, com um type guard `hasOverlay(manifest):
  manifest is OverlayAddonManifest` em `src/addons/types.ts` que
  narrowa o tipo pros callers. `spawnAddonOverlay`, `syncOverlays`,
  `AddonRow` e `AddonSettingsModal` filtram via esse guard, então o
  `disconnect-notify` consegue ficar no addons list (toggle on/off +
  Configurar) sem ganhar checkboxes de "Sempre visível"/"Travado" nem
  janela de overlay. A subscrição vive em `useDisconnectService`
  montado uma vez no `MainWindow` pelo tempo de vida do app.
- `NtfyHelpModal` movido para `src/components/NtfyHelpModal.tsx` e
  parametrizado por `topicExample` — pet-feeder e disconnect-notify
  consomem o mesmo componente em vez de manterem cópias quase
  idênticas (cerca de 50 linhas de JSX deletadas).
- Três cópias de `unix_ms()` colapsadas em uma. `connections::unix_ms`
  virou `pub`; o helper duplicado em `disconnect.rs` e o `unix_ms_now`
  dead code em `process.rs` foram removidos.
- `RecentRestarts`/`RecentEmits` agora reapam entradas mais antigas
  que a janela respectiva uma vez por tick do watchdog — o keyspace
  por PID fica limitado mesmo em sessões longas com muitos clientes
  rotacionando.
- `connections.touch(ft)` no `dispatch_packet` agora roda só quando
  `observe()` retorna `None` (conexão já existia). No insert novo,
  `observe` já gravou `last_seen_unix_ms`, evitando um lock redundante
  do mutex no hot path.
- `ClientDisconnect::rst(...)`, `::timeout(...)` e `::ban(...)`
  centralizam o `unix_ms()` e a montagem do payload — os três call
  sites perderam ~6 linhas de boilerplate cada.

## [0.1.7] - 2026-05-19

### Adicionado

- **Notificações para o pet-feeder** com dois canais independentes
  e tabela granular por evento:
  - **Push (ntfy.sh)**: o usuário escolhe um tópico único, cola no
    app do ntfy no celular, e o Raglens manda uma notificação via
    `POST https://ntfy.sh/` na transição para a faixa ideal, na
    zona de perigo e a cada alimentação. Implementado com a API JSON
    do ntfy para evitar a heurística de detecção binária do servidor
    (qualquer UTF-8 multi-byte no body, tipo um em-dash, virava
    anexo). Timeout de 8s na requisição pra `Testar` não travar.
  - **Windows**: toast nativo via `tauri-plugin-notification`. A
    permissão é tratada por-webview com cache em módulo — o overlay
    e a janela de configuração não precisam pedir permissão
    separado. O instalador NSIS registra o AppUserModelID via
    atalho do Menu Iniciar (sem instalar, o Windows ignora os
    toasts; é uma limitação conhecida do plugin em dev).
  - **Matriz 3×2** no modal de configuração: cada evento (faixa
    ideal, zona de perigo, alimentado) pode ser ligado/desligado
    por canal independentemente, permitindo desktop silencioso com
    push no celular ou vice-versa.
  - **Botões "Testar"** por canal com feedback inline
    (`✓ Enviado` / `✗ Falhou` / `Permissão negada`) e um botão `?`
    abrindo modal com instruções pt-BR para configurar o ntfy
    (instalar app, escolher tópico único, etc.).
- **Evento "alimentado"** detectado por aumento de fome (bump
  otimista + confirmação do servidor), incluindo o valor atual de
  lealdade na mensagem. Funciona mesmo com lealdade no máximo
  (1000), onde o servidor não emite o pacote de mudança de
  intimidade — keying em fome em vez de intimidade nunca perde
  uma alimentação.
- **Cabeçalho opcional no XP meter** (toggle "Cabeçalho" na seção
  Exibição), com o rótulo "Experiência" no mesmo estilo do
  cabeçalho "Mascote" do pet-feeder.

### Mudanças internas

- `formatDuration` (que já tinha sido extraído para `lib/format.ts`)
  agora é compartilhado também via o estilo de cabeçalho:
  `.overlay-header` virou regra em `styles/overlay.css` e os dois
  addons consomem a mesma classe.
- Novo componente `<Modal>` em `components/Modal.tsx` encapsulando
  backdrop + sticky header + close button + click-outside-to-close
  com `zIndex` opcional para modais empilhados. `AddonSettingsModal`
  e o `NtfyHelpModal` aninhado consomem ele.
- `PET_NOTIFICATION_EVENTS` (lista tipada com `pushKey` e `winKey`
  pré-resolvidos) virou a fonte de verdade pro matrix: o dispatcher
  e a UI da tabela leem dela; o cast `as keyof PetFeederConfig`
  e o helper `capitalize<T>` foram removidos.

## [0.1.6] - 2026-05-18

### Adicionado

- Novo addon **Mascote (pet-feeder)**: overlay que mostra fome,
  intimidade, nível e nome do pet, com contagem regressiva até a
  próxima troca de estado. A cadência é descoberta na primeira
  observação de queda natural e persistida por `petType` em
  `raglens.json`, então sessões seguintes começam com o timer
  certo desde o primeiro frame. O cálculo trata o decremento como
  evento discreto (no latamRO, `3 pts a cada 60s` para o pet
  observado): `ticksNeeded = ceil((hunger - threshold) / dropPerTick)`,
  e ignora o primeiro tick pós-alimentação porque o servidor
  reagenda o `HungryDelay` no momento da comida e a janela fica
  irregular.
- Alertas sonoros configuráveis em duas situações: entrada na
  **zona ideal** (fome em 26–75, oportunidade de loyalty) e
  entrada na **zona de perigo** (fome ≤ 25, pet pode fugir).
  Cada alerta pode ser one-shot ou em loop e usa um som da
  biblioteca embutida ou um arquivo `.wav`/`.mp3` importado pelo
  usuário.
- Evento `client-reset` (back-to-char-select / quit), com os
  addons resetando o snapshot por PID na transição — o personagem
  seguinte não herda dados (fome, intimidade, samples de XP) do
  anterior.
- Configuração de **Escala da interface** (50%-200%) no addon do
  XP meter, igual à que o pet-feeder já tinha, via `zoom` no root
  do overlay e re-lock automático da altura.

### Mudanças internas

- `formatDuration` virou utilitário compartilhado em
  `src/lib/format.ts` e o xp-meter passou a re-exportar dele em
  vez de manter um fork — segundos agora são sempre `padStart(2)`
  no overlay (largura estável durante a contagem).
- Logger de opcodes (`RAGLENS_LOG_OPCODES=1`) anota cada pacote
  de pet (`0x01a2` / `0x01a3` / `0x01a4` / `0x01a9`) com uma
  linha `[pet] ...` carregando `dt`, `drop`, `interval`,
  `per_tick`, `countdown` e marcadores `post_fed=armed|consumed`,
  para conferir o estado do timer do overlay contra o que
  realmente chega no fio.

## [0.1.5] - 2026-05-18

### Adicionado

- Janela de tempo do XP meter ganhou um preset de **3 min** entre
  o 1 min e o 5 min, e uma opção **Personalizado** com input em
  minutos (1–1440). O input commita a cada valor numérico válido,
  cair em foco ativa o radio automaticamente, e o draft é
  preservado se o usuário voltar pra um preset (não perde o
  número digitado). Os rótulos das linhas do overlay
  (`XP base/Xmin`) seguem o valor automaticamente via
  `xpMeterWindowSuffix`.

## [0.1.4] - 2026-05-18

### Adicionado

- Configuração de aparência por overlay no modal "Configurar":
  paleta de cor de fundo (Transparente / Escuro / Claro / Azul
  escuro / Verde escuro) e slider de opacidade. O preset "Claro"
  usa um tom azul-acinzentado discreto inspirado no HUD do
  Ragnarok (em vez de branco puro) e desliga o contorno preto do
  texto pra ficar parecido com o estilo do cliente. Persistido em
  `overlay.<id>.appearance` no `raglens.json`; mudanças aparecem
  ao vivo no overlay enquanto o usuário arrasta o slider, com
  gravação em disco com debounce de 300 ms.
- Janela do overlay agora trava a altura no tamanho natural do
  conteúdo via `setMinSize`/`setMaxSize` iguais, recalculado por
  `ResizeObserver` em cima de `.overlay-shell`. O usuário pode
  redimensionar horizontalmente; verticalmente o SO bloqueia.
  Quando o usuário liga/desliga linhas do XP meter, a janela
  ajusta automaticamente.
- Fonte do overlay alinhada com o HUD do Ragnarok: pilha de
  fallback `Gulim, GulimChe, Dotum, Tahoma, "Lucida Sans Unicode"`
  em `bold` no `.xp-meter`.

### Corrigido

- Transparência real da janela do overlay agora funciona no
  Windows 11 + WebView2. Duas correções combinadas:
  1. `main.css` carregava `html, body, #root { background: #14141a }`
     pra todas as janelas (importado no entrypoint compartilhado
     `main.tsx`), o que pintava um fundo opaco escuro no overlay
     antes do `overlay.css` poder dizer "transparente". A pintura
     escura foi movida pra `.app`, que só existe na MainWindow.
  2. Após `tauri://created`, o spawn faz um "resize nudge"
     (`w+1` → `w`) — Tauri 2 + WebView2 só ativam a composição
     transparente após o primeiro resize
     ([SO #77344488](https://stackoverflow.com/questions/77344488)).
- `transparent: true` + `shadow: false` reativados no spawn das
  janelas de overlay (`overlays.ts`).

## [0.1.3] - 2026-05-18

### Adicionado

- Banner de "nova versão disponível" na janela principal. No mount
  do `MainWindow` o app consulta uma vez o endpoint
  `releases/latest` da API do GitHub e, se a tag de lá for
  estritamente mais nova do que a versão rodando, mostra uma faixa
  no topo do conteúdo: clicar no texto abre a página do release no
  navegador padrão (via `tauri-plugin-opener`, com `github.com` já
  permitido no manifest de capabilities). O `×` à direita
  dispensa o banner — a tag dispensada é persistida em
  `app.dismissedUpdateVersion` no `raglens.json`, então ele volta
  a aparecer só quando sair uma versão ainda mais nova. Falha de
  rede / API colapsa silenciosamente em `null`; nenhum erro é
  mostrado pro usuário.

## [0.1.2] - 2026-05-18

### Corrigido

- O overlay do XP meter não muda mais de tamanho aparente entre os
  estados "aguardando" e "ativo". Antes, o placeholder
  "Aguardando pacotes…" era renderizado como uma linha extra; quando
  o primeiro pacote chegava, essa linha sumia e as linhas reais de
  estatística passavam a ditar a altura, deixando um espaço vazio
  ao final da janela que o usuário havia dimensionado. Agora as
  linhas configuradas sempre são renderizadas (são elas que ditam
  o tamanho natural do overlay) e ficam com `visibility: hidden`
  enquanto não há dados; o "Aguardando pacotes…" é desenhado em
  cima como overlay absoluto. A janela mantém o tamanho que o
  usuário escolheu, independente do estado.

## [0.1.1] - 2026-05-18

### Corrigido

- Fechar a janela principal agora encerra o app completamente.
  Antes, os overlays continuavam abertos (alguns invisíveis pelo
  watcher de foreground) e o processo `raglens.exe` ficava rodando
  silenciosamente em segundo plano. Hook adicionado em
  `RunEvent::WindowEvent { CloseRequested }` do `lib.rs`: ao
  receber o evento da janela `main`, o app chama
  `AppHandle::exit(0)`, que dispara o `RunEvent::Exit` existente
  pra fechar capture loop, foreground watcher e overlays.

### Mudado

- Mensagem do placeholder do XP meter encurtada de
  "Aguardando primeiro pacote de experiência…" para
  "Aguardando pacotes…". Adicionado `white-space: nowrap` +
  `text-overflow: ellipsis` no estilo da linha como rede de
  segurança caso alguém deixe o overlay muito estreito.

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

[Unreleased]: https://github.com/adsonpleal/raglens/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/adsonpleal/raglens/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/adsonpleal/raglens/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/adsonpleal/raglens/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/adsonpleal/raglens/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/adsonpleal/raglens/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/adsonpleal/raglens/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/adsonpleal/raglens/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/adsonpleal/raglens/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/adsonpleal/raglens/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/adsonpleal/raglens/releases/tag/v0.1.0
