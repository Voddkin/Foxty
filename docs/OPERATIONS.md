# Guia de Operações e Produção do Foxty

Este manual descreve o processo de execução em produção, os endpoints de monitoramento de integridade (health checks) e guias de resolução de problemas (troubleshooting).

---

## 1. Execução em Produção

### Pré-requisitos
- Node.js 22+ (ou container compatível com suporte nativo a `node:sqlite`)
- Chave de API do DeepSeek válida
- Token de Bot do Discord com Privileged Intent `MessageContent` ativado

### Instalação e Build
```bash
# Instalar dependências
npm install

# Compilar backend e frontend para produção
npm run build

# Executar servidor unificado
npm start
```

O servidor escuta automaticamente na porta definida pela variável de ambiente `PORT` (padrão `3000`), no host `0.0.0.0`.

---

## 2. Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :--- | :--- |
| `DISCORD_TOKEN` | Sim | - | Token de autenticação do bot Discord. |
| `DISCORD_CLIENT_ID` | Sim | `1550741151177506856` | ID da aplicação no portal Discord Developer. |
| `DISCORD_GUILD_ID` | Sim | `1549476612762902628` | ID canônico do servidor Cherry Place. |
| `DEEPSEEK_API_KEY` | Sim | - | Chave de API da plataforma DeepSeek. |
| `DEEPSEEK_BASE_URL` | Não | `https://api.deepseek.com` | URL base da API DeepSeek. |
| `DEEPSEEK_MODEL` | Não | `deepseek-flash` | Modelo deliberativo padrão. |
| `DEEPSEEK_ALLOW_HEURISTIC_FALLBACK` | Não | `false` | **Deve ser false em produção** para garantir integridade. |
| `MEMORY_PROVIDER` | Não | `sqlite` | Mecanismo de persistência (`sqlite`, `in-memory`). |
| `MEMORY_SQLITE_PATH` | Não | `./data/foxty_memory.db` | Caminho do arquivo de banco de dados SQLite. |
| `PORT` | Não | `3000` | Porta HTTP do servidor e reverse-proxy. |
| `NODE_ENV` | Não | `development` | Ambiente de execução (`production` / `development`). |

---

## 3. Endpoints de Health Check e Monitoramento

Todos os endpoints estão disponíveis tanto na raiz quanto com o prefixo `/api`:

### 3.1. Visão Geral do Sistema: `GET /health` ou `GET /api/health`
Retorna o status agregado de todos os subsistemas (`ok`, `degraded` ou `unhealthy`):
```json
{
  "status": "ok",
  "timestamp": "2026-09-20T23:45:00.000Z",
  "uptime": 1425.8,
  "version": "0.1.0",
  "environment": "production",
  "discord": "connected",
  "deepseek": "connected",
  "memory": "connected",
  "sakuramail": "connected",
  "metrics": {
    "messagesObserved": 120,
    "brainConsultations": 45,
    "brainSkipped": 75,
    "aiResponses": 40,
    "fallbackResponses": 0,
    "silences": 80,
    "toolExecutions": 52,
    "memoryWrites": 8,
    "memoryReads": 45,
    "tokensUsed": 6800
  }
}
```

### 3.2. Saúde do DeepSeek: `GET /health/deepseek` ou `GET /api/health/deepseek`
Retorna status detalhado da conexão, tokens consumidos e estado do Circuit Breaker:
```json
{
  "configured": true,
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-flash",
  "status": "active",
  "circuitBreaker": "closed",
  "lastCallTimestamp": "2026-09-20T23:44:30.000Z",
  "lastTokensUsed": 165,
  "totalTokensUsed": 6800,
  "fallbackEnabled": false,
  "lastError": null,
  "latencyMs": 420
}
```

Para forçar um teste de ping em tempo real:
```bash
curl -X POST http://localhost:3000/api/health/deepseek/test
```

### 3.3. Saúde da Memória Persistente: `GET /health/memory` ou `GET /api/health/memory`
```json
{
  "provider": "sqlite",
  "connected": true,
  "readWriteOk": true,
  "totalRecords": 35,
  "lastOperation": "save",
  "lastOperationTimestamp": "2026-09-20T23:44:12.000Z",
  "storagePath": "/app/data/foxty_memory.db",
  "error": null
}
```

---

## 4. Troubleshooting e Diagnóstico Rápido

### A. DeepSeek em Standby (`standby_insufficient_balance` / Erro 402)
- **Causa**: A conta DeepSeek associada à chave está sem saldo ou expirada.
- **Comportamento do Bot**: O bot entra em standby protetivo, silencia de forma limpa sem poluir canais ou inventar respostas, e o Circuit Breaker abre.
- **Resolução**: Recarregue o saldo no dashboard da DeepSeek e o bot se recuperará automaticamente no próximo cooldown (60s) ou após executar `POST /api/health/deepseek/test`.

### B. Bot Não Responde a Menções no Discord
- **Causa 1**: A Privileged Intent `Message Content Intent` está desativada no Portal do Desenvolvedor do Discord.
- **Causa 2**: O canal onde a mensagem foi enviada possui a política de silêncio obrigatório (`foxtyPolicy === 'Silêncio Absoluto'`).
- **Resolução**: Verifique no Discord Developer Portal se a opção **Message Content Intent** está ligada; verifique `/api/channels` para ver a política do canal.

### C. Segurança e Logs
- Tokens do Discord e chaves de API nunca são exibidos em logs ou respostas HTTP; todas as saídas passam por sanitização automática (`sanitizeSensitiveData`).
