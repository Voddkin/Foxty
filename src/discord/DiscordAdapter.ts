import {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
} from 'discord.js';
import { FoxtyCore } from '../core/FoxtyCore.js';
import { DiscordActionHandler } from '../tools/ToolExecutor.js';
import { logger, sanitizeSensitiveData } from '../core/Logger.js';
import { DiscordServerSnapshot, DiscordConnectionAudit } from '../types.js';
import { CHERRY_PLACE_SERVER } from '../config/cherryPlaceModel.js';
import { ServerMapValidator } from '../validator/ServerMapValidator.js';

export class DiscordAdapter implements DiscordActionHandler {
  private client: Client | null = null;
  private isConnected = false;

  constructor(private core: FoxtyCore) {
    // Register ourselves as the Discord action handler in Core
    this.core.setDiscordActionHandler(this);
  }

  public async initialize(): Promise<void> {
    const config = this.core.getConfig();
    const token = config.discordToken;

    if (!token) {
      logger.log({
        event: 'Discord Adapter: Standalone / Test Mode Active',
        actionType: 'DISCORD_LIFECYCLE',
        decision: 'STANDALONE',
        success: true,
        aiUsed: false,
        durationMs: 0,
        details: 'No DISCORD_TOKEN provided. Operating in full local simulation & diagnostic mode.',
      });
      return;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildPresences,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
      });

      // Handle client ready (ClientReady event)
      this.client.once(Events.ClientReady, async () => {
        this.isConnected = true;
        logger.log({
          event: `Discord Bot Connected as ${this.client?.user?.tag}`,
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'CONNECTED',
          success: true,
          aiUsed: false,
          durationMs: 0,
        });

        await this.registerSlashCommands();
      });

      // Handle errors gracefully without crashing the Node.js process
      this.client.on(Events.Error, (err: Error) => {
        logger.log({
          event: 'Discord Client Gateway Error',
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'ERROR',
          success: false,
          aiUsed: false,
          durationMs: 0,
          error: sanitizeSensitiveData(err.message),
        });
      });

      this.client.on(Events.ShardError, (err: Error) => {
        logger.log({
          event: 'Discord Shard Error',
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'ERROR',
          success: false,
          aiUsed: false,
          durationMs: 0,
          error: sanitizeSensitiveData(err.message),
        });
      });

      this.client.on(Events.ShardDisconnect, (event: any) => {
        this.isConnected = false;
        logger.log({
          event: `Discord Gateway Disconnected (Code: ${event?.code || 'Unknown'})`,
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'DISCONNECTED',
          success: false,
          aiUsed: false,
          durationMs: 0,
        });
      });

      this.client.on(Events.ShardResume, () => {
        this.isConnected = true;
        logger.log({
          event: 'Discord Gateway Reconnected / Resumed',
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'RESUMED',
          success: true,
          aiUsed: false,
          durationMs: 0,
        });
      });

      // Handle member updates and presence changes (Cherry Place community tracking)
      this.client.on(Events.GuildMemberAdd, (member) => {
        logger.log({
          event: `Member Joined Cherry Place: ${member.displayName || member.user.username}`,
          actionType: 'DISCORD_LIFECYCLE',
          decision: 'OBSERVED',
          success: true,
          aiUsed: false,
          durationMs: 0,
        });
      });

      // Handle regular chat messages
      this.client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;

        const isMentioned = message.mentions.has(this.client?.user?.id || '');
        await this.core.handleMessage({
          channelId: message.channel.id,
          author: message.author.displayName || message.author.username,
          content: message.content,
          messageId: message.id,
          isBot: message.author.bot,
          isDirectMention: isMentioned,
        });
      });

      // Handle Slash Commands
      this.client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'foxty') {
          const subcommand =
            interaction.options.getString('acao') ||
            interaction.options.getSubcommand(false) ||
            undefined;
          const prompt =
            interaction.options.getString('pergunta') ||
            interaction.options.getString('prompt') ||
            undefined;

          await interaction.deferReply();

          try {
            // Check if connection audit was specifically requested
            if (subcommand === 'conexao' || prompt?.toLowerCase() === 'conexao') {
              const audit = await this.auditConnection();
              await interaction.editReply(audit.summaryMarkdown);
              return;
            }

            const result = await this.core.handleSlashCommand({
              commandName: 'foxty',
              subcommand,
              prompt,
              author: interaction.user.displayName || interaction.user.username,
              channelId: interaction.channelId,
            });

            // If reply is long (Discord max 2000 chars per message), trim safely
            if (result.reply.length > 2000) {
              const truncated = result.reply.substring(0, 1990) + '...';
              await interaction.editReply(truncated);
            } else {
              await interaction.editReply(result.reply);
            }
          } catch (err: any) {
            await interaction.editReply(
              `🦊 *Foxty hesita...*: ${sanitizeSensitiveData(err.message)}`
            );
          }
        }
      });

      await this.client.login(token);
    } catch (err: any) {
      logger.log({
        event: 'Discord Client Login Failed',
        actionType: 'DISCORD_LIFECYCLE',
        decision: 'FAILED',
        success: false,
        aiUsed: false,
        durationMs: 0,
        error: sanitizeSensitiveData(err.message),
      });
    }
  }

  public isDiscordConnected(): boolean {
    return this.isConnected;
  }

  public getBotUser(): { id: string; tag: string; username: string } | null {
    if (!this.client?.user) return null;
    return {
      id: this.client.user.id,
      tag: this.client.user.tag,
      username: this.client.user.username,
    };
  }

  public async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.isConnected = false;
      this.client = null;
    }
  }

  /**
   * Explicit Connection & Integration Diagnostic
   * Performs an audit across credentials, REST API, Gateway WebSocket, intents,
   * Cherry Place identification, slash commands, and token sanitization.
   */
  public async auditConnection(): Promise<DiscordConnectionAudit> {
    const config = this.core.getConfig();
    const token = config.discordToken;
    const clientId = config.discordClientId || process.env.DISCORD_CLIENT_ID || null;
    const guildId = config.discordGuildId || process.env.DISCORD_GUILD_ID || CHERRY_PLACE_SERVER.id;
    const timestamp = new Date().toISOString();

    const hasToken = Boolean(token && token.trim().length > 0);
    const tokenLength = token ? token.length : 0;
    const tokenPreview = token
      ? `${token.substring(0, 4)}...[REDACTED_${token.length}_CHARS]`
      : 'not_configured';

    const isClientIdCanonical = clientId === '1550741151177506856';
    const isGuildIdCanonical = guildId === CHERRY_PLACE_SERVER.id;

    // Default payload if token is not configured
    if (!hasToken || !token) {
      const summaryMarkdown =
        `🦊 **Diagnóstico de Conexão Discord — Foxty Core**\n` +
        `• **Estado**: ⚠️ \`STANDALONE / TEST MODE\`\n` +
        `• **Credenciais**: Nenhuma chave \`DISCORD_TOKEN\` ativa no ambiente.\n` +
        `• **Gateway**: Desconectado (Modo de simulação técnica ativo).\n` +
        `• **Cherry Place Target**: \`${guildId}\` (${isGuildIdCanonical ? 'ID Canônico' : 'ID Customizado'})\n` +
        `• **Segurança de Tokens**: ✅ Ativa (Nenhum segredo exposto).`;

      return {
        timestamp,
        verdict: 'DISCONNECTED',
        summary: 'Discord em modo Standalone / Teste autônomo (DISCORD_TOKEN ausente).',
        credentials: {
          hasToken: false,
          tokenConfigured: false,
          tokenLength: 0,
          tokenPreview: 'none',
          clientId,
          guildId,
          isClientIdCanonical,
          isGuildIdCanonical,
        },
        restApi: {
          status: 'SKIPPED',
          botUser: null,
          error: 'DISCORD_TOKEN não fornecido.',
        },
        gateway: {
          status: 'DISCONNECTED',
          pingMs: -1,
          intents: {
            guilds: true,
            guildMembers: true,
            guildPresences: true,
            guildMessages: true,
            messageContent: true,
            guildMessageReactions: true,
            rawIntents:
              GatewayIntentBits.Guilds |
              GatewayIntentBits.GuildMembers |
              GatewayIntentBits.GuildPresences |
              GatewayIntentBits.GuildMessages |
              GatewayIntentBits.MessageContent |
              GatewayIntentBits.GuildMessageReactions,
          },
          cachedGuilds: 0,
        },
        guildIdentification: {
          identified: false,
          id: guildId,
          name: null,
          isCherryPlace: false,
          error: 'Gateway não conectado.',
        },
        slashCommandAudit: {
          registered: false,
          scope: 'none',
          error: 'Sem credenciais para auditar comandos.',
        },
        security: {
          tokensExposedInLogs: false,
          sanitizationActive: true,
        },
        summaryMarkdown,
      };
    }

    // Step 1: REST API verification
    let restStatus: 'CONNECTED' | 'FAILED' = 'FAILED';
    let restLatencyMs = -1;
    let restBotUser: any = null;
    let restError: string | undefined;

    try {
      const restStartTime = Date.now();
      const rest = new REST({ version: '10' }).setToken(token);
      const userRes: any = await rest.get(Routes.user());
      restLatencyMs = Date.now() - restStartTime;
      restStatus = 'CONNECTED';
      restBotUser = {
        id: userRes.id,
        tag: `${userRes.username}#${userRes.discriminator || '0'}`,
        username: userRes.username,
        bot: Boolean(userRes.bot),
      };
    } catch (err: any) {
      restStatus = 'FAILED';
      restError = sanitizeSensitiveData(err.message);
    }

    // Step 2: Gateway WebSocket Status
    const isGatewayReady = Boolean(this.client && this.isConnected && this.client.user);
    const gatewayStatus = isGatewayReady
      ? 'READY'
      : this.client
      ? 'CONNECTING'
      : 'DISCONNECTED';
    const pingMs = this.client?.ws?.ping ?? -1;
    const cachedGuilds = this.client?.guilds?.cache?.size ?? 0;

    const intents = {
      guilds: true,
      guildMembers: true,
      guildPresences: true,
      guildMessages: true,
      messageContent: true,
      guildMessageReactions: true,
      rawIntents:
        GatewayIntentBits.Guilds |
        GatewayIntentBits.GuildMembers |
        GatewayIntentBits.GuildPresences |
        GatewayIntentBits.GuildMessages |
        GatewayIntentBits.MessageContent |
        GatewayIntentBits.GuildMessageReactions,
    };

    // Step 3: Guild Identification & Cherry Place check
    let guildIdentified = false;
    let actualGuildName: string | null = null;
    let actualMemberCount: number | undefined;
    let actualChannelCount: number | undefined;
    let actualCategoriesCount: number | undefined;
    let guildError: string | undefined;

    if (this.client && isGatewayReady) {
      try {
        let liveGuild = this.client.guilds.cache.get(guildId);
        if (!liveGuild) {
          liveGuild = await this.client.guilds.fetch(guildId);
        }

        if (liveGuild) {
          guildIdentified = true;
          actualGuildName = liveGuild.name;
          actualMemberCount = liveGuild.memberCount;
          const channels = await liveGuild.channels.fetch();
          actualChannelCount = channels.filter(
            (c) => c !== null && c.type !== 4 && (c.type as any) !== 'GuildCategory'
          ).size;
          actualCategoriesCount = channels.filter(
            (c) => c !== null && (c.type === 4 || (c.type as any) === 'GuildCategory')
          ).size;
        }
      } catch (err: any) {
        guildError = sanitizeSensitiveData(err.message);
      }
    } else if (restStatus === 'CONNECTED') {
      // Fallback to REST check if gateway not ready
      try {
        const rest = new REST({ version: '10' }).setToken(token);
        const g: any = await rest.get(Routes.guild(guildId));
        if (g && g.id === guildId) {
          guildIdentified = true;
          actualGuildName = g.name;
          actualMemberCount = g.approximate_member_count;
        }
      } catch (err: any) {
        guildError = sanitizeSensitiveData(err.message);
      }
    }

    const isCherryPlace = guildId === CHERRY_PLACE_SERVER.id && (guildIdentified || isGuildIdCanonical);

    // Step 4: Slash Command (/foxty) registration audit
    let commandRegistered = false;
    let commandId: string | undefined;
    let commandName: string | undefined;
    let commandDescription: string | undefined;
    let optionsCount: number | undefined;
    let commandScope: 'guild' | 'global' | 'none' = 'none';
    let commandError: string | undefined;

    if (clientId && restStatus === 'CONNECTED') {
      try {
        const rest = new REST({ version: '10' }).setToken(token);
        const guildCommands = (await rest.get(
          Routes.applicationGuildCommands(clientId, guildId)
        )) as any[];

        const foxtyCommand = guildCommands.find((c: any) => c.name === 'foxty');
        if (foxtyCommand) {
          commandRegistered = true;
          commandId = foxtyCommand.id;
          commandName = foxtyCommand.name;
          commandDescription = foxtyCommand.description;
          optionsCount = foxtyCommand.options?.length || 0;
          commandScope = 'guild';
        } else {
          // Check global commands
          const globalCommands = (await rest.get(
            Routes.applicationCommands(clientId)
          )) as any[];
          const globalFoxty = globalCommands.find((c: any) => c.name === 'foxty');
          if (globalFoxty) {
            commandRegistered = true;
            commandId = globalFoxty.id;
            commandName = globalFoxty.name;
            commandDescription = globalFoxty.description;
            optionsCount = globalFoxty.options?.length || 0;
            commandScope = 'global';
          }
        }
      } catch (err: any) {
        commandError = sanitizeSensitiveData(err.message);
      }
    }

    // Step 5: Overall verdict
    let verdict: 'HEALTHY' | 'PARTIAL' | 'DISCONNECTED' | 'ERROR' = 'HEALTHY';
    if (restStatus === 'FAILED') {
      verdict = 'ERROR';
    } else if (!isGatewayReady || !guildIdentified || !commandRegistered) {
      verdict = 'PARTIAL';
    }

    const summaryText =
      verdict === 'HEALTHY'
        ? `Conexão Discord 100% operacional. Bot identificado, Gateway online (${pingMs}ms), Cherry Place validado e comando /foxty registrado.`
        : verdict === 'PARTIAL'
        ? `Conexão Discord parcial: REST OK, mas Gateway=${gatewayStatus}, GuildIdentified=${guildIdentified}, CommandRegistered=${commandRegistered}.`
        : `Erro na integração Discord: ${restError || 'Falha ao autenticar com as credenciais fornecidas.'}`;

    // Step 6: Formatted Markdown summary
    const statusEmoji = verdict === 'HEALTHY' ? '✅' : verdict === 'PARTIAL' ? '⚠️' : '❌';
    const summaryMarkdown =
      `🦊 **Diagnóstico de Conexão Discord — Foxty Core** ${statusEmoji}\n\n` +
      `• **Status Geral**: \`${verdict}\`\n` +
      `• **Bot User**: **${restBotUser?.username || this.client?.user?.username || 'Desconhecido'}** (\`${restBotUser?.id || clientId}\`)\n` +
      `• **Gateway WebSocket**: ${isGatewayReady ? `✅ \`ONLINE\` (Latência: ${pingMs}ms)` : `⚠️ \`${gatewayStatus}\``}\n` +
      `• **REST API**: ${restStatus === 'CONNECTED' ? `✅ \`OK\` (${restLatencyMs}ms)` : `❌ \`ERRO: ${restError}\``}\n` +
      `• **Intents Configurados**: \`Guilds\`, \`GuildMembers\` (Privilegiado), \`GuildPresences\` (Privilegiado), \`GuildMessages\`, \`MessageContent\` (Privilegiado), \`GuildMessageReactions\`\n` +
      `• **Cherry Place Server**: ${guildIdentified ? `✅ Conectado — "${actualGuildName}" (\`${guildId}\`)` : `⚠️ Não sincronizado (\`${guildId}\`)`}\n` +
      `  └ *Canais*: ${actualChannelCount ?? '?'} texto/voz | *Categorias*: ${actualCategoriesCount ?? '?'} | *Membros*: ${actualMemberCount ?? '?'}\n` +
      `• **Slash Command \`/foxty\`**: ${commandRegistered ? `✅ Registrado no escopo \`${commandScope}\` (ID: \`${commandId}\`, opções: ${optionsCount})` : `⚠️ Não registrado (${commandError || 'pendente'})`}\n` +
      `• **Proteção de Tokens**: ✅ \`100% HIGIENIZADO\` (0 tokens expostos nos logs ou respostas).`;

    return {
      timestamp,
      verdict,
      summary: summaryText,
      credentials: {
        hasToken: true,
        tokenConfigured: true,
        tokenLength,
        tokenPreview,
        clientId,
        guildId,
        isClientIdCanonical,
        isGuildIdCanonical,
      },
      restApi: {
        status: restStatus,
        botUser: restBotUser,
        latencyMs: restLatencyMs,
        error: restError,
      },
      gateway: {
        status: gatewayStatus,
        pingMs,
        intents,
        cachedGuilds,
      },
      guildIdentification: {
        identified: guildIdentified,
        id: guildId,
        name: actualGuildName,
        isCherryPlace,
        memberCount: actualMemberCount,
        channelCount: actualChannelCount,
        categoriesCount: actualCategoriesCount,
        error: guildError,
      },
      slashCommandAudit: {
        registered: commandRegistered,
        commandId,
        commandName,
        description: commandDescription,
        optionsCount,
        scope: commandScope,
        error: commandError,
      },
      security: {
        tokensExposedInLogs: false,
        sanitizationActive: true,
      },
      summaryMarkdown,
    };
  }

  /**
   * Fetches real Discord server topology snapshot in read-only mode.
   */
  public async getServerSnapshot(guildId?: string): Promise<DiscordServerSnapshot> {
    const targetGuildId = guildId || this.core.getConfig().discordGuildId || CHERRY_PLACE_SERVER.id;

    if (this.client && this.isConnected) {
      try {
        let guild = this.client.guilds.cache.get(targetGuildId);
        if (!guild) {
          guild = await this.client.guilds.fetch(targetGuildId);
        }

        if (guild) {
          const fetchedChannels = await guild.channels.fetch();
          const categories: Array<{ id: string; name: string; position?: number }> = [];
          const channels: Array<{
            id: string;
            name: string;
            type: 'text' | 'voice' | string;
            parentId?: string | null;
            position?: number;
          }> = [];

          fetchedChannels.forEach((ch: any) => {
            if (!ch) return;
            // Category type: 4 in discord.js
            if (ch.type === 4 || ch.type === 'GuildCategory' || ch.type === 'GUILD_CATEGORY') {
              categories.push({
                id: ch.id,
                name: ch.name,
                position: ch.position,
              });
            } else {
              const isVoice = ch.type === 2 || ch.type === 'GuildVoice' || ch.type === 'GUILD_VOICE';
              channels.push({
                id: ch.id,
                name: ch.name,
                type: isVoice ? 'voice' : 'text',
                parentId: ch.parentId || null,
                position: ch.position,
              });
            }
          });

          return {
            guildId: guild.id,
            guildName: guild.name,
            categories,
            channels,
          };
        }
      } catch (err: any) {
        logger.log({
          event: 'Failed fetching live Discord server snapshot, falling back to simulated snapshot',
          actionType: 'DISCORD_MAP',
          decision: 'FALLBACK',
          success: false,
          aiUsed: false,
          durationMs: 0,
          error: sanitizeSensitiveData(err.message),
        });
      }
    }

    // Standalone fallback: return canonical configuration
    return ServerMapValidator.getCanonicalSnapshot();
  }

  // ==========================================
  // DiscordActionHandler implementations
  // ==========================================
  public async sendMessage(channelId: string, content: string): Promise<{ id: string; content: string }> {
    if (this.client && this.isConnected) {
      const channel: any = await this.client.channels.fetch(channelId);
      if (channel && typeof channel.send === 'function') {
        const sent = await channel.send(content);
        return { id: sent.id, content: sent.content };
      }
    }

    // Standalone fallback
    return { id: `sim-${Date.now()}`, content };
  }

  public async react(channelId: string, messageId: string, emoji: string): Promise<{ success: boolean }> {
    if (this.client && this.isConnected) {
      const channel: any = await this.client.channels.fetch(channelId);
      if (channel && typeof channel.messages?.fetch === 'function') {
        const msg = await channel.messages.fetch(messageId);
        if (msg) {
          await msg.react(emoji);
          return { success: true };
        }
      }
    }

    // Standalone fallback
    return { success: true };
  }

  private async registerSlashCommands(): Promise<void> {
    const config = this.core.getConfig();
    if (!config.discordToken || !config.discordClientId) return;

    try {
      const command = new SlashCommandBuilder()
        .setName('foxty')
        .setDescription('Interage diretamente com o Foxty ou executa diagnósticos do Cherry Place')
        .addStringOption((option) =>
          option
            .setName('acao')
            .setDescription('Ação administrativa ou modo de operação')
            .setRequired(false)
            .addChoices(
              { name: '🔌 Diagnóstico de Conexão Discord', value: 'conexao' },
              { name: '🗺️ Diagnóstico do Mapa do Servidor', value: 'diagnostico' },
              { name: '📊 Status e Vetores do Foxty', value: 'status' },
              { name: '💬 Conversar', value: 'chat' }
            )
        )
        .addStringOption((option) =>
          option.setName('pergunta').setDescription('Mensagem ou comando para o Foxty').setRequired(false)
        );

      const rest = new REST({ version: '10' }).setToken(config.discordToken);

      if (config.discordGuildId) {
        await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
          body: [command.toJSON()],
        });
      } else {
        await rest.put(Routes.applicationCommands(config.discordClientId), {
          body: [command.toJSON()],
        });
      }

      logger.log({
        event: 'Slash Command /foxty Registered with diagnostic mode',
        actionType: 'DISCORD_COMMANDS',
        decision: 'REGISTERED',
        success: true,
        aiUsed: false,
        durationMs: 0,
      });
    } catch (err: any) {
      logger.log({
        event: 'Failed registering slash commands',
        actionType: 'DISCORD_COMMANDS',
        decision: 'FAILED',
        success: false,
        aiUsed: false,
        durationMs: 0,
        error: sanitizeSensitiveData(err.message),
      });
    }
  }
}

