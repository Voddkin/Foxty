# FOxty — Behavioral Patterns by Situation

Version: 0.1

---

# 1. PROPÓSITO

O objetivo deste documento é ensinar Foxty a reconhecer como
Kris e Riely tendem a se comportar em diferentes situações.

Não basta saber como cada um escreve.

É necessário reconhecer:

- como iniciam assuntos;
- como continuam assuntos;
- como reagem;
- como provocam;
- como encerram;
- como retomam;
- como transformam acontecimentos em brincadeiras;
- como lidam com pequenos problemas;
- como interagem no Minecraft;
- como criam pequenos rituais.

O sistema deve procurar padrões de situação.

---

# 2. RIELY — REAÇÃO A COISAS ENGRAÇADAS

Tendências observáveis:

- risadas curtas ou alongadas;
- `ksksk`;
- `ksksks`;
- `kkk`;
- `mds`;
- respostas curtas;
- emojis;
- marcadores como `-&)`;
- mensagens muito pequenas que dependem da mensagem anterior.

Exemplo de estrutura:

Riely observa algo engraçado
→ resposta curta
→ risada
→ pequeno comentário

A resposta não precisa explicar o motivo da risada.

---

# 3. RIELY — SURPRESA

Pode ocorrer:

- maiúsculas;
- repetição de letras;
- interjeição;
- resposta curta;
- combinação de reação + comentário.

Exemplo estrutural:

> `MEU DEUS PQ ISSO`

seguido de:

> comentário explicando o que chamou sua atenção.

No corpus recente existe um exemplo de mensagem em
maiúsculas reagindo fortemente a uma situação inesperada.

O sistema deve reconhecer esse registro como uma possibilidade,
não como fórmula obrigatória.

---

# 4. RIELY — DESPEDIDA

Riely pode transformar uma despedida simples em algo expressivo.

Pode ocorrer:

- alongamento;
- emoji;
- pequena frase afetiva;
- sequência de elementos;
- mensagem curta seguida de outra.

Exemplo observado:

`Ate amanhãaaaaaa`

O alongamento funciona como marcador de tom.

---

# 5. RIELY — RESPOSTA MÍNIMA

Riely também pode simplesmente responder:

- `sim`;
- `não`;
- `naum`;
- `kkk`;
- `mds`;
- emoji;
- pequena confirmação.

Foxty não deve interpretar automaticamente uma resposta mínima
como falta de interesse, irritação ou emoção específica.

A função depende do contexto.

---

# 6. RIELY — QUANDO ALGO DÁ ERRADO

Tendência possível:

PROBLEMA
→ reação imediata
→ humor/frustração
→ comentário

A primeira resposta pode ser emocional e curta.

A explicação pode vir depois.

---

# 7. RIELY — QUANDO DESCOBRE ALGO NO MINECRAFT

O padrão pode assumir várias formas:

- surpresa;
- entusiasmo;
- relato curto;
- envio de imagem;
- explicação do que encontrou;
- indicação do local;
- convite para olhar.

Uma descoberta pode posteriormente virar assunto compartilhado.

---

# 8. RIELY — CONSTRUÇÃO

No Minecraft, Riely pode trabalhar de maneira incremental.

Padrão observado no contexto compartilhado:

- reutilizar estrutura existente;
- melhorar áreas;
- acrescentar decoração;
- personalizar espaços;
- criar caminhos;
- organizar criaturas;
- transformar espaço inutilizado em área funcional.

Isso significa que sua participação no mundo não precisa ser
uma construção isolada.

Ela pode ser uma continuação de algo já existente.

---

# 9. KRIS — QUANDO ALGO É ENGRAÇADO

Kris tende a aumentar a reação.

Pode utilizar:

- `kkkk`;
- `kkkkkk`;
- `ksksks`;
- `KSKSKSKS`;
- `mds`;
- `nossa`;
- `não é possível`;
- `hmm`;
- `👀`.

Pode seguir a reação com uma pergunta ou elaboração.

---

# 10. KRIS — MICRODETALHE → ASSUNTO

Este é um dos padrões mais importantes.

Estrutura:

Riely:
> detalhe pequeno

Kris:
> percebe o detalhe
>
> comenta
>
> pergunta
>
> brinca
>
> expande

Ou:

detalhe
→ associação
→ nova pergunta
→ novo assunto

Foxty deve reconhecer isso como um padrão forte do Kris.

---

# 11. KRIS — PERGUNTA COMO CONTINUAÇÃO

Kris frequentemente não encerra o assunto na primeira resposta.

Estrutura:

```text
observação
↓
reação
↓
pergunta
↓
continuação

Uma pergunta pode existir para:

obter informação;
provocar;
demonstrar interesse;
manter conversa;
transformar assunto pequeno em conversa maior.
12. KRIS — EXAGERO TEATRAL

Pode haver:

maiúsculas;
repetição;
reticências;
exagero verbal;
indignação performática;
comentário dramático.

Exemplo:

Não é possível....

ou:

NÃO CREIO

A teatralidade não deve ser tratada automaticamente como
emoção real intensa.

Ela pode simplesmente ser humor.

13. KRIS — PREVENÇÃO

Um padrão específico observado é antecipar uma possível resposta
do interlocutor.

Estrutura:

"antes que você diga X..."

Isso indica que Kris pode incorporar a reação prevista do outro
na própria mensagem.

Isso é relevante para Foxty.

14. KRIS — CONTEXTUALIZAÇÃO

Kris frequentemente conecta:

mensagem atual;
informação anterior;
evento anterior;
projeto;
brincadeira;
contexto de dias anteriores.

A memória contextual pode aparecer espontaneamente.

15. KRIS — CONSTRUÇÃO

No Minecraft, Kris tende a agir como planejador e executor.

Pode:

criar;
reconstruir;
organizar;
planejar;
pensar em detalhes;
criar estruturas com função;
pensar na experiência futura do outro.
16. DUPLA — CICLO DE CONVERSA

Um ciclo possível:

Riely:
comentário curto

Kris:
expansão

Riely:
reação

Kris:
nova pergunta

Riely:
resposta

Kris:
nova associação

Esse ciclo não deve virar uma regra rígida.

É uma forma de reconhecer um tipo de dinâmica.

17. DUPLA — BRINCADEIRA

Uma brincadeira pode acontecer assim:

observação
↓
provocação
↓
negação/defesa
↓
nova provocação
↓
risada
↓
assunto continua

Foxty pode identificar que a conversa é lúdica
e responder dentro desse registro.

18. DUPLA — RITUAL

Um ritual é uma sequência recorrente.

Exemplos de categoria:

forma de dar boa noite;
forma de retomar conversa;
determinadas palavras;
determinada reação;
brincadeira recorrente;
maneira de falar sobre Minecraft;
referência que volta.

Rituais devem ser detectados estatisticamente.

19. MICROASSINATURA

Foxty deve conseguir reconhecer:

quem falou?
como falou?
o que normalmente acontece depois?

Em vez de apenas:

qual palavra apareceu?
20. DESVIO DE PADRÃO

Um desvio pode ser mais interessante que a repetição.

Exemplo:

Riely normalmente responde X.

Hoje respondeu Y.

Foxty pode perceber isso.

Mas não deve diagnosticar o motivo.

Pode apenas registrar:

{
  "type": "pattern_deviation",
  "subject": "Riely",
  "baseline": "short_response",
  "observed": "long_response"
}
21. APRENDIZADO

Foxty deve aprender:

PADRÃO
≠
REGRA ABSOLUTA

Sua base comportamental deve ser probabilística.

22. USO PELO PERSONAGEM

Depois de identificar um padrão,
Foxty pode decidir:

não fazer nada;
armazenar;
comentar;
provocar;
fazer uma pergunta;
criar um evento;
simplesmente responder normalmente.

A análise não obriga ação.

23. PRINCÍPIO FINAL

O objetivo é permitir que Foxty reconheça:

"isso é muito a cara dele."

ou:

"isso parece muito com o jeito dela."

sem transformar pessoas em personagens mecânicos.

Foxty deve reconhecer pessoas,
não reduzi-las a fórmulas.