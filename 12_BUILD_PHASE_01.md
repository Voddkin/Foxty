# FOxty — Build Phase 01

Version: 0.1

---

# ROLE

Você é o engenheiro principal responsável pela implementação
do projeto Foxty.

Você deve implementar uma aplicação real, funcional e modular.

Os documentos presentes em `/docs` são a especificação do projeto.

---

# FIRST OBJECTIVE

Construir o esqueleto técnico completo do Foxty.

NÃO implementar ainda todo o comportamento avançado.

A primeira fase deve produzir uma base executável.

---

# PRIORITY

1. arquitetura;
2. configuração;
3. Discord connection;
4. logging;
5. storage;
6. Core;
7. event engine;
8. memory interfaces;
9. personality interfaces;
10. DeepSeek adapter;
11. tool system;
12. command system;
13. SakuraMail bridge.

---

# IMPORTANT

Não tratar Foxty como um simples chatbot.

A arquitetura precisa permitir:

- eventos espontâneos;
- memória;
- estado;
- comportamento;
- múltiplas mensagens;
- ferramentas;
- canais;
- DeepSeek;
- integração futura;
- expansão.

---

# DISCORD

O bot deve poder operar em grande parte do servidor.

O sistema deve possuir denylist configurável.

Não depender apenas das permissões do Discord para proteger canais.

O AI Studio deve considerar as permissões necessárias e a configuração
de acesso a dados do bot como partes separadas da implementação. O Discord
atualmente fornece visibilidade no perfil do servidor sobre quais dados um
bot possui acesso. :contentReference[oaicite:8]{index=8}

---

# SECURITY

Secrets:

somente environment variables / secret manager.

Nunca:

- token no código;
- token em JSON;
- token em logs;
- API key em frontend.

---

# DEEPSEEK

Criar adapter desacoplado.

O código deve permitir configurar:

```text
base_url
api_key
model
temperature
max_tokens
response_format
tools
```

O modelo inicial será:

deepseek-flash

O contrato de resposta deverá ser estruturado.

CORE FLOW
Discord Event
↓
Context Builder
↓
Behavior Analyzer
↓
Memory Retrieval
↓
State
↓
Event/Response Decision
↓
DeepSeek
↓
Structured Output
↓
Validator
↓
Tool Executor
↓
Discord
FIRST COMMAND

Criar apenas uma implementação inicial simples
de /foxty para provar que o pipeline funciona.

Não criar vinte subcomandos ainda.

FIRST EVENT

Criar uma implementação de teste para evento espontâneo.

Deve ser possível executar manualmente:

trigger_test_event()
FIRST MEMORY

Criar interface:

MemoryStore

com operações:

save()
get()
search()
delete()
expire()

Não amarrar o Core diretamente a JSON.

FIRST STATE

Criar:

FoxtyState

com:

mood
energy
curiosity
chaos
drama
talkativeness
suspicion
FIRST TOOLS

Criar apenas:

send_message
react

Outras ferramentas serão adicionadas depois.

TESTING

Criar testes para:

Core initialization;
config loading;
DeepSeek adapter;
invalid JSON;
tool validation;
memory interface;
event cooldown;
protected channel;
multi-message burst.
DEVELOPMENT STYLE

Código:

modular;
documentado;
tipado quando possível;
async;
testável;
sem hardcode desnecessário;
sem duplicação.
DO NOT

Não:

criar frontend bonito;
criar dashboard;
criar landing page;
criar botões inúteis;
criar simulador visual;
inventar features não especificadas.

O objetivo desta fase é criar o corpo técnico do Foxty.

AI STUDIO

Como o Build Mode do Google AI Studio gera e mantém um projeto completo,
gerencia múltiplos arquivos e mantém contexto entre iterações, trate os
arquivos de documentação como parte permanente da base do projeto.
Quando o projeto crescer, preserve a separação entre docs, código,
configuração, dados e testes.

COMPLETION CRITERIA

A fase 01 termina quando:

o projeto inicializa;
Discord adapter funciona;
/foxty funciona;
DeepSeek adapter funciona;
structured output funciona;
memória possui interface;
estado possui interface;
eventos possuem interface;
tools possuem interface;
protected channels funcionam;
testes básicos passam;
logs funcionam.

Somente depois avançar para personalidade avançada e eventos complexos.