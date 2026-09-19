import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { loadConfig } from './src/config/index.js';
import { FoxtyCore } from './src/core/FoxtyCore.js';
import { DiscordAdapter } from './src/discord/DiscordAdapter.js';
import { logger } from './src/core/Logger.js';

// Setup ES module paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Initialize Foxty Core & Discord Adapter
  const config = loadConfig();
  const core = new FoxtyCore(config);
  const discordAdapter = new DiscordAdapter(core);

  // Initialize Discord client in background
  discordAdapter.initialize().catch((err) => {
    console.error('Failed to initialize Discord client:', err);
  });

  // ==========================================
  // API Routes (mounted BEFORE Vite middleware)
  // ==========================================

  // 1. System Status
  app.get('/api/status', async (req, res) => {
    try {
      const state = core.getStateManager().getState();
      const memoryCount = await core.getMemoryStore().count();
      const botUser = discordAdapter.getBotUser();
      const isConnected = discordAdapter.isDiscordConnected();

      res.json({
        status: 'online',
        version: '0.1.0',
        phase: 'Phase 01 — Foundation Technical Body',
        testMode: config.testMode,
        deepSeekConfigured: !!config.deepSeekApiKey,
        deepSeekModel: config.deepSeekModel,
        discord: {
          connected: isConnected,
          botUser: botUser ? botUser.tag : null,
          hasToken: !!config.discordToken,
        },
        state,
        memoryCount,
        channelsCount: config.channels.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Channels List
  app.get('/api/channels', (req, res) => {
    res.json(config.channels);
  });

  // 3. Simulate Chat Message
  app.post('/api/chat', async (req, res) => {
    try {
      const { channelId, author, content, isDirectMention } = req.body;
      if (!channelId || !author || !content) {
        return res.status(400).json({ error: 'channelId, author, and content are required.' });
      }

      const result = await core.handleMessage({
        channelId,
        author,
        content,
        isDirectMention: !!isDirectMention,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Slash Command /foxty
  app.post('/api/command', async (req, res) => {
    try {
      const { subcommand, prompt, author, channelId } = req.body;
      const targetChannel = channelId || config.channels[0].id;
      const targetAuthor = author || 'Kris';

      const result = await core.handleSlashCommand({
        commandName: 'foxty',
        subcommand,
        prompt,
        author: targetAuthor,
        channelId: targetChannel,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Events Endpoints
  app.get('/api/events', (req, res) => {
    res.json(core.getEventEngine().getRegisteredEvents());
  });

  app.post('/api/trigger-event', (req, res) => {
    try {
      const { eventId, channelId } = req.body;
      const channel = channelId ? core.getChannelById(channelId) : undefined;
      const result = core.getEventEngine().triggerTestEvent(eventId, channel);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. SakuraMail Integration & Privacy Barrier Endpoints
  app.post('/api/sakuramail/event', (req, res) => {
    try {
      const outcome = core.handleSakuraMailEvent(req.body);
      res.json(outcome);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sakuramail/events', (req, res) => {
    res.json(core.getSakuraMailBridge().getRecentAbstractEvents());
  });

  // 7. Server Map Diagnostics (Read-Only & Non-Destructive)
  app.get('/api/diagnostics/server-map', async (req, res) => {
    try {
      const report = await core.validateServerMap();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/diagnostics/server-map', async (req, res) => {
    try {
      const snapshot = req.body?.snapshot;
      const report = await core.validateServerMap(snapshot);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Memory Endpoints
  app.get('/api/memories', async (req, res) => {
    try {
      const query = req.query.q as string | undefined;
      const safeOnly = req.query.safeOnly === 'true';
      const items = await core.getMemoryStore().search(query, {
        safeForTeasingOnly: safeOnly,
      });
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/memories', async (req, res) => {
    try {
      const { content, type, importance, confidence, safeForTeasing, targetUser, tags } = req.body;
      if (!content) {
        return res.status(400).json({ error: 'content is required' });
      }

      const item = await core.getMemoryStore().save({
        content,
        type: type || 'episodic',
        importance: typeof importance === 'number' ? importance : 0.8,
        confidence: typeof confidence === 'number' ? confidence : 0.9,
        source: 'dashboard-operator',
        safeForTeasing: !!safeForTeasing,
        targetUser,
        retention: 'permanent',
        tags: Array.isArray(tags) ? tags : ['manual'],
      });

      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/memories/:id', async (req, res) => {
    try {
      const deleted = await core.getMemoryStore().delete(req.params.id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Audit Logs
  app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json(logger.getRecentLogs(limit));
  });

  // ==========================================
  // Vite Frontend Middleware / Static Serving
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🦊 Foxty Core dev server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting Foxty server:', err);
  process.exit(1);
});
