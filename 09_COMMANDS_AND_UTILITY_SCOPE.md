# FOxty — Commands & Utility Scope

Version: 0.1

---

# 1. PRINCÍPIO

Comandos são ferramentas.

Eles não definem Foxty.

Foxty deve continuar funcional mesmo se nenhum comando existir
além do comando principal.

---

# 2. CATEGORIAS

## Core

Interação principal com Foxty.

## Utility

Ferramentas práticas.

## Memory

Consulta ou gerenciamento controlado de memórias.

## Server

Informações sobre Cherry Place.

## Fun

Jogos e brincadeiras.

## Admin

Ferramentas exclusivas do administrador.

---

# 3. COMANDO PRINCIPAL

Proposta:

`/foxty`

Função:

interagir diretamente com Foxty.

A mesma chamada pode resultar em:

- resposta útil;
- brincadeira;
- pergunta;
- recusa teatral;
- comentário;
- evento;
- resposta extremamente curta;
- resposta mais longa.

Não criar subcomandos sem necessidade.

---

# 4. UTILIDADES CANDIDATAS

Estas são candidatas, não obrigatórias:

- sorteio;
- dado;
- moeda;
- escolha;
- lembrete;
- cronômetro;
- consulta de status;
- consulta de memória;
- consulta de evento.

---

# 5. STATUS

Possível:

`/foxty status`

Pode retornar:

- humor;
- energia;
- curiosidade;
- caos;
- eventos recentes;
- estado do personagem.

Mas o comando não deve expor informações internas excessivas
ou técnicas desnecessárias.

---

# 6. MEMORY

Possíveis operações:

`/foxty lembrar`

`/foxty esquecer`

`/foxty memória`

Essas operações devem ser permissionadas.

---

# 7. FUN

Mini-jogos podem ser adicionados posteriormente.

Exemplos:

- dado;
- moeda;
- adivinhação;
- código;
- desafio;
- caça ao tesouro;
- quiz.

Não são prioridade do MVP.

---

# 8. ADMIN

Comandos administrativos podem existir para:

- ativar/desativar eventos;
- alterar cooldowns;
- inspecionar logs;
- testar DeepSeek;
- testar ferramentas;
- recarregar JSON;
- recarregar configuração.

---

# 9. NÃO IMPLEMENTAR AUTOMATICAMENTE

Não criar dezenas de comandos somente porque são fáceis.

Toda nova função precisa responder:

```text
isso realmente aumenta o Foxty?

Se não:

não implementar.

10. COMANDO ≠ AÇÃO

Uma função pode existir sem possuir comando público.

Exemplo:

Foxty possui sistema de eventos espontâneos.

Não existe:

/foxty evento

para cada acontecimento.

O motor controla isso.

11. INTERFACE FUTURA

Se necessário, podem existir:

botões;
modais;
menus;
selects;
respostas efêmeras.

Mas somente quando a interação realmente se beneficiar deles.

12. PRINCÍPIO FINAL

Primeiro personagem.

Depois ferramentas.

Nunca o contrário.