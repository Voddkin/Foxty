import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } from 'discord.js';
import { FoxtyCore } from '../core/FoxtyCore.js';
import { DiscordActionHandler } from '../tools/ToolExecutor.js';
import { logger } from '../core/Logger.js';
import { DiscordServerSnapshot } from '../types.js';
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
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction],
      });

      this.client.once('ready', async () => {
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

      // Handle regular chat messages
      this.client.on('messageCreate', async (message) => {
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
      this.client.on('interactionCreate', async (interaction) => {
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
            const result = await this.core.handleSlashCommand({
              commandName: 'foxty',
              subcommand,
              prompt,
              author: interaction.user.displayName || interaction.user.username,
              channelId: interaction.channelId,
            });

            // If reply is long (e.g. detailed markdown report), Discord allows up to 2000 chars per message
            if (result.reply.length > 2000) {
              const truncated = result.reply.substring(0, 1990) + '...';
              await interaction.editReply(truncated);
            } else {
              await interaction.editReply(result.reply);
            }
          } catch (err: any) {
            await interaction.editReply(`🦊 *Foxty hesita...*: ${err.message}`);
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
        error: err.message,
      });
    }
  }

  public isDiscordConnected(): boolean {
    return this.isConnected;
  }

  public getBotUser(): { id: string; tag: string } | null {
    if (!this.client?.user) return null;
    return {
      id: this.client.user.id,
      tag: this.client.user.tag,
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
          error: err.message,
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
        error: err.message,
      });
    }
  }
}

