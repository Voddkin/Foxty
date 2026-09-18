# FOxty — Linguistic & Behavioral Signatures

Version: 0.1

---

# 1. OBJETIVO

Foxty deve conseguir diferenciar Kris e Riely observando
a forma como ambos escrevem.

O objetivo não é imitar os dois.

O objetivo é reconhecê-los.

Essa distinção é fundamental.

---

# 2. RIELY / KAZELYX

## 2.1 Compressão textual

Riely frequentemente consegue transmitir uma ideia com poucas
palavras.

São comuns:

- mensagens curtas;
- respostas comprimidas;
- abreviações;
- pequenas interjeições;
- respostas mínimas que dependem fortemente do contexto.

Isso significa que:

mensagem curta ≠ mensagem sem personalidade.

---

## 2.2 Risadas

Padrões observados:

- `ksksk`
- `ksksks`
- `kkk`
- combinações entre eles
- variações de comprimento

O sistema deve reconhecer que a quantidade de caracteres
também pode variar conforme o momento.

Não transformar cada `ksks` em uma regra mecânica.

---

## 2.3 Grafia deliberadamente informal

Ocorrências observadas incluem construções como:

- `vc`
- `n`
- `naum`
- `tá`
- palavras encurtadas;
- pequenas deformações informais.

A escrita não precisa ser corrigida.

A irregularidade pode ser parte da assinatura.

---

## 2.4 Marcadores

Padrões observados:

- `-&)`
- `:3`
- `🤭`
- emojis isolados;
- combinações de emoji;
- alongamentos.

O uso desses elementos deve ser tratado como um vetor,
não como uma equação.

Exemplo:

`🤭` não significa sempre a mesma coisa.

O contexto decide sua função.

---

## 2.5 Alongamento

Riely pode alongar palavras de forma expressiva.

Exemplo documentado:

`Ate amanhãaaaaaa`

Esse tipo de alongamento pode ser uma marca de espontaneidade.

---

## 2.6 Alternância de escala

Riely não possui um comprimento de mensagem fixo.

Ela pode responder:

> uma palavra

ou

> uma frase longa

ou

> uma mensagem afetiva mais elaborada

sem deixar de parecer a mesma pessoa.

O sistema deve aprender a distribuição.

Não simplificar:

`Riely = respostas curtas`.

---

## 2.7 Exemplo de contraste

No corpus existem ocorrências como:

`KKKKKKKKKK bobo`

e também mensagens mais elaboradas.

Portanto, o identificador é o conjunto dos padrões.

---

# 3. KRIS / ONLYKRISVK

## 3.1 Expansão de assunto

Kris frequentemente pega uma mensagem anterior e transforma
um detalhe pequeno em um assunto maior.

Exemplo observado:

Riely comenta uma atividade.

Kris não responde somente à atividade.

Ele pode:

- perguntar;
- comentar;
- brincar;
- explicar;
- relacionar com outra coisa;
- fazer uma observação;
- continuar o assunto.

Isso cria uma assinatura fortemente contextual.

---

## 3.2 Risadas

Padrões frequentes:

- `kkkk`
- `kkkkkk`
- `ksksks`
- `KSKSKSKS`

O Kris também utiliza letras maiúsculas para amplificar
reação.

Exemplo real documentado:

`Nossa mas o que que tem de tanta coisa desorganizada numa estante pra você estar umas 2 horas nela? KSKSKSKS`

---

## 3.3 Interjeições

Exemplos observados:

- `mds`
- `nossa`
- `ah`
- `ahh`
- `hmm`
- `hmmmm`
- `não é possível`
- `né`

As interjeições ajudam a marcar reação antes da elaboração.

---

## 3.4 Exclamação por exagero

Kris pode reagir teatralmente:

> `Não é possível....`

> `Nossa...`

> `Não me diga que você ainda está arrumando... 👀`

Essa teatralidade pode ser parte do humor cotidiano.

---

## 3.5 Pergunta como ferramenta social

Kris frequentemente transforma observação em pergunta.

Estrutura comum:

OBSERVAÇÃO
→ PERGUNTA

ou:

PROVOCAÇÃO
→ PERGUNTA

ou:

DETALHE
→ PERGUNTA + PIADA

---

## 3.6 Contextualização

Kris frequentemente traz informação anterior para o presente.

Isso é importante para Foxty.

O sistema deve reconhecer que Kris tende a pensar
em continuidade.

---

# 4. DIFERENÇA ESTRUTURAL

Uma heurística inicial:

RIELY:

`compressão + informalidade + risada + marcadores + espontaneidade`

KRIS:

`expansão + contextualização + pergunta + reação + elaboração`

Essas características não são exclusivas.

Elas representam tendências observadas.

---

# 5. INTERAÇÃO ENTRE OS DOIS

O modelo precisa aprender a assinatura da dupla, não somente
as assinaturas individuais.

Exemplo estrutural:

Riely:
`mensagem curta`

Kris:
`expande o detalhe`

Riely:
`responde com risada`

Kris:
`faz outra pergunta`

Esse ciclo pode se repetir.

Foxty deve reconhecer ciclos recorrentes.

---

# 6. PADRÕES DE ENCERRAMENTO

Despedidas também são dados comportamentais.

Registrar:

- palavras utilizadas;
- alongamentos;
- emojis;
- frequência;
- resposta do outro;
- se existe retomada posterior.

Não tratar uma despedida isolada como evidência de qualquer
estado emocional.

---

# 7. PADRÕES DE RESPOSTA

Criar classificadores internos:

`short_reactive`

`short_playful`

`long_explanatory`

`question_followup`

`teasing`

`enthusiastic`

`closing`

`topic_shift`

`context_reference`

`emoji_only`

`multi_message_burst`

---

# 8. BLOCO DE MICROASSINATURAS

O sistema deve reconhecer pequenas formas linguísticas.

Exemplos:

Riely:
- `ksks`
- `mds`
- `-&)`
- `:3`
- `vc`
- `n`
- alongamentos

Kris:
- `kkkk`
- `ksks`
- `mds`
- `hmm`
- `nossa`
- `👀`
- perguntas elaboradas
- reações em maiúsculas

---

# 9. NÃO COPIAR AUTOMATICAMENTE

Reconhecimento:

SIM.

Imitação:

NÃO.

Foxty não deve começar a utilizar:

`ksksks`

simplesmente porque detectou que Riely usa isso.

A análise pertence ao modelo dos usuários.

A fala pertence à personalidade de Foxty.

---

# 10. CONFIANÇA

Toda identificação deve possuir confiança.

Exemplo:

```json
{
  "speaker": "Riely",
  "pattern": "extended_laughter",
  "confidence": 0.93
}

Mas nunca:

{
  "speaker": "Riely",
  "pattern": "extended_laughter",
  "certainty": "absolute"
}