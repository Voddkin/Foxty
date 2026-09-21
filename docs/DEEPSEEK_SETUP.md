# Configuração e Integração do DeepSeek AI (Foxty Brain)

Este documento detalha o funcionamento, configuração e políticas de integração do motor cognitivo DeepSeek no bot Foxty.

---

## 1. Visão Geral

O DeepSeek atua como o **cérebro deliberativo** do Foxty (`DeepSeekAdapter`). No modelo arquitetural do Foxty:
1. **O DeepSeek apenas sugere** decisões (`respond`, `ignore`, reações, candidatos a memória e intenções de ações).
2. **O FoxtyCore é a autoridade máxima**: filtra e valida todas as propostas contra as regras canônicas do servidor Cherry Place (`ChannelBehaviorPolicy`), limites de burst e a barreira de privacidade do SakuraMail antes de qualquer execução física.

---

## 2. Variáveis de Ambiente

Configure as seguintes variáveis no seu arquivo `.env`:

```env
# Chave de API da plataforma DeepSeek (https://platform.deepseek.com)
DEEPSEEK_API_KEY=sk-sua-chave-aqui

# Endpoint oficial da API DeepSeek
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Modelo oficial canônico
DEEPSEEK_MODEL=deepseek-flash

# Parâmetros de inferência
DEEPSEEK_TEMPERATURE=0.7
DEEPSEEK_MAX_TOKENS=600
DEEPSEEK_TIMEOUT_MS=15000

# Modos de raciocínio
DEEPSEEK_THINKING_MODE=none
DEEPSEEK_REASONING_EFFORT=

# Comportamento estrito em produção
# Em produção, DEVE ser false para evitar respostas inventadas se a IA estiver indisponível
DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=false
```

---

## 3. Modelos Suportados

| Modelo | Identificador | Uso Recomendado |
| :--- | :--- | :--- |
| **DeepSeek Flash (Padrão)** | `deepseek-flash` | Alta velocidade, baixo custo, ideal para interações conversacionais e reações ágeis no Discord. |
| **DeepSeek Chat** | `deepseek-chat` | Respostas ricas e contexto estendido. |
| **DeepSeek Reasoner** | `deepseek-reasoner` | Análise profunda e tarefas lógicas avançadas (suporta thinking blocks). |

---

## 4. Formato das Respostas & Validação Contratual

O DeepSeek deve sempre responder em formato JSON estrito, o qual é normalizado e validado pelo Zod através de `parseBrainOutput()` e `normalizeBrainDecision()`:

```json
{
  "decision": "respond",
  "tone": "teasing",
  "messages": [
    "hm.",
    "você sabe que não devia ter mexido nas ferramentas da oficina, né?"
  ],
  "reactions": ["🦊"],
  "actionRequests": [
    {
      "tool": "react",
      "arguments": {
        "channel_id": "1549476613387845703",
        "emoji": "🔧"
      }
    }
  ],
  "memoryCandidates": [
    {
      "content": "Kris mexeu nas ferramentas da oficina de madrugada.",
      "type": "episodic",
      "confidence": 0.92,
      "targetUser": "Kris",
      "safeForTeasing": true
    }
  ],
  "reasoning": "Kris mencionou a oficina; reagir com provocação afetuosa conforme persona."
}
```

Caso o modelo gere Markdown wrapping (e.g. ````json ... ````), o parser faz unwrap automático. Se o payload for irrecuperável, o parser rejeita de forma segura sem derrubar o runtime.

---

## 5. Circuit Breaker & Resiliência a Falhas

O adaptador implementa um **Circuit Breaker** de 3 estados (`CLOSED`, `OPEN`, `HALF_OPEN`):

- **HTTP 402 (Insufficient Balance)**: O Circuit Breaker abre imediatamente e coloca o adaptador no estado `STANDBY_INSUFFICIENT_BALANCE` com cooldown estendido (60s). Não são feitas chamadas repetidas inúteis à API.
- **HTTP 429 (Rate Limit)**: Cooldown de 30s para desafogar a quota.
- **HTTP 5xx & Timeouts**: Cooldown de 20s.
- **Após o Cooldown**: Transiciona para `HALF_OPEN`. Uma chamada bem-sucedida restaura o circuito para `CLOSED`.

### Política Estrita de Produção:
Quando `DEEPSEEK_ALLOW_HEURISTIC_FALLBACK=false`:
- Se a chamada ao DeepSeek falhar ou o Circuit Breaker estiver `OPEN`, o Foxty **silencia de forma segura** (`SILENCE`).
- **NUNCA é gerada uma resposta falsa** fingindo ter vindo da IA.
- A métrica `lastAiResult` é registrada com precisão (`REAL_AI`, `FALLBACK`, `SILENCE`, `ERROR` ou `CIRCUIT_BREAKER`).

---

## 6. Verificação e Teste de Conexão

Você pode testar a conexão com a API DeepSeek a qualquer momento:

- **Via API REST**:
  ```bash
  curl -X POST http://localhost:3000/api/health/deepseek/test
  ```
- **Via Health Check**:
  ```bash
  curl http://localhost:3000/api/health/deepseek
  ```
- **Via Discord Slash Command**:
  No Discord, execute `/foxty acao:conexao` para receber o relatório em tempo real do Gateway Discord e do Brain DeepSeek.
