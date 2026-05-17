# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-05-17

### Adicionado

- Captura de pacotes via WinDivert em modo *sniff* (somente leitura,
  herdado do ragmarket — mesmo filtro de portas de servidor de mapa do
  latamRO).
- Pipeline de despacho por opcode (`src-tauri/src/dispatch.rs`):
  - Canonicalização do par cliente ↔ servidor em uma `FourTuple` única.
  - Lookup `decoders::lookup(u16)` que cada decodificador novo registra.
  - Eventos Tauri tipados (`packet:<event-name>`) com payload `serde`.
- Rastreio multi-cliente:
  - Cada 4-tupla observada emite `connection-detected` uma vez.
  - Comandos `list_connections`, `select_connection`, `clear_connection_selection`.
  - Pacotes de tuplas não selecionadas são descartados antes do parse de
    opcode.
- Logger dev de opcodes (`RAGLENS_LOG_OPCODES=1`):
  - Arquivo diário rotacionado em
    `%LOCALAPPDATA%\com.adson.raglens\logs\opcodes-YYYY-MM-DD.log`.
  - Formato: `ISO ts | direção | client ↔ server | opcode | len | payload-hex`.
- Janela principal de controle (pt-BR):
  - Seletor de interface de rede (auto-escolhe primeira não-loopback).
  - Iniciar / Parar captura, contagem de pacotes em tempo real.
  - Painel **Conexões detectadas** com radio de seleção.
  - Lista de addons com switch on/off e botão Travar/Destravar por
    addon, mais um Travar/Destravar global para todos.
- Infraestrutura de overlay multi-janela:
  - `spawnAddonOverlay` cria um `WebviewWindow` por addon habilitado
    (`alwaysOnTop`, `decorations:false`, `transparent`, `skipTaskbar`,
    `resizable`).
  - Click-through via `setIgnoreCursorEvents` do Tauri 2 (sem chamadas
    Win32 customizadas).
  - Posição e tamanho persistidos via `tauri-plugin-store` com debounce
    de 400ms enquanto o usuário arrasta.
  - Auto-respawn ao abrir o app dos addons que estavam ativos na sessão
    anterior.
- Addon **Medidor de Experiência** (placeholder):
  - UI com a layout final (XP base/min, XP job/min, %/min, ETA).
  - Hook `useXpEvents` inscrito em `packet:exp-gain` (não dispara ainda
    — opcode `ZC_NOTIFY_EXP` do latamRO não identificado).
  - Cálculo de janela deslizante + formatação em `format.ts` cobertos
    por 15 testes Vitest.
- Workflow do GitHub Actions:
  - Build manual via `workflow_dispatch`.
  - Verifica coerência de versão (`package.json` ↔ `Cargo.toml` ↔ tag).
  - Roda `npm test` (Vitest) **e** `cargo test` (decodificadores).
  - Gera `SHA256SUMS.txt`.
  - `softprops/action-gh-release` pinado por SHA.
- Bundle: instalador NSIS único (`raglens-vX.Y.Z-setup.exe`) com
  WinDivert embutido.

### Notas

- O addon do Medidor de Experiência é um esqueleto funcional sem
  decodificador real ainda. Identificar o opcode certo (`ZC_NOTIFY_EXP`,
  candidatos: `0x0acc` em clientes modernos) é o próximo passo,
  feito com o logger dev contra fixtures de uma sessão real.

[Unreleased]: https://github.com/adsonpleal/raglens/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/adsonpleal/raglens/releases/tag/v0.1.0
