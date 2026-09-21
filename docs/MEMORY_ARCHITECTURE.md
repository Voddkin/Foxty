# Arquitetura de Memória Persistente do Foxty

Este documento descreve o funcionamento da camada de armazenamento persistente, o esquema relacional, as regras de retenção e as políticas de segurança/privacidade.

---

## 1. Visão Geral e Mecanismo de Armazenamento

A memória do Foxty utiliza o módulo nativo de alto desempenho **Node.js SQLite (`node:sqlite` / `DatabaseSync`)** através da classe `PersistentMemoryStore`.

- **Durabilidade**: Modo WAL (`PRAGMA journal_mode = WAL;`) e `PRAGMA synchronous = NORMAL;` para escrita atômica e leitura concorrente sem bloqueios.
- **Sobrevivência a Reinicializações**: Todos os registros, pontuações de relevância, tags e metadados sobrevivem a reinicializações de processos ou deploys.
- **Localização Padrão**: `./data/foxty_memory.db` (configurável via `MEMORY_SQLITE_PATH`).

---

## 2. Esquema Relacional do Banco de Dados

A tabela principal é `memories`:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'episodic' | 'semantic' | 'relationship' | 'server'
  importance REAL NOT NULL,            -- 0.0 a 1.0
  confidence REAL NOT NULL,            -- 0.0 a 1.0
  source TEXT NOT NULL,                -- Autor ou origem da observação
  target_user TEXT,                    -- 'Kris' | 'Riely' | 'Other' | null
  created_at TEXT NOT NULL,            -- ISO 8601 Timestamp
  last_confirmed TEXT,                 -- ISO 8601 Timestamp ou null
  safe_for_teasing INTEGER NOT NULL,   -- 1 (true) ou 0 (false)
  retention TEXT NOT NULL,             -- 'permanent' | 'session' | 'decay'
  tags TEXT NOT NULL                   -- Array serializado em JSON, ex: '["minecraft","oficina"]'
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_target ON memories(target_user);
CREATE INDEX IF NOT EXISTS idx_memories_safe ON memories(safe_for_teasing);
```

---

## 3. Políticas de Aceitação de Memórias (DeepSeek Candidates)

Quando o DeepSeek avalia o contexto de uma conversa e sugere novas memórias (`memoryCandidates`), o FoxtyCore aplica as seguintes regras antes de persistir:

1. **Gate do Canal**: Memórias só são salvas se o canal possuir permissão no `ChannelBehaviorPolicy` (`policy.canSaveMemories === true`).
2. **Filtro de Confiança**: Somente candidatos com **`confidence >= 0.85`** e tamanho textual mínimo de 3 caracteres são aceitos.
3. **Barreira SakuraMail**: Mensagens e interações vindas do canal SakuraMail (`caixa-de-correio` - `1549476613387845706`) **NUNCA** são persistidas na memória.
4. **Filtro de Dados Sensíveis**: Se o conteúdo contiver palavras-chave como `senha`, `password`, `token`, `secret`, `credencial`, `intimate`, `sexual`, `privad`, o campo `safeForTeasing` é **forçado para `false`**, impedindo que o bot use essa informação para brincadeiras ou provocações.

---

## 4. Tipos de Memória e Retenção

- **`episodic`**: Fatos específicos que aconteceram em conversas (ex.: "Riely plantou mudas de cerejeira perto da torre central").
- **`semantic`**: Conhecimento geral sobre o mundo ou os participantes (ex.: "Kris prefere projetos de infraestrutura de redstone").
- **`relationship`**: Dinâmica de interação entre membros (ex.: afinidade, estilo de humor).
- **`server`**: Regras e lore canônica do servidor Cherry Place.

### Políticas de Retenção:
- **`permanent`**: Memórias centrais que nunca expiram.
- **`decay`**: Memórias cujo peso decai com o tempo se não forem reforçadas.
- **`session`**: Memórias de contexto temporário que podem ser expurgadas via `memoryStore.expire()`.

---

## 5. Diagnóstico e Monitoramento da Memória

Você pode verificar o estado da memória a qualquer momento:

```bash
curl http://localhost:3000/api/health/memory
```

Exemplo de resposta:
```json
{
  "provider": "sqlite",
  "connected": true,
  "readWriteOk": true,
  "totalRecords": 42,
  "lastOperation": "save",
  "lastOperationTimestamp": "2026-09-20T23:45:00.123Z",
  "storagePath": "/app/data/foxty_memory.db",
  "error": null
}
```
