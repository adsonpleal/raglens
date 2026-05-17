# raglens

Framework de **addons em overlay** para Ragnarok Online (latamRO). Cada
addon é uma janela pequena, sem moldura, sempre por cima e arrastável
que você posiciona sobre o cliente do RO — estilo addons do WoW. O
primeiro addon é um **Medidor de Experiência** (XP/min, %/min, ETA, base
e job).

Somente leitura: cada byte exibido vem do servidor para o seu próprio
cliente. Nenhum pacote é construído ou enviado, nenhum processo do RO é
modificado.

## ⬇ Download

A primeira release ainda não foi publicada. Quando sair, o link será:

`raglens-vX.Y.Z-setup.exe` — instalador único para Windows 10/11. Já
inclui o WinDivert embutido; basta executar e seguir o instalador. O
Raglens é configurado para sempre rodar como Administrador (vai aparecer
um UAC ao iniciar — isso é necessário pra capturar pacotes de rede).

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
| **Medidor de Experiência** | XP/min, %/min e ETA para o próximo nível (base e job). | Placeholder — aguardando identificação do opcode `ZC_NOTIFY_EXP` do latamRO. |

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
processa. A leitura acontece no nível do driver de rede (via WinDivert),
antes do cliente sequer interpretar.

Cada addon converte esses bytes em informação útil (XP/min, ETA, etc.) e
desenha numa janela transparente que você posiciona em cima do cliente.
A janela é só uma camada por cima — o cliente nem sabe que ela existe.

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
Windows, então o adaptador físico não importa.

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

### 9. O que significa "Travar" / "Destravar" um overlay?

- **Destravado**: você pode arrastar o overlay com o mouse de qualquer
  parte dele e redimensionar pelo canto.
- **Travado**: o overlay vira *click-through* — os cliques passam por
  ele direto para o cliente do RO embaixo, como se a janela não
  estivesse ali. Use isso depois de posicionar tudo, pra não atrapalhar
  o jogo.

O botão "Travar overlays" / "Destravar overlays" trava ou destrava todos
ao mesmo tempo; cada addon também tem seu próprio botão de
travar/destravar.

### 10. Por que aparecem várias conexões no painel "Conexões detectadas"?

O latamRO permite multi-cliente, então uma sessão de captura pode ver
mais de um fluxo cliente-servidor ao mesmo tempo (e você só quer um). A
lista mostra cada conexão única observada; clique em uma para o Raglens
processar só o tráfego daquele cliente. "Seguir todas" volta ao
comportamento padrão de não filtrar.

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

Roda o Raglens com a variável de ambiente `RAGLENS_LOG_OPCODES=1`:

```powershell
$env:RAGLENS_LOG_OPCODES = "1"
npm run tauri dev
```

Cada pacote observado vai pra
`%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`. Mate um
monstro (ou faça a ação que você quer mapear), dá `Get-Content -Tail
50` no log, e o opcode novo aparece no fim.

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
  por opcode, registro modular de decodificadores
- **React + TypeScript + Vite** (frontend) — bundle único, mesma URL
  servindo janela principal e overlays via parâmetro `?w=`
- **tauri-plugin-store** — persiste posição/tamanho dos overlays,
  estado travado/destravado e addons habilitados

## Pré-requisitos (para construir)

- Windows 10/11
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Windows 11 SDK via Visual Studio Installer
- Node.js 20+
- Visual Studio C++ Build Tools (com `vcvars64.bat`)
- WinDivert 2.x — os binários (`WinDivert.dll`, `WinDivert64.sys`,
  `WinDivert.lib`) já vêm em `src-tauri/resources/x64/`

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
4. No painel **Conexões detectadas**, clique no cliente que você quer
   seguir (ou deixe em "Seguir todas").
5. Ative o addon desejado pelo switch — o overlay aparece na posição
   padrão.
6. Arraste / redimensione o overlay até onde quiser.
7. Clique em **Travar overlays** quando estiver satisfeito; o overlay
   vira click-through e não atrapalha mais o jogo.

## Estrutura do projeto

```
raglens/
├── src/                       Frontend React/TS
│   ├── main.tsx               Roteamento por ?w= (main vs overlay)
│   ├── routes/
│   │   ├── MainWindow.tsx
│   │   └── OverlayHost.tsx    Shell glassmorphism que monta o addon
│   ├── addons/
│   │   ├── types.ts
│   │   ├── registry.ts        ADDONS = [xpMeterManifest]
│   │   └── xp-meter/
│   │       ├── manifest.ts
│   │       ├── XpMeter.tsx
│   │       ├── useXpEvents.ts Inscrito em `packet:exp-gain`
│   │       └── format.ts      Vitest cobre XP/min, ETA, formatação
│   ├── components/            NicPicker, ConnectionPicker, AddonRow
│   ├── hooks/                 useCaptureSession, useConnections, useAddonState
│   ├── lib/                   invoke / events / store / overlays wrappers
│   ├── i18n/pt-br.ts          Strings centralizadas
│   └── styles/                main.css, overlay.css
├── src-tauri/                 Backend Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs             Registro de comandos / plugins
│   │   ├── capture.rs         Loop WinDivert + canonicalização 4-tupla
│   │   ├── packet.rs          Parsing IPv4 + TCP
│   │   ├── interfaces.rs      Enumeração de NICs (GetAdaptersAddresses)
│   │   ├── connections.rs     Rastreio multi-cliente + comandos de seleção
│   │   ├── dispatch.rs        Opcode (u16 LE) → decodificador → evento tipado
│   │   ├── logger.rs          Logger dev de opcodes (RAGLENS_LOG_OPCODES=1)
│   │   └── decoders/
│   │       ├── mod.rs         lookup(opcode) -> Option<DecoderFn>
│   │       └── README.md      Contrato pra novos decodificadores
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
formatação no `src/addons/xp-meter/format.ts`. O `cargo test` cobre o
parsing IPv4/TCP e o registro de decodificadores (que começa vazio).

## Contrato de captura (resumo)

- Filtro WinDivert (no `capture.rs`):
  `tcp.SrcPort == 6900 || tcp.DstPort == 6900 || ... 6951 ... 4500 ||
  (22000–22100)` — portas do servidor de mapa do latamRO.
- Cada segmento matched é canonicalizado para um `FourTuple { client_ip,
  client_port, server_ip, server_port }`. O lado "server" é o que tem
  uma porta da lista acima.
- O `dispatch_packet` lê o opcode (2 bytes LE) e, se houver um
  decodificador registrado em `decoders::lookup`, emite o evento
  `packet:<event-name>` com payload tipado (serde).
- Se nenhum decodificador estiver registrado, o opcode logger (se
  habilitado por env var) ainda grava a linha — é assim que opcodes
  novos são descobertos.
