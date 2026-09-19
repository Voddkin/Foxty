import { ChannelInfo, FoxtyEvent } from '../types.js';
import { logger } from '../core/Logger.js';
import { CHERRY_PLACE_CHANNEL_IDS, CHERRY_PLACE_CHANNELS } from '../config/index.js';

export class EventEngine {
  private events: Map<string, FoxtyEvent> = new Map();
  private lastGlobalEventTime = 0;
  private channelCooldowns: Map<string, number> = new Map();
  private dailyTokensSpent = 0;
  private dailyTokenLimit = 25000;

  constructor(private globalCooldownMinutes = 30) {
    this.registerInitialEvents();
  }

  public registerInitialEvents(): void {
    const defaultEvents: FoxtyEvent[] = [
      // 1. COMMON (Pequenas reações ou comentários do dia a dia)
      {
        id: 'evt-minecraft-base-audit',
        name: 'Inspeção Noturna da Base',
        description: 'Foxty nota alterações nas construções ou caminhos de flores de Cherry Place.',
        rarity: 'common',
        costClass: 'no_ai',
        priority: 5,
        chance: 0.25,
        cooldownMinutes: 45,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_CUBICAS,
          CHERRY_PLACE_CHANNEL_IDS.IDEIAS_DE_CONSTRUCAO,
          CHERRY_PLACE_CHANNEL_IDS.MAPAS_E_EXPLORACOES,
        ],
        payload: {
          quips: [
            'alguém andou replantando cerejeiras fora do alinhamento da escada.',
            'os Allays parecem satisfeitos hoje. Já as galinhas...',
            'estou de olho no baú de minérios.',
          ],
        },
      },
      // 2. UNCOMMON (Comentário inesperado / observação enigmática)
      {
        id: 'evt-cryptic-fox-observation',
        name: 'Sussurro Enigmático de Raposa',
        description: 'Foxty solta uma frase curta, ambígua e observadora no chat diário.',
        rarity: 'uncommon',
        costClass: 'no_ai',
        priority: 6,
        chance: 0.15,
        cooldownMinutes: 60,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
          CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY,
        ],
        payload: {
          quips: [
            'hm.',
            'eu vi o que vocês fizeram mais cedo.',
            'anotado nos registros da raposa.',
            'vocês têm certeza sobre essa decisão?',
          ],
        },
      },
      // 3. RARE (Multi-message burst ou surto criativo)
      {
        id: 'evt-burst-epiphany',
        name: 'Surto de Criatividade Rápida',
        description: 'Evento raro de multi-message burst expressando uma ideia súbita para Cherry Place.',
        rarity: 'rare',
        costClass: 'low',
        priority: 10,
        chance: 0.05,
        cooldownMinutes: 120,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_CUBICAS,
          CHERRY_PLACE_CHANNEL_IDS.IDEIAS_DE_CONSTRUCAO,
        ],
        payload: {
          burst: ['pera', 'pera.', 'EU TIVE UMA IDEIA PARA A BASE.'],
        },
      },
      // 4. VERY_RARE (Intervenção cross-channel exploratória)
      {
        id: 'evt-cross-channel-cartography',
        name: 'Eco nas Explorações',
        description: 'Foxty nota conversas na vila e surge no canal de explorações com uma coordenada ou reflexão.',
        rarity: 'very_rare',
        costClass: 'medium',
        priority: 25,
        chance: 0.02,
        cooldownMinutes: 240,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.MAPAS_E_EXPLORACOES,
          CHERRY_PLACE_CHANNEL_IDS.COORDENADAS_IMPORTANTES,
        ],
        payload: {
          targetChannelRedirect: CHERRY_PLACE_CHANNEL_IDS.MAPAS_E_EXPLORACOES,
          quips: [
            'acho que encontrei uma aplicação muito específica para aquela ideia daqui.',
            'se vocês forem explorar aquele bioma hoje, não esqueçam de marcar o ponto.',
          ],
        },
      },
      // 5. LEGENDARY (Acontecimento épico marcante de Cherry Place)
      {
        id: 'evt-legendary-fox-visitation',
        name: 'A Aparição da Raposa Púrpura no Pico de Cerejeira',
        description: 'Evento memorável raríssimo, que pode se tornar história permanente do servidor.',
        rarity: 'legendary',
        costClass: 'rare',
        priority: 50,
        chance: 0.005,
        cooldownMinutes: 720,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
          CHERRY_PLACE_CHANNEL_IDS.JARDIM_MAGICO_DO_FOXTY,
        ],
        payload: {
          burst: [
            '🦊 *O vento balança as pétalas de cerejeira.*',
            'Vocês sabem que Cherry Place não é um lugar comum, né?',
            'Continuem construindo.',
          ],
        },
      },
      // 6. ANOMALOUS (Deliberadamente estranho e anômalo - doc 08)
      {
        id: 'evt-anomalous-glitch',
        name: 'Eco Anômalo do Vazio',
        description: 'Intervenção anômala propositalmente enigmática e fora dos padrões.',
        rarity: 'anomalous',
        costClass: 'no_ai',
        priority: 80,
        chance: 0.001,
        cooldownMinutes: 1440,
        requiresAi: false,
        allowedChannels: [
          CHERRY_PLACE_CHANNEL_IDS.CONVERSAS_DIARIAS,
          CHERRY_PLACE_CHANNEL_IDS.MINIGAMES_DO_FOXTY,
        ],
        payload: {
          burst: ['...', '👁️', '...vocês também ouviram isso?'],
        },
      },
    ];

    defaultEvents.forEach((e) => this.events.set(e.id, e));
  }

  public getRegisteredEvents(): FoxtyEvent[] {
    return Array.from(this.events.values());
  }

  public getEventById(id: string): FoxtyEvent | undefined {
    return this.events.get(id);
  }

  public recordTokenSpend(tokens: number): void {
    this.dailyTokensSpent += tokens;
  }

  public isWithinBudget(costClass: string = 'low'): boolean {
    if (this.dailyTokensSpent >= this.dailyTokenLimit) {
      return false;
    }
    if (costClass === 'rare' && this.dailyTokensSpent > this.dailyTokenLimit * 0.8) {
      return false;
    }
    return true;
  }

  public triggerTestEvent(eventId?: string, targetChannel?: ChannelInfo): {
    triggered: boolean;
    event?: FoxtyEvent;
    messages?: string[];
    targetChannelId?: string;
    reason?: string;
  } {
    const event = eventId ? this.events.get(eventId) : Array.from(this.events.values())[0];
    if (!event) {
      return { triggered: false, reason: 'Event not found' };
    }

    const channel =
      targetChannel ||
      CHERRY_PLACE_CHANNELS.find((c) => !c.isProtected && c.allowSpontaneousEvents) ||
      CHERRY_PLACE_CHANNELS[0];

    if (channel.isProtected) {
      return { triggered: false, reason: `Channel ${channel.name} is protected from spontaneous events.` };
    }

    // Budget validation check (Doc 08 Sec 18)
    if (event.requiresAi && !this.isWithinBudget(event.costClass)) {
      return { triggered: false, reason: 'Daily AI budget limit exceeded. Event cancelled.' };
    }

    // Determine output messages
    let messages: string[] = [];
    if (event.payload?.burst) {
      messages = [...event.payload.burst];
    } else if (event.payload?.quips) {
      const quips = event.payload.quips;
      messages = [quips[Math.floor(Math.random() * quips.length)]];
    } else {
      messages = ['🦊 *Foxty observa silenciosamente do topo das cerejeiras.*'];
    }

    const targetChannelId = event.payload?.targetChannelRedirect || channel.id;

    event.lastTriggered = new Date().toISOString();
    this.lastGlobalEventTime = Date.now();
    this.channelCooldowns.set(channel.id, Date.now());

    logger.log({
      event: `Spontaneous Event Triggered: ${event.name}`,
      channelId: targetChannelId,
      actionType: 'EVENT_ENGINE',
      decision: 'TRIGGERED',
      success: true,
      aiUsed: event.requiresAi,
      durationMs: 1,
      details: `Rarity: ${event.rarity}, Priority: ${event.priority ?? 5}, Messages: ${messages.join(' | ')}`,
    });

    return { triggered: true, event, messages, targetChannelId };
  }

  public checkSpontaneousEvent(channel: ChannelInfo): {
    canTrigger: boolean;
    event?: FoxtyEvent;
    reason?: string;
  } {
    if (channel.isProtected || !channel.allowSpontaneousEvents) {
      return { canTrigger: false, reason: 'Channel does not allow spontaneous events.' };
    }

    const now = Date.now();
    const globalCooldownMs = this.globalCooldownMinutes * 60 * 1000;
    if (now - this.lastGlobalEventTime < globalCooldownMs) {
      return { canTrigger: false, reason: 'Global event cooldown active.' };
    }

    const channelCooldown = this.channelCooldowns.get(channel.id) || 0;
    if (now - channelCooldown < globalCooldownMs) {
      return { canTrigger: false, reason: 'Channel event cooldown active.' };
    }

    // Filter candidate events for channel, sorted by priority (highest first)
    const candidates = Array.from(this.events.values())
      .filter((e) => e.allowedChannels.includes(channel.id))
      .sort((a, b) => (b.priority || 5) - (a.priority || 5));

    if (candidates.length === 0) {
      return { canTrigger: false, reason: 'No eligible events for channel.' };
    }

    // Roll chance
    for (const candidate of candidates) {
      if (Math.random() < candidate.chance) {
        if (candidate.requiresAi && !this.isWithinBudget(candidate.costClass)) {
          continue; // Skip if budget exhausted
        }
        return { canTrigger: true, event: candidate };
      }
    }

    return { canTrigger: false, reason: 'Probability roll did not meet threshold.' };
  }
}

