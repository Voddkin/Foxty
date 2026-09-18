# FOxty — Technical Architecture

Version: 0.1

---

# 1. ARQUITETURA GERAL

```text
Discord
   ↓
Discord Adapter
   ↓
Foxty Core
   ├── Context Builder
   ├── Behavioral Analyzer
   ├── Memory Manager
   ├── State Manager
   ├── Event Engine
   ├── Rarity Engine
   ├── Command Router
   ├── Personality Engine
   ├── DeepSeek Brain
   ├── Tool Executor
   ├── SakuraMail Bridge
   └── Logger
2. PRINCÍPIO

O Core controla o sistema.

O modelo de IA não possui autoridade direta.

3. DISCORD ADAPTER

Responsável por:

conexão;
eventos;
mensagens;
reações;
canais;
threads;
anexos;
slash commands;
permissões.
4. CONTEXT BUILDER

Responsável por construir o contexto enviado ao DeepSeek.

Entrada:

mensagem atual;
janela recente;
canal;
participantes;
memória relevante;
padrões observados;
estado;
evento.

Saída:

{
  "channel": {},
  "recent_messages": [],
  "relevant_memories": [],
  "behavioral_observations": [],
  "foxty_state": {},
  "event": null
}
5. CONTEXTO ECONÔMICO

Não enviar o histórico inteiro.

Usar:

recent window
+
relevant memory
+
relevant behavior
+
current event

Isso reduz custo e ruído.

6. MEMORY MANAGER

Responsável por:

salvar;
atualizar;
recuperar;
expirar;
pontuar relevância.

Tipos:

episodic
behavioral
server
project
temporary
7. STATE MANAGER

Estado possível:

{
  "mood": 0.0,
  "energy": 0.0,
  "curiosity": 0.0,
  "chaos": 0.0,
  "drama": 0.0,
  "talkativeness": 0.0,
  "suspicion": 0.0
}

Valores podem variar entre 0 e 1.

8. PERSONALITY ENGINE

Combina:

personalidade base;
estado;
canal;
evento;
contexto;
memória relevante.

Não deve depender apenas de prompt.

9. BEHAVIOR ANALYZER

Classifica mensagens e sequências.

Exemplo:

{
  "speaker": "Riely",
  "signals": [
    "short_response",
    "laughter_marker",
    "informal_spelling"
  ],
  "confidence": 0.91
}
10. EVENT ENGINE

Controla:

espontaneidade;
raridade;
cooldown;
contexto;
priorização.
11. DEEPSEEK BRAIN

DeepSeek recebe somente aquilo que precisa.

A API DeepSeek atualmente oferece JSON estruturado e tool calls; o modo JSON pode usar response_format, e os tool calls devem ser validados pelo código antes de execução.

12. TOOL EXECUTOR

Fluxo:

DeepSeek
↓
tool request
↓
JSON validation
↓
permission validation
↓
policy validation
↓
execution
↓
tool result
↓
DeepSeek

Nunca:

DeepSeek
↓
Discord API diretamente
13. FERRAMENTAS POSSÍVEIS

Futuras:

send_message
send_multiple_messages
react
send_file
create_thread
read_recent_messages
search_memory
save_memory
forget_memory
get_channel_info
get_server_info
trigger_event

Cada ferramenta deve possuir schema.

14. VALIDAÇÃO

Toda ferramenta deve validar:

argumento;
canal;
usuário;
permissão;
cooldown;
limite;
tipo de ação.

Mesmo que o bot tenha Administrator.

15. PERSISTÊNCIA

Pode começar com:

JSON

e migrar posteriormente para:

SQLite

ou outro banco.

A arquitetura deve manter o storage abstrato.

16. CONFIGURAÇÃO

Separar:

config
secrets
personality
phrases
events
channels
memory

Secrets nunca devem entrar em JSON versionado.

17. LOGGING

Logs devem registrar:

timestamp;
evento;
canal;
tipo de ação;
sucesso/falha;
AI utilizada;
tokens;
duração;
erro.

Evitar registrar dados privados desnecessários.

18. TEST MODE

O sistema deve permitir:

TEST_MODE=true

No modo de teste:

eventos espontâneos podem ser forçados;
tool calls podem ser simulados;
DeepSeek pode ser mockado;
Discord pode usar canal de teste;
memória pode usar banco separado.
19. DEBUG

Adicionar comandos administrativos para:

testar DeepSeek;
testar JSON;
testar memória;
testar evento;
testar Discord;
listar configurações;
validar arquivos.
20. FALHAS DA IA

DeepSeek pode produzir:

JSON inválido;
tool call incorreto;
parâmetro inexistente;
resposta vazia;
ação imprópria.

O Core precisa tratar isso.

Não confiar na saída da IA.

21. DEEPSEEK STATELESSNESS

A API não deve ser tratada como banco de memória do Foxty.

O estado pertence ao Core.

O cliente precisa reconstruir e enviar o contexto necessário
a cada interação.

22. PERFORMANCE

Preferir:

async;
filas;
locks por canal;
locks por usuário;
cache;
armazenamento eficiente;
chamadas paralelas quando apropriado.
23. CUSTO

O sistema deve registrar tokens por chamada.

Também deve distinguir:

NO_AI
LOW
NORMAL
RARE

Chamadas desnecessárias devem ser evitadas.

A tabela atual do DeepSeek mostra preços separados para input com cache hit,
input sem cache e output, então o desenho deve favorecer contexto estável
e reaproveitável quando possível.

24. LINGUAGEM

A arquitetura é language-agnostic.

Python é uma escolha natural para a primeira implementação,
especialmente porque o ecossistema atual do projeto SakuraMail
já utiliza Python.

O implementador pode escolher outra linguagem somente se houver
vantagem técnica concreta.

25. ESTRUTURA SUGERIDA
src/
├── main.py
├── config/
├── discord/
├── core/
├── brain/
├── memory/
├── personality/
├── behavior/
├── events/
├── commands/
├── tools/
├── integrations/
├── storage/
└── utils/

data/
├── personality.json
├── events.json
├── channels.json
├── memory/
└── schemas/

tests/
├── brain/
├── events/
├── memory/
├── behavior/
└── integration/
26. PRINCÍPIO FINAL

Código executa.

IA interpreta.

Memória preserva.

Eventos orquestram.

Discord materializa.

Nenhuma camada deve absorver responsabilidade que pertence
a outra.