import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } from 'discord.js';
import { FoxtyCore } from '../core/FoxtyCore.js';
import { DiscordActionHandler } from '../tools/ToolExecutor.js';
import { logger } from '../core/Logger.js';

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
          const subcommand = interaction.options.getSubcommand(false) || undefined;
          const prompt = interaction.options.getString('pergunta') || interaction.options.getString('prompt') || undefined;

          await interaction.deferReply();

          try {
            const result = await this.core.handleSlashCommand({
              commandName: 'foxty',
              subcommand,
              prompt,
              author: interaction.user.displayName || interaction.user.username,
              channelId: interaction.channelId,
            });

            await interaction.editReply(result.reply);
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
        .setDescription('Interage diretamente com o Foxty')
        .addStringOption((option) =>
          option.setName('pergunta').setDescription('O que você quer dizer ou perguntar ao Foxty?').setRequired(false)
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
        event: 'Slash Command /foxty Registered',
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
