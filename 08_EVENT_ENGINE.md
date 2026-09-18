# FOxty — Event Engine

Version: 0.1

---

# 1. PROPÓSITO

O Event Engine controla eventos espontâneos,
reativos e programados.

Ele é responsável por decidir:

- quando Foxty pode aparecer;
- onde;
- por quê;
- com qual intensidade;
- com qual raridade;
- em qual formato;
- se vale a pena gastar uma chamada de IA.

---

# 2. PRINCÍPIO

Foxty não deve falar só porque pode.

O evento precisa passar por uma decisão:

```text
CAN I?
SHOULD I?
IS THIS INTERESTING?
IS THIS THE RIGHT MOMENT?
3. TIPOS
Reactive

Resposta a uma mensagem.

Spontaneous

Foxty aparece sem ser chamado.

Scheduled

Evento baseado em horário.

Contextual

Algo no canal ou conversa cria oportunidade.

Episodic

Continuação de evento anterior.

Rare

Evento incomum com chance limitada.

Legendary

Evento extremamente raro.

4. RARIDADE

Categorias:

COMMON
UNCOMMON
RARE
VERY_RARE
LEGENDARY
ANOMALOUS

Cada categoria deve possuir:

chance;
cooldown;
canais permitidos;
tamanho máximo;
necessidade ou não de IA.
5. EXEMPLO
{
  "id": "foxty_random_observation",
  "rarity": "common",
  "chance": 0.03,
  "cooldown_minutes": 90,
  "requires_ai": false
}
6. EVENTOS SEM IA

A maior parte dos eventos simples pode ser criada
deterministicamente.

Exemplos:

eu estou vendo.

...

alguém mexeu nisso?

isso parece suspeito.

eu tenho uma pergunta.

Esse sistema reduz custo.

7. EVENTOS COM IA

Usar DeepSeek quando:

a situação é contextual;
a resposta depende de várias mensagens;
existe oportunidade de humor específico;
é necessário escolher entre várias interpretações;
é necessário improviso;
uma intervenção precisa parecer natural.
8. EVENTO ESPONTÂNEO

Pipeline:

scheduler
↓
evento candidato
↓
cooldown
↓
canal
↓
atividade recente
↓
probabilidade
↓
decisão
↓
IA opcional
↓
execução
9. SILÊNCIO

O Event Engine precisa possuir um resultado:

{
  "decision": "ignore"
}

Esse resultado é perfeitamente válido.

10. INTERVALOS

Não permitir eventos espontâneos em cascata.

Exemplo:

Após um evento espontâneo:

global_cooldown = 20–60 min

Com valores ajustáveis.

11. ATIVIDADE HUMANA

Eventos espontâneos devem depender da atividade.

Exemplo:

Se ninguém falou no servidor durante 8 horas:

Foxty pode ter um evento específico.

Se Kris e Riely estão conversando intensamente:

Foxty pode decidir não interromper.

12. PRESENÇA

Foxty pode ocasionalmente:

reagir sem falar;
falar depois;
aparecer depois que um assunto começou;
retornar a um tópico.

Isso produz sensação de presença.

13. MULTI-MESSAGE BURST

Um evento raro pode gerar múltiplas mensagens.

Exemplo:

pera

pera.

EU TIVE UMA IDEIA

ou:

não.

...

ok.

Limite:

máximo configurável.

Nunca tornar padrão.

14. OUTRO CANAL

Um evento pode direcionar Foxty para um canal diferente.

Exemplo:

Uma descoberta de Minecraft acontece.

Foxty pode aparecer em:

🌎 — mapas・e・explorações

em vez de:

💬 — conversas・diárias.

15. EVENTOS NO MINECRAFT

Futuros eventos podem ser baseados em:

retorno à base;
nova construção;
descoberta;
coordenada;
Allay;
Pillager;
raid;
cavalo;
galinhas;
decoração;
mudança de área.

Esses eventos podem ser alimentados pelo usuário ou
por integração futura.

16. SAKURAMAIL

Eventos de SakuraMail devem ser abstratos.

Exemplo:

{
  "type": "letter_opened",
  "user": "current_user"
}

Foxty NÃO deve receber conteúdo da carta.

17. COOLDOWNS

Tipos:

global
channel
event
user
conversation
rare_event
ai
18. BUDGET

Cada evento pode declarar:

{
  "ai_cost_class": "none|low|medium|rare"
}

A aplicação pode negar chamadas se o orçamento diário/mensal
estiver acima do limite.

19. PRIORIDADE

Eventos podem possuir prioridade:

1 = quase invisível
5 = normal
10 = importante
100 = emergência

O sistema escolhe o evento com maior prioridade válida.

20. CANCELAMENTO

O Core pode cancelar um evento mesmo que a IA tenha sugerido.

Motivos:

canal protegido;
cooldown;
spam;
contexto inadequado;
limite atingido;
ferramenta indisponível.
21. AUDITORIA

Todo evento deve gerar log:

{
  "event_id": "abc",
  "timestamp": "...",
  "channel": "...",
  "decision": "respond",
  "ai_used": true,
  "execution": "success"
}

O conteúdo completo pode ser opcional conforme a política de logs.

22. PRINCÍPIO FINAL

A imprevisibilidade deve existir no personagem.

A previsibilidade deve existir no motor.

FOXTY = unpredictable

ENGINE = controlled