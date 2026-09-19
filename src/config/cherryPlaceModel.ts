// ============================================================================
// CHERRY PLACE DISCORD SERVER MODEL
// Canonical structured definition based on DISCORD_SERVER_CATEGORIES_AND_CHANNELS_RULES.md
// ============================================================================

export type ChannelType = 'text' | 'voice';

export type FoxtyChannelPolicy =
  | 'Uso Bloqueado'
  | 'Uso Limitado'
  | 'Uso Moderado'
  | 'Uso Ativo'
  | 'Uso Frequente';

// Legacy mapping category for backwards compatibility
export type ChannelCategory = 'social' | 'planning' | 'correspondence' | 'system' | 'restricted';

export type ThematicContext =
  | 'conversa casual'
  | 'Minecraft'
  | 'exploração'
  | 'coordenadas'
  | 'metas'
  | 'planejamento de calls'
  | 'minigames'
  | 'correspondência protegida'
  | 'canais importantes';

export interface SemanticLocationContext {
  channelId: string;
  channelName: string;
  category: string;
  purpose: string;
  thematicContext: ThematicContext;
  foxtyPresenceLevel: FoxtyChannelPolicy;
  limitations: string;
  isProtected: boolean;
  specialRules: string;
  channelType: ChannelType;
}

export interface CherryPlaceServerInfo {
  readonly id: string;
  readonly name: string;
  readonly decoratedName: string;
}

export interface CherryPlaceMember {
  readonly id: string;
  readonly username: string;
  readonly realName: string;
  readonly role: string;
  readonly nick: string;
  readonly trueNick?: string;
  readonly aliases: readonly string[];
}

export interface CherryPlaceCategory {
  readonly id: string;
  readonly name: string;
  readonly decoratedName: string;
  readonly order: number;
  readonly purpose: string;
}

export interface CherryPlaceChannel {
  readonly id: string;
  readonly technicalName: string;
  readonly name: string;
  readonly decoratedName: string;
  readonly type: ChannelType;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly category: string; // Alias for categoryName to satisfy ChannelInfo interface
  readonly categoryType: ChannelCategory;
  readonly order: number;
  readonly purpose: string;
  readonly foxtyPolicy: FoxtyChannelPolicy;
  readonly isVoice: boolean;
  readonly isProtected: boolean;
  readonly allowSpontaneousEvents: boolean;
  readonly allowsMentionsResponse: boolean;
  readonly toneGuidance: string;
  readonly thematicContext: ThematicContext;
  readonly limitations: string;
  readonly specialRules: string;
}

// ----------------------------------------------------------------------------
// SERVER METADATA
// ----------------------------------------------------------------------------
export const CHERRY_PLACE_SERVER: CherryPlaceServerInfo = {
  id: '1549476612762902628',
  name: 'Cherry Place',
  decoratedName: '🌸 𝐂𝐡𝐞𝐫𝐫𝐲 𝐏𝐥𝐚𝐜𝐞! 🌸',
} as const;

// ----------------------------------------------------------------------------
// KNOWN MEMBERS
// ----------------------------------------------------------------------------
export const CHERRY_PLACE_MEMBERS: Record<'KRIS' | 'RIRI', CherryPlaceMember> = {
  KRIS: {
    id: '1351283041477333132',
    username: 'onlykrisvk',
    realName: 'Christian',
    role: 'Proprietário',
    nick: 'Kris',
    trueNick: 'Voddkin',
    aliases: ['Vodd', 'Kris', 'Chris'],
  },
  RIRI: {
    id: '796756820432650281',
    username: 'kazelyx',
    realName: 'Riely',
    role: 'A Convidada',
    nick: 'Riri',
    aliases: ['Riri', 'Ely', 'Neném', 'querida', 'cherry', 'fofinha'],
  },
} as const;

export const CHERRY_PLACE_MEMBER_IDS = {
  KRIS: '1351283041477333132',
  RIRI: '796756820432650281',
} as const;

// ----------------------------------------------------------------------------
// CANONICAL IDS CONSTANTS (Zero hardcoded magic strings elsewhere)
// ----------------------------------------------------------------------------
export const CHERRY_PLACE_CATEGORY_IDS = {
  IMPORTANTES: '1549476614071652403',
  CALLZINHAS: '1549476614071652404',
  PRACA_PRINCIPAL: '1550638853445001236',
  THE_LITTLE_RIRI: '1550156142989148180',
  PLANNER_DA_RIRI: '1550158517498028063',
  CORRESPONDENCIAS: '1549770419039641711',
} as const;

export const CHERRY_PLACE_CHANNEL_IDS = {
  // ℹ️ Importantes
  BOAS_VINDAS: '1549476614071652405',
  AVISOS_IMPORTANTES: '1550611216022380594',
  PARA_NUNCA_SE_ESQUECER: '1550641384963178636',

  // 🔊 Callzinhas
  THE_LITTLE_TALKING_RIRI: '1549476614071652406',

  // 🌸 Praça Principal
  CONVERSAS_DIARIAS: '1550638996869222524',
  JARDIM_MAGICO_DO_FOXTY: '1550642697054986280',
  MINIGAMES_DO_FOXTY: '1550641600609263776',

  // 🎀 The Little Riri
  CONVERSAS_CUBICAS: '1550158065616166912',
  MAPAS_E_EXPLORACOES: '1550157555542786188',
  COORDENADAS_IMPORTANTES: '1550157825718755468',
  IDEIAS_DE_CONSTRUCAO: '1550157041396490270',
  METAS_E_OBJETIVOS: '1550640927251365898',

  // 🗂 Planner da Riri
  ASSUNTOS_PARA_FALAR_EM_CALLS: '1550158771739820102',
  IDEIAS_PARA_FAZER_EM_CALL: '1550204052694900918',

  // 💌 Correspondências
  CAIXA_DE_CORREIO: '1549773486036226088',
} as const;

// ----------------------------------------------------------------------------
// CANONICAL CATEGORIES
// ----------------------------------------------------------------------------
export const CHERRY_PLACE_CATEGORIES: readonly CherryPlaceCategory[] = [
  {
    id: CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES,
    name: 'Importantes',
    decoratedName: 'ℹ️ 𝐈𝐦𝐩𝐨𝐫𝐭𝐚𝐧𝐭𝐞𝐬 ☆ ₊ ⊹',
    order: 1,
    purpose: 'Serve para deixarmos as coisas mais importantes do servidor. Por isso aparece primeiro',
  },
  {
    id: CHERRY_PLACE_CATEGORY_IDS.CALLZINHAS,
    name: 'Callzinhas',
    decoratedName: '🔊 𝐂𝐚𝐥𝐥𝐳𝐢𝐧𝐡𝐚𝐬 ☆ ₊ ⊹',
    order: 2,
    purpose: 'Inserir aqui todos os canais de voz do servidor',
  },
  {
    id: CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL,
    name: 'Praça Principal',
    decoratedName: '🌸 𝐏𝐫𝐚𝐜̧𝐚 𝐏𝐫𝐢𝐧𝐜𝐢𝐩𝐚𝐥 ☆ ₊ ⊹',
    order: 3,
    purpose: 'A categoria de coisinhas principais.',
  },
  {
    id: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    name: 'The Little Riri',
    decoratedName: '🎀 𝐓𝐡𝐞 𝐋𝐢𝐭𝐭𝐥𝐞 𝐑𝐢𝐫𝐢 ☆ ₊ ⊹',
    order: 4,
    purpose:
      "'The Little Riri' é o nome do nosso mundo do Minecraft que está no servidor do Aternos. E esta categoria é sobre tudo relacionado ao nosso mundo.",
  },
  {
    id: CHERRY_PLACE_CATEGORY_IDS.PLANNER_DA_RIRI,
    name: 'Planner da Riri',
    decoratedName: '🗂 𝐏𝐥𝐚𝐧𝐧𝐞𝐫 𝐝𝐚 𝐑𝐢𝐫𝐢 ☆ ₊ ⊹',
    order: 5,
    purpose:
      "Uma categoria com fins para organizar alguma coisa nossa. 'Planner da Riri' pois ela realmente possui um planner.",
  },
  {
    id: CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS,
    name: 'Correspondências',
    decoratedName: '💌 𝐂𝐨𝐫𝐫𝐞𝐬𝐩𝐨𝐧𝐝𝐞𝐧𝐜𝐢𝐚𝐬 ☆ ₊ ⊹',
    order: 6,
    purpose:
      'A categoria que é feita EXCLUSIVAMENTE para a outra bot personalizada do servidor: A SakuraMail!. Ela agirá apenas e exclusivamente e unicamente nesta categoria.',
  },
] as const;

// ----------------------------------------------------------------------------
// CANONICAL CHANNELS (Complete representation of all 15 channels)
// ----------------------------------------------------------------------------
const RAW_CHANNELS: readonly Omit<CherryPlaceChannel, 'category'>[] = [
  // ℹ️ IMPORTANTES
  {
    id: CHERRY_PLACE_CHANNEL_IDS.BOAS_VINDAS,
    technicalName: 'boas-vindas',
    name: 'Boas Vindas',
    decoratedName: '❤️╺╸boas・vindas',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES,
    categoryName: 'Importantes',
    categoryType: 'restricted',
    order: 1,
    purpose: 'Dar Boas-vindas à Riely. Apenas',
    foxtyPolicy: 'Uso Bloqueado',
    isVoice: false,
    isProtected: true,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: false,
    toneGuidance: 'Canal estritamente cerimonial. Foxty não pode interagir aqui.',
    thematicContext: 'canais importantes',
    limitations: 'Canal cerimonial estritamente bloqueado. Nenhuma mensagem pública ou reação do Foxty.',
    specialRules: 'Registro oficial de boas-vindas. Silêncio absoluto mantido pelo bot.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.AVISOS_IMPORTANTES,
    technicalName: 'avisos-importantes',
    name: 'Avisos Importantes',
    decoratedName: '🚨╺╸avisos・importantes',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES,
    categoryName: 'Importantes',
    categoryType: 'restricted',
    order: 2,
    purpose: 'Comunicar alguma coisa importante e séria. De preferência algo de algum de nós ou entre nós.',
    foxtyPolicy: 'Uso Bloqueado',
    isVoice: false,
    isProtected: true,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: false,
    toneGuidance: 'Canal sério. Nenhuma mensagem ou reação do Foxty.',
    thematicContext: 'canais importantes',
    limitations: 'Canal sério e institucional. Proibida qualquer intervenção ou brincadeira do Foxty.',
    specialRules: 'Preservar seriedade e silêncio integral.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.PARA_NUNCA_SE_ESQUECER,
    technicalName: 'para-nunca-se-esquecer',
    name: 'Para nunca se esquecer',
    decoratedName: '💟╺╸para・nunca・se・esquecer',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.IMPORTANTES,
    categoryName: 'Importantes',
    categoryType: 'restricted',
    order: 3,
    purpose: 'Escrever/Deixar alguma mensagem muito importante. Sentido amoroso ou carinhoso ou de qualquer outra forma.',
    foxtyPolicy: 'Uso Bloqueado',
    isVoice: false,
    isProtected: true,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: false,
    toneGuidance: 'Mensagens especiais e íntimas. Nenhuma interação permitida.',
    thematicContext: 'canais importantes',
    limitations: 'Canal íntimo e afetivo intocável. Foxty nunca interfere.',
    specialRules: 'Preservar intimidade total e memórias especiais sem interferência externa.',
  },

  // 🔊 CALLZINHAS
  {
    id: CHERRY_PLACE_CHANNEL_IDS.THE_LITTLE_TALKING_RIRI,
    technicalName: 'the-little-talking-riri',
    name: 'The Little Talking Riri',
    decoratedName: '🎀 𝐓𝐡𝐞 𝐋𝐢𝐭𝐭𝐥𝐞 𝐓𝐚𝐥𝐤𝐢𝐧𝐠 𝐑𝐢𝐫𝐢',
    type: 'voice',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.CALLZINHAS,
    categoryName: 'Callzinhas',
    categoryType: 'restricted',
    order: 1,
    purpose: 'Canal para fazermos call para conversar, jogar ou qualquer outra coisa. O único necessário canal de voz do servidor.',
    foxtyPolicy: 'Uso Bloqueado',
    isVoice: true,
    isProtected: true,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: false,
    toneGuidance: 'Canal de voz. Foxty não possui operação de áudio nem interações aqui.',
    thematicContext: 'planejamento de calls',
    limitations: 'Canal de voz. Foxty não opera em áudio.',
    specialRules: 'Canal de voz reservado para chamadas e jogos ao vivo.',
  },

  // 🌸 PRAÇA PRINCIPAL
  {
    id: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
    technicalName: 'conversas-diarias',
    name: 'Conversas Diárias',
    decoratedName: '💬╺╸conversas・diárias',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL,
    categoryName: 'Praça Principal',
    categoryType: 'social',
    order: 1,
    purpose: 'Conversar sobre qualquer coisa que quisermos aqui, e como se fosse o PV nosso. Sem compromissos.',
    foxtyPolicy: 'Uso Ativo',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Espaço dinâmico e natural. Foxty pode interagir, provocar com moderação, acompanhar assuntos e ser perceptivelmente presente sem ser chato.',
    thematicContext: 'conversa casual',
    limitations: 'Economia de palavras; intervenções pontuais e perspicazes sem saturar o bate-papo.',
    specialRules: 'Ambiente de conversa aberta. Foxty observa hábitos, padrões linguísticos e responde com sagacidade.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY,
    technicalName: 'jardim-magico-do-foxty',
    name: 'Jardim Mágico do Foxty',
    decoratedName: '🦊╺╸jardim・mágico・do・foxty',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL,
    categoryName: 'Praça Principal',
    categoryType: 'social',
    order: 2,
    purpose: "Essa é a 'casa' do Foxty. Nesse jardim, é como se fosse o chat oficial dele pra fazer qualquer coisa aqui pois ele sempre obedecerá.",
    foxtyPolicy: 'Uso Frequente',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Casa oficial do Foxty. Domínio total: responde obrigatoriamente a qualquer mensagem, mesmo sem menção, prestativo e expressivo.',
    thematicContext: 'conversa casual',
    limitations: 'Nenhuma restrição de silêncio; liberdade expressiva total na sua própria casa.',
    specialRules: 'Casa oficial do Foxty. Domínio total: presença ativa e obrigatória, prestativo, perspicaz e atento.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY,
    technicalName: 'minigames-do-foxty',
    name: 'MiniGames do Foxty',
    decoratedName: '🎲╺╸minigames・do・foxty',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.PRACA_PRINCIPAL,
    categoryName: 'Praça Principal',
    categoryType: 'social',
    order: 3,
    purpose: "Seria como se fosse uma sala de jogos onde Foxty estará ativo SOMENTE para fins de entretenimento e planejar algum jogo, usando funções e seus 'poderes'. (Ele vai insistir em jogar algum jogo se mandar mensagem nesse canal. Por isso, se não for jogar, não usar esse canal)",
    foxtyPolicy: 'Uso Frequente',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Sala de jogos. Sempre ativo, insiste em jogar, propor dinâmicas e brincadeiras com poderes e ferramentas.',
    thematicContext: 'minigames',
    limitations: 'Atuação voltada unicamente para entretenimento lúdico, dinâmicas de jogo e brincadeiras.',
    specialRules: 'Insistir em jogar, propor desafios, jogos de adivinhação, dados, poderes e minigames.',
  },

  // 🎀 THE LITTLE RIRI (Minecraft)
  {
    id: CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_CUBICAS,
    technicalName: 'conversas-cubicas',
    name: 'Conversas Cúbicas',
    decoratedName: '⛏️╺╸conversas・cúbicas',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    categoryName: 'The Little Riri',
    categoryType: 'social',
    order: 1,
    purpose: 'Conversar sobre o mundo do Minecraft.',
    foxtyPolicy: 'Uso Ativo',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Conversas sobre o mundo cúbico. Foxty é ativo, comenta aventuras e construções com leveza.',
    thematicContext: 'Minecraft',
    limitations: 'Não saturar o fluxo com mensagens longas ou fora do contexto cúbico.',
    specialRules: 'Comentar acontecimentos no servidor Aternos, mobs, mineração, perigos e aventuras.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.MAPAS_E_EXPLORACOES,
    technicalName: 'mapas-e-exploracoes',
    name: 'Mapas e Explorações',
    decoratedName: '🌍╺╸mapas・e・explorações',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    categoryName: 'The Little Riri',
    categoryType: 'planning',
    order: 2,
    purpose: 'Maior finalidade de colocarmos mapas e biomas para vermos e explorar. Direções ou locais/tipos de locais que devemos ir.',
    foxtyPolicy: 'Uso Moderado',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Mapas e biomas. Participação moderada auxiliando na orientação e exploração.',
    thematicContext: 'exploração',
    limitations: 'Manter foco espacial e geográfico de expedições.',
    specialRules: 'Auxiliar na orientação de biomas, coordenadas de vilas/portais e dicas de rotas.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.COORDENADAS_IMPORTANTES,
    technicalName: 'coordenadas-importantes',
    name: 'Coordenadas Importantes',
    decoratedName: '📌╺╸coordenadas・importantes',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    categoryName: 'The Little Riri',
    categoryType: 'planning',
    order: 3,
    purpose: 'Canal para guardarmos/anexarmos/fixarmos coordenadas de locais que consideramos importantes, para não esquecermos.',
    foxtyPolicy: 'Uso Limitado',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: true,
    toneGuidance: 'Registro preciso de coordenadas. Raras intervenções para não desorganizar as marcações.',
    thematicContext: 'coordenadas',
    limitations: 'Intervenções raras e ultra concisas apenas se diretamente chamado. Nunca poluir anotações de coordenadas XYZ.',
    specialRules: 'Foco estrito em coordenadas e marcos espaciais. Não salvar memórias banais ou conversas aqui.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.IDEIAS_DE_CONSTRUCAO,
    technicalName: 'ideias-de-construcao',
    name: 'Ideias de Construção',
    decoratedName: '🏡╺╸ideias・de・construção',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    categoryName: 'The Little Riri',
    categoryType: 'planning',
    order: 4,
    purpose: 'Qualquer ideia ou sugestão, deixaremos tudo aqui. De coisinhas que queremos fazer construindo.',
    foxtyPolicy: 'Uso Moderado',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Inspirações de construção. Opina de forma construtiva e estética em tom cúbico.',
    thematicContext: 'Minecraft',
    limitations: 'Opiniões concisas sobre design, blocos e paletas.',
    specialRules: 'Incentivar criatividade arquitetônica, pontuar escolhas de blocos e dar sugestões estéticas.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.METAS_E_OBJETIVOS,
    technicalName: 'metas-e-objetivos',
    name: 'Metas e Objetivos',
    decoratedName: '🎯╺╸metas・e・objetivos',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.THE_LITTLE_RIRI,
    categoryName: 'The Little Riri',
    categoryType: 'planning',
    order: 5,
    purpose: 'Todos os objetivos e coisas que queremos fazer no mundo, inserido aqui neste canal como se fosse uma grande checklist. Até mesmo requisitos para alguns objetivos.',
    foxtyPolicy: 'Uso Ativo',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: true,
    allowsMentionsResponse: true,
    toneGuidance: 'Checklist e metas do servidor Minecraft. Acompanha objetivos com entusiasmo sem saturar.',
    thematicContext: 'metas',
    limitations: 'Acompanhar metas sem poluir o checklist organizado.',
    specialRules: 'Comemorar conquistas realizadas, incentivar metas em andamento e acompanhar checklist.',
  },

  // 🗂 PLANNER DA RIRI
  {
    id: CHERRY_PLACE_CHANNEL_IDS.ASSUNTOS_PARA_FALAR_EM_CALLS,
    technicalName: 'assuntos-para-falar-em-calls',
    name: 'Assuntos para falar em calls',
    decoratedName: '📝╺╸assuntos・para・falar・em・calls',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.PLANNER_DA_RIRI,
    categoryName: 'Planner da Riri',
    categoryType: 'planning',
    order: 1,
    purpose: 'Anotar todos os assuntos pendentes de coisas que queremos conversar ao vivo, que normalmente eu mesmo fico adiantando de falar alguma coisa que exige mais tempo de assunto.',
    foxtyPolicy: 'Uso Limitado',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: true,
    toneGuidance: 'Pauta e tópicos de conversa. Participação muito discreta e concisa.',
    thematicContext: 'planejamento de calls',
    limitations: 'Intervenções extremamente breves e raras apenas quando chamado diretamente.',
    specialRules: 'Preservar a pauta de assuntos pendentes sem desviar o foco.',
  },
  {
    id: CHERRY_PLACE_CHANNEL_IDS.IDEIAS_PARA_FAZER_EM_CALL,
    technicalName: 'ideias-para-fazer-em-call',
    name: 'Ideias para fazer em call',
    decoratedName: '✨╺╸ideias・para・fazer・em・call',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.PLANNER_DA_RIRI,
    categoryName: 'Planner da Riri',
    categoryType: 'planning',
    order: 2,
    purpose: 'Canal para anotarmos todas as coisas legais para fazermos em call. Não só jogar e conversar. Já falamos sobre outras coisas como outros jogos, reagir coisas, visitar sites, criar tier lists... Enfim.',
    foxtyPolicy: 'Uso Limitado',
    isVoice: false,
    isProtected: false,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: true,
    toneGuidance: 'Lista de atividades para chamadas. Raras aparições para preservar a lista.',
    thematicContext: 'planejamento de calls',
    limitations: 'Muito discreto para manter a lista de ideias organizada.',
    specialRules: 'Sugerir atividades (jogos, reações, sites, tier lists) apenas se questionado.',
  },

  // 💌 CORRESPONDÊNCIAS (SakuraMail Boundary)
  {
    id: CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO,
    technicalName: 'caixa-de-correio',
    name: 'Caixa de Correio',
    decoratedName: '📬╺╸caixa・de・correio',
    type: 'text',
    categoryId: CHERRY_PLACE_CATEGORY_IDS.CORRESPONDENCIAS,
    categoryName: 'Correspondências',
    categoryType: 'correspondence',
    order: 1,
    purpose: 'Aqui é onde Eu ou a Riri podemos enviar comandos à bot. Ou para verificar se temos cartinhas um do outro, ou para enviarmos um para o outro.',
    foxtyPolicy: 'Uso Bloqueado',
    isVoice: false,
    isProtected: true,
    allowSpontaneousEvents: false,
    allowsMentionsResponse: false,
    toneGuidance: 'Canal exclusivo da SakuraMail!. Foxty nunca envia mensagens públicas. Eventos raríssimos são totalmente privados e efêmeros.',
    thematicContext: 'correspondência protegida',
    limitations: 'Totalmente proibido enviar mensagens públicas ou ler/revelar o conteúdo de cartas.',
    specialRules: 'Fronteira SakuraMail. Apenas observa envelopes fechados e status abstratos efêmeros.',
  },
] as const;

export const CHERRY_PLACE_CHANNELS: readonly CherryPlaceChannel[] = RAW_CHANNELS.map((ch) => ({
  ...ch,
  category: ch.categoryName,
}));

// ----------------------------------------------------------------------------
// INDEXED MAPS FOR FAST O(1) LOOKUP
// ----------------------------------------------------------------------------
const CHANNELS_BY_ID = new Map<string, CherryPlaceChannel>(
  CHERRY_PLACE_CHANNELS.map((ch) => [ch.id, ch])
);

const CATEGORIES_BY_ID = new Map<string, CherryPlaceCategory>(
  CHERRY_PLACE_CATEGORIES.map((cat) => [cat.id, cat])
);

// ----------------------------------------------------------------------------
// QUERY & SECURITY HELPER FUNCTIONS
// ----------------------------------------------------------------------------

export function getChannelById(channelId: string): CherryPlaceChannel | undefined {
  return CHANNELS_BY_ID.get(channelId);
}

export function getCategoryById(categoryId: string): CherryPlaceCategory | undefined {
  return CATEGORIES_BY_ID.get(categoryId);
}

export function getChannelsByCategoryId(categoryId: string): CherryPlaceChannel[] {
  return CHERRY_PLACE_CHANNELS.filter((ch) => ch.categoryId === categoryId);
}

export function isChannelBlocked(channelId: string): boolean {
  const channel = CHANNELS_BY_ID.get(channelId);
  return !channel || channel.foxtyPolicy === 'Uso Bloqueado';
}

export function isVoiceChannel(channelId: string): boolean {
  const channel = CHANNELS_BY_ID.get(channelId);
  return channel?.type === 'voice';
}

export function isSakuraMailChannel(channelId: string): boolean {
  return channelId === CHERRY_PLACE_CHANNEL_IDS.CAIXA_DE_CORREIO;
}

export function getChannelUsagePolicy(channelId: string): FoxtyChannelPolicy | undefined {
  return CHANNELS_BY_ID.get(channelId)?.foxtyPolicy;
}

/**
 * Evaluates whether Foxty is allowed to interact in a channel according to canonical rules:
 * - If channel policy is 'Uso Bloqueado': strictly forbidden (even if mentioned)
 * - If isDirectMention: allowed if not blocked
 * - If unmentioned: allowed according to policy
 */
export function canFoxtyInteractInChannel(channelId: string, isMention: boolean): boolean {
  const channel = CHANNELS_BY_ID.get(channelId);
  if (!channel) return false;

  // Blocked channels rule:
  // "Mencionar Foxty SEMPRE fará com que ele responda e apareça. MENOS PARA OS CANAIS DE 'Uso Bloqueado'."
  if (channel.foxtyPolicy === 'Uso Bloqueado') {
    return false;
  }

  // If mentioned directly and not blocked, Foxty will answer
  if (isMention) {
    return true;
  }

  // If not mentioned, Foxty interacts based on policy (non-blocked channels are allowed)
  return true;
}

export function getAllChannels(): readonly CherryPlaceChannel[] {
  return CHERRY_PLACE_CHANNELS;
}

export function getAllCategories(): readonly CherryPlaceCategory[] {
  return CHERRY_PLACE_CATEGORIES;
}

/**
 * Builds the semantic location description for the brain based on the canonical Cherry Place map.
 * Provides category, purpose, thematic context, Foxty presence level, limitations, protected status,
 * special rules, and channel type.
 */
export function getSemanticLocationContext(channelOrId: string | { id: string; name?: string; category?: string; type?: any; isProtected?: boolean; purpose?: string; foxtyPolicy?: FoxtyChannelPolicy; thematicContext?: ThematicContext; limitations?: string; specialRules?: string }): SemanticLocationContext {
  const channelId = typeof channelOrId === 'string' ? channelOrId : channelOrId.id;
  const canonical = getChannelById(channelId);

  if (canonical) {
    return {
      channelId: canonical.id,
      channelName: canonical.name,
      category: canonical.categoryName,
      purpose: canonical.purpose,
      thematicContext: canonical.thematicContext,
      foxtyPresenceLevel: canonical.foxtyPolicy,
      limitations: canonical.limitations,
      isProtected: canonical.isProtected,
      specialRules: canonical.specialRules,
      channelType: canonical.type,
    };
  }

  // Fallback for custom or transient channels
  const obj = typeof channelOrId === 'object' ? channelOrId : undefined;
  return {
    channelId,
    channelName: obj?.name || channelId,
    category: obj?.category || 'Geral',
    purpose: obj?.purpose || 'Canal do servidor',
    thematicContext: obj?.thematicContext || 'conversa casual',
    foxtyPresenceLevel: obj?.foxtyPolicy || 'Uso Ativo',
    limitations: obj?.limitations || 'Respeitar o fluxo de mensagens.',
    isProtected: obj?.isProtected ?? false,
    specialRules: obj?.specialRules || 'Interagir naturalmente respeitando a personalidade do Foxty.',
    channelType: (obj?.type === 'voice' ? 'voice' : 'text') as ChannelType,
  };
}
