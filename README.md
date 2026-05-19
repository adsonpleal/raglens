# raglens

Framework de **addons em overlay** para Ragnarok Online (latamRO). Cada
addon é uma janela pequena, sem moldura, sempre por cima e arrastável
que você posiciona sobre o cliente do RO. Vem com dois addons: um
**Medidor de Experiência** (XP/min, %/min, ETA, base e job) e
**Informações de Mascote** (fome / intimidade / nível, contagem
regressiva até a faixa ideal e alertas sonoros).

Somente leitura: cada byte exibido vem do servidor para o seu próprio
cliente. Nenhum pacote é construído ou enviado, nenhum processo do RO é
modificado.

## ⬇ Download

[**raglens-v0.1.7-setup.exe**](https://github.com/adsonpleal/raglens/releases/latest/download/raglens-v0.1.7-setup.exe)
— instalador único para Windows 10/11 (~1,3 MB). Já inclui o WinDivert
embutido; basta executar e seguir o instalador. O Raglens é configurado
para sempre rodar como Administrador (vai aparecer um UAC ao iniciar —
isso é necessário pra capturar pacotes de rede).

Veja também a [página de releases](https://github.com/adsonpleal/raglens/releases)
para versões anteriores e o `SHA256SUMS.txt` correspondente.

### ⚠ Aviso do SmartScreen "Windows protegeu seu PC"

Como o binário **não tem assinatura digital paga**, na primeira execução
o Windows SmartScreen vai mostrar o aviso "**Windows protected your PC**
— Microsoft Defender SmartScreen prevented an unrecognized app from
starting".

**Como instalar mesmo assim:**

1. Clique em **"More info"** (Mais informações) no diálogo
2. Aparece um botão **"Run anyway"** (Executar mesmo assim) no canto
   inferior — clique nele
3. O instalador roda normalmente

O binário é compilado direto do código-fonte aberto deste repositório
via GitHub Actions — se quiser verificar a integridade, compare o hash
do arquivo baixado com o `SHA256SUMS.txt` da mesma release.

---

## Addons disponíveis

| Addon | Descrição | Status |
|---|---|---|
| **Medidor de Experiência** | XP/min, %/min e tempo até o próximo nível (base e job). Janela de tempo configurável (1 / 3 / 5 / 15 / 30 / 60 min ou personalizado). Atalho global padrão `Alt+Shift+E` pra mostrar/esconder. | Funcional |
| **Informações de Mascote** | Mostra fome, intimidade, nível e nome do pet. A contagem regressiva até a próxima troca de estado é calibrada por `petType` a partir da primeira queda observada (modelo de tick discreto, persistido em `raglens.json`) — sessões seguintes começam com o timer certo desde o primeiro frame. Alertas sonoros (one-shot ou em loop, com som da biblioteca embutida ou `.wav`/`.mp3` importado) na entrada da faixa ideal (26–75, oportunidade de loyalty) e da zona de perigo (≤ 25, pet pode fugir). **Notificações por push (ntfy.sh) e Windows nativo** em matriz 3×2 (faixa ideal / perigo / alimentado × push / Windows) — desktop silencioso com push no celular, ou vice-versa. Atalho global padrão `Alt+Shift+J`. | Funcional |

A lista cresce; cada addon vive em `src/addons/<id>/` com seu manifesto,
componente React e (quando aplicável) decodificador em
`src-tauri/src/decoders/<opcode>.rs`.

---

## FAQ

### 1. Esse programa pode ser considerado um hack?

Não. O Raglens não toca em nada do cliente do jogo, não injeta DLL
nenhuma, não modifica memória, não envia pacotes pro servidor. Ele
apenas observa, do lado de fora, o tráfego de rede que **o próprio
servidor já te mandou** — os mesmos pacotes que o seu cliente recebe e
processa. A leitura acontece no nível do driver de rede (via
[WinDivert](https://github.com/basil00/WinDivert)), antes do cliente
sequer interpretar.

Cada addon converte esses bytes em informação útil (XP/min, ETA, etc.) e
desenha numa janela em cima do cliente. A janela é só uma camada por
cima — o cliente nem sabe que ela existe.

### 2. Posso levar ban se usar?

Não há vetor conhecido de detecção. O programa:

- **Não injeta** nada no processo do `Ragexe.exe`, então o
  nProtect/GameGuard não vê nada dele.
- **Não envia pacotes** pro servidor, então não há comportamento anômalo
  na conexão para o servidor identificar.
- **Não modifica** memória, arquivos do cliente, nem o tráfego de saída.
- **Não bloqueia nem reescreve** pacotes — opera em modo *sniff* do
  WinDivert, que apenas observa e deixa o pacote seguir intacto para o
  cliente.

Do ponto de vista do servidor e do anti-cheat, é indistinguível de um
cliente normal rodando.

### 3. Por que ele precisa rodar como Administrador?

Para acessar a rede em nível de driver (a única maneira de capturar os
pacotes TCP que chegam para o seu cliente já estabelecido). Sem
privilégio elevado, o Windows bloqueia a captura. O Wireshark precisa do
mesmo privilégio pelo mesmo motivo.

### 4. Funciona em Wi-Fi ou só em cabo?

Funciona nos dois. O WinDivert lê os pacotes antes da pilha TCP do
Windows, então o adaptador físico não importa. O dropdown de placa de
rede só restringe a captura à interface escolhida (caso você tenha
mais de uma).

### 5. O programa deixa minha conexão mais lenta?

Não. Em modo *sniff*, o WinDivert observa o tráfego e o devolve intacto
para o cliente. Não há atraso perceptível.

### 6. Por que o primeiro Iniciar Captura demora uns segundos?

O Windows está instalando o driver de kernel do WinDivert como serviço
(uma única vez por máquina). Nos próximos starts, abre instantaneamente.

### 7. Os meus dados de conta vão para algum lugar?

Não. Tudo é processado localmente. O Raglens:

- Não captura pacotes de login (filtra só portas do servidor de mapa).
- Não envia nenhum dado para servidores externos.

### 8. Funciona em outros servidores de RO?

Foi feito para o **latamRO** (gnjoylatam). As portas de filtro e os
opcodes dos decodificadores são específicos do latamRO; outros
servidores precisariam de ajustes.

### 9. Como faço pra esconder ou mostrar um overlay durante o jogo?

Cada addon tem um atalho global configurável — pressionar a combinação
em qualquer janela (incluindo o cliente do RO) alterna a visibilidade
do overlay. Os padrões: `Alt+Shift+E` para o Medidor de Experiência e
`Alt+Shift+J` para Informações de Mascote. Você pode trocar a
combinação clicando em **Configurar** ao lado do addon em Raglens.

A janela principal de Raglens também tem dois toggles por addon:

- **Sempre visível**: por padrão o overlay só aparece quando o Ragexe
  associado (ou o próprio Raglens) está em foco. Marque pra deixar o
  overlay visível mesmo quando você alt-tabar para outro programa.
- **Travado**: quando marcado, o overlay vira *click-through* — os
  cliques passam por ele direto para o cliente do RO embaixo, como se a
  janela não estivesse ali. Use depois de posicionar tudo, pra não
  atrapalhar o jogo. Desmarque pra arrastar de novo.

### 10. Por que aparecem várias conexões no painel "Clientes detectados"?

O latamRO permite multi-cliente, então uma sessão de captura pode ver
mais de um cliente rodando ao mesmo tempo (e você só quer um). A lista
mostra cada cliente único observado, identificado pelo PID do `Ragexe.exe`.

Conforme o Raglens decodifica os pacotes de identidade (`0x0283`
ZC_AID, `0x0a30` ZC_ACK_REQNAME_TITLE), ele aprende o **ID da conta** e
o **nome do personagem** associados àquele PID e atualiza a linha para
algo como "Tucano · AID 1031076 · PID 15916". Antes disso, a linha
mostra só o PID, o nome do processo e a hora de abertura.

Clique no cliente que você quer seguir; o Raglens passa a processar só
os pacotes daquele cliente. "Seguir todas" volta ao comportamento
padrão de não filtrar.

### 11. Funciona se eu já tenho o Wireshark/Npcap instalado?

Sim. O Raglens usa o **WinDivert**, não o Npcap. Os dois podem coexistir
sem problemas; rodar o Wireshark em paralelo também funciona.

### 12. Como adiciono um novo addon?

1. Crie `src/addons/<id>/` com `manifest.ts` e o componente React
   principal.
2. Registre o manifesto em `src/addons/registry.ts`.
3. Quando seu addon depender de um opcode que ainda não tem
   decodificador, crie `src-tauri/src/decoders/<nome>.rs` e registre o
   `lookup` em `decoders/mod.rs`.
4. Inscreva o componente em `packet:<event-name>` via
   `@tauri-apps/api/event`.

Veja `src-tauri/src/decoders/README.md` para o contrato exato.

### 13. Como descubro o opcode certo de um pacote desconhecido?

Rode o Raglens com a variável de ambiente `RAGLENS_LOG_OPCODES=1`:

```powershell
$env:RAGLENS_LOG_OPCODES = "1"
npm run tauri dev
```

Cada pacote observado vai pra
`%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`. Mate um
monstro (ou faça a ação que você quer mapear), dá `Get-Content -Tail
50` no log, e o opcode novo aparece no fim. O dispatcher decompõe cada
segmento TCP em pacotes individuais antes de gravar, então a linha de
log mostra um opcode por evento real, não por segmento bruto.

### 14. Por que o programa não vê meus pacotes mesmo como Administrador?

Causas possíveis, em ordem de probabilidade:

1. O driver do WinDivert não conseguiu carregar — algum antivírus pode
   estar bloqueando. Adicione uma exceção para `WinDivert64.sys`.
2. Você selecionou uma interface de rede errada. Use o IP do adaptador
   que tem a rota padrão (o seu acesso real à internet).
3. Algum outro software já segurou o handle do WinDivert e não liberou.
   Reinicie o Windows e tente de novo.

---

## Stack

- **Tauri 2** — produz um `.exe` standalone (~10-15 MB)
- **Rust** (backend) — captura via WinDivert (modo *sniff*), dispatcher
  por opcode com walker de segmento TCP, registro modular de
  decodificadores, watcher de foreground (Win32), identificação de PID
  por 4-tupla (`GetExtendedTcpTable`)
- **React + TypeScript + Vite** (frontend) — bundle único, mesma URL
  servindo janela principal e overlays via parâmetro `?w=`
- **tauri-plugin-store** — persiste posição/tamanho dos overlays,
  estados de cada addon (travado, sempre visível) e configuração
  específica (janela de tempo, linhas visíveis, atalho)
- **tauri-plugin-global-shortcut** — atalho de teclado por addon
  registrado em todo o sistema, mesmo com o jogo em foco

## Pré-requisitos (para construir)

- Windows 10/11
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Windows 11 SDK via Visual Studio Installer
- Node.js 20+
- Visual Studio C++ Build Tools (com `vcvars64.bat`)
- [WinDivert](https://github.com/basil00/WinDivert) 2.x — os binários
  (`WinDivert.dll`, `WinDivert64.sys`, `WinDivert.lib`) já vêm em
  `src-tauri/resources/x64/`

## Setup

```powershell
& "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cd C:\Users\adson\dev\raglens
npm install
```

## Rodando em desenvolvimento

Abra o terminal como **Administrador** (caso contrário o WinDivert
falha):

```powershell
cd C:\Users\adson\dev\raglens
npm run tauri dev
```

Para ativar o logger de opcodes durante o dev:

```powershell
$env:RAGLENS_LOG_OPCODES = "1"
npm run tauri dev
```

## Empacotando o .exe

```powershell
npm run tauri build
```

Saída em `src-tauri/target/release/bundle/nsis/*-setup.exe`.

## Fluxo de uso

1. Abra como Administrador.
2. Escolha a interface de rede ativa no dropdown.
3. Clique em **Iniciar Captura**.
4. No painel **Clientes detectados**, clique no cliente que você quer
   seguir. As linhas começam mostrando só o PID, depois preenchem AID e
   nome do personagem conforme o Raglens decodifica os pacotes de
   identidade.
5. Ative o addon desejado pelo switch — o overlay aparece na posição
   padrão e binda automaticamente ao cliente selecionado.
6. Arraste/redimensione o overlay até onde quiser.
7. Marque **Travado** quando estiver satisfeito; o overlay vira
   click-through e não atrapalha mais o jogo.
8. Pressione o atalho do addon (`Alt+Shift+E` para o XP meter,
   `Alt+Shift+J` para o pet-feeder) pra mostrar/esconder em qualquer
   momento, mesmo com o jogo em foco.
9. Clique em **Configurar** ao lado do addon pra abrir o modal de
   configuração — atalho de teclado, janela de tempo (XP meter),
   sons de alerta (pet-feeder), linhas exibidas, escala da
   interface, etc.

## Estrutura do projeto

```
raglens/
├── src/                       Frontend React/TS
│   ├── main.tsx               Roteamento por ?w= (main vs overlay)
│   ├── routes/
│   │   ├── MainWindow.tsx     Painel de controle
│   │   └── OverlayHost.tsx    Shell de overlay; monta o addon
│   ├── addons/
│   │   ├── types.ts
│   │   ├── registry.ts        ADDONS = [xpMeterManifest, petFeederManifest]
│   │   ├── xp-meter/
│   │   │   ├── manifest.ts
│   │   │   ├── config.ts      Tipos e defaults da config do addon
│   │   │   ├── XpMeter.tsx
│   │   │   ├── XpMeterSettings.tsx  Conteúdo do modal Configurar
│   │   │   ├── useXpEvents.ts Inscrito em packet:exp-gain / exp-totals
│   │   │   └── format.ts      Vitest cobre xpPerMinute, ETA, formatação
│   │   └── pet-feeder/
│   │       ├── manifest.ts
│   │       ├── config.ts      Defaults + PET_NOTIFICATION_EVENTS table
│   │       ├── PetFeeder.tsx
│   │       ├── PetFeederSettings.tsx
│   │       ├── usePetState.ts Inscrito em packet:pet-state + onPetFedRequest
│   │       ├── sounds.ts      Catálogo embutido + import de .wav/.mp3
│   │       ├── ntfy.ts        Cliente JSON-publish do ntfy.sh
│   │       ├── winNotify.ts   Toast nativo do Windows (com cache de permissão)
│   │       └── format.ts      Stage classifier + HUNGER thresholds (vitest)
│   ├── components/            NicPicker, ClientPicker, AddonRow,
│   │                          AddonSettingsModal, Modal (genérico)
│   ├── hooks/                 useCaptureSession, useClients,
│   │                          useSelectedPid, useAddonState,
│   │                          useAddonShortcuts, useAddonConfig,
│   │                          useDraggableWindow, useScaleAspectRatio
│   ├── lib/                   invoke / events / store / overlays / types
│   │   └── format.ts          formatDuration compartilhado (vitest)
│   ├── i18n/pt-br.ts          Strings centralizadas
│   └── styles/                main.css, overlay.css
├── src-tauri/                 Backend Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs             Registro de comandos / plugins / RunEvent
│   │   ├── capture.rs         Loop WinDivert + canonicalização 4-tupla
│   │   ├── packet.rs          Parsing IPv4 + TCP
│   │   ├── interfaces.rs      Enumeração de NICs (GetAdaptersAddresses)
│   │   ├── connections.rs     Rastreio multi-cliente + comandos
│   │   ├── process.rs         PID via GetExtendedTcpTable, info do .exe
│   │   ├── foreground.rs      Watcher de foreground (poll 150 ms)
│   │   ├── dispatch.rs        Walker de segmento + lookup de decoder
│   │   ├── logger.rs          Logger dev de opcodes + anotação [pet]
│   │   ├── pet_state_store.rs Cache backend do snapshot do pet por PID
│   │   ├── sounds.rs          Comandos pra importar/listar sons do addon
│   │   └── decoders/
│   │       ├── mod.rs         lookup(opcode) -> Option<DecoderFn>
│   │       ├── aid.rs         ZC_AID (0x0283)
│   │       ├── char_name.rs   ZC_ACK_REQNAME_TITLE (0x0a30)
│   │       ├── exp_gain.rs    ZC_NOTIFY_EXP (0x0acc)
│   │       ├── exp_totals.rs  ZC_LONGPAR_CHANGE (0x0acb)
│   │       ├── pet_state.rs   ZC_PROPERTY_PET (0x01a2) + ZC_CHANGESTATE_PET (0x01a4)
│   │       ├── pet_feed.rs    CZ_USE_ITEM_ON_PET (0x01a9) — click "Alimentar"
│   │       └── restart.rs     ZC_RESTART_ACK (0x00b3) — back-to-char/quit
│   ├── resources/x64/         WinDivert.dll / .sys / .lib
│   ├── capabilities/default.json
│   ├── build.rs               Manifesto admin + Common-Controls v6
│   ├── Cargo.toml
│   └── tauri.conf.json
└── .github/workflows/release.yml
```

## Testes

```powershell
npm test                                            # Vitest (frontend)
cargo test --manifest-path src-tauri/Cargo.toml     # decodificadores
```

O Vitest cobre as funções puras de cálculo de XP/min, %/min, ETA e
formatação (`src/addons/xp-meter/format.ts` e o `formatDuration`
compartilhado em `src/lib/format.ts`), e o classificador de estágios
de fome do pet-feeder (`src/addons/pet-feeder/format.ts`). O
`cargo test` cobre o parsing IPv4/TCP, o walker do dispatcher (com
burst de pacotes concatenados num único segmento), os decoders de EXP
e AID/nome, o registro de decodificadores, a anotação `[pet]` do
logger (incluindo o ceil-based countdown e o skip do primeiro tick
pós-alimentação), o cache `pet_state_store`, a sanitização de nomes
de som (`sounds.rs`), e o parser do nome do pet do `pet_state`.

## Contrato de captura (resumo)

- Filtro WinDivert (em `capture.rs`): combina o IP da placa selecionada
  (`ip.SrcAddr == X || ip.DstAddr == X`) com as portas do servidor de
  mapa do latamRO (`6900 / 6951 / 4500 / 22000–22100`).
- Cada segmento TCP matched é canonicalizado para um `FourTuple
  { client_ip, client_port, server_ip, server_port }`. O lado "server"
  é o que tem uma porta da lista acima; o "client" é o ephemeral.
- O PID dono da 4-tupla é resolvido via `GetExtendedTcpTable` no
  momento em que a conexão é observada pela primeira vez, e cacheado.
- O `dispatch_packet` percorre o payload do segmento, fatiando um
  pacote Ragnarok por iteração — opcodes de tamanho fixo via tabela
  (`fixed_packet_length`), variáveis lendo o campo de length em offset
  2-3. Pra cada opcode encontrado, se houver decodificador registrado
  em `decoders::lookup`, ele emite um evento Tauri tipado
  (`packet:<event-name>`) com payload serde.
- O addon assina o evento na frontend via `@tauri-apps/api/event` e
  reage. O Raglens propaga o PID dono em cada payload pra cada overlay
  filtrar por seu cliente bindado.
- Se nenhum decodificador estiver registrado, o opcode logger (se
  habilitado por env var) ainda grava a linha — é assim que opcodes
  novos são descobertos.
