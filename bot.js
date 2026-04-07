// ============================================
// BURGER SHOT — Bot Discord
// ============================================
// npm install discord.js @supabase/supabase-js node-fetch express bcryptjs cors
// Node.js 18+
// ============================================

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors'); // ← AJOUT CORS

// ── EXPRESS SERVER (Keep-Alive Render) ──────
const app = express();
app.use(express.json());

// ── CORS ─────────────────────────────────────
app.use(cors({
  origin: [
    'https://stiorxtwitch.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'https://burgershot-liegecity.vercel.app', 
    'https://burgershot-liegecity.vercel.app/',
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.user?.tag || 'connecting...',
    uptime: Math.floor(process.uptime()) + 's',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ping', (req, res) => {
  res.json({ pong: true, timestamp: new Date().toISOString() });
});

// ── API : Vérification username Discord ─────
// Appelée par la page d'inscription pour valider l'username Discord
app.post('/api/verify-discord', async (req, res) => {
  const { discord_username } = req.body;
  if (!discord_username) return res.json({ found: false, error: 'Manquant' });

  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ found: false, error: 'Guild introuvable' });

    // Cherche dans les membres du serveur
    await guild.members.fetch(); // rafraîchit le cache
    const member = guild.members.cache.find(
      m => m.user.username.toLowerCase() === discord_username.toLowerCase()
        || (m.user.globalName && m.user.globalName.toLowerCase() === discord_username.toLowerCase())
    );

    if (member) {
      return res.json({ found: true, user_id: member.user.id, tag: member.user.tag || member.user.username });
    } else {
      return res.json({ found: false });
    }
  } catch (err) {
    console.error('Erreur verify-discord:', err);
    return res.json({ found: false, error: err.message });
  }
});

// ── API : Inscription ────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, discord_username, discord_user_id, password } = req.body;
  if (!username || !discord_username || !password || !discord_user_id)
    return res.json({ success: false, error: 'Champs manquants' });

  try {
    // Vérifie si le username existe déjà
    const { data: existingUser } = await supabase
      .from('users_burgershot')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();

    if (existingUser) return res.json({ success: false, error: 'username_taken' });

    // Vérifie si le discord_username existe déjà
    const { data: existingDiscord } = await supabase
      .from('users_burgershot')
      .select('id')
      .eq('discord_username', discord_username.toLowerCase())
      .single();

    if (existingDiscord) return res.json({ success: false, error: 'discord_taken' });

    const password_hash = await bcrypt.hash(password, 12);

    const { data: newUser, error } = await supabase
      .from('users_burgershot')
      .insert({
        username: username.toLowerCase(),
        discord_username: discord_username.toLowerCase(),
        discord_user_id,
        password_hash,
      })
      .select()
      .single();

    if (error) return res.json({ success: false, error: error.message });

    // Envoie un DM Discord à l'utilisateur
    try {
      const discordUser = await client.users.fetch(discord_user_id);
      const embed = new EmbedBuilder()
        .setColor(0xCC1A1A)
        .setTitle('🍔 Bienvenue chez Burger Shot !')
        .setDescription('Ton compte a bien été créé sur notre plateforme de commande.')
        .addFields(
          { name: '👤 Username', value: `\`${username.toLowerCase()}\``, inline: true },
          { name: '🎮 Discord', value: `\`${discord_username}\``, inline: true },
          { name: '🌐 Commander', value: 'Connecte-toi sur notre site pour passer ta commande !', inline: false },
        )
        .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
        .setTimestamp();

      await discordUser.send({ embeds: [embed] });
    } catch (dmErr) {
      console.warn('DM impossible:', dmErr.message);
    }

    return res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Erreur register:', err);
    return res.json({ success: false, error: err.message });
  }
});

// ── API : Connexion ──────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Champs manquants' });

  try {
    const { data: user } = await supabase
      .from('users_burgershot')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();

    if (!user) return res.json({ success: false, error: 'Compte introuvable' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.json({ success: false, error: 'Mot de passe incorrect' });

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        discord_username: user.discord_username,
        discord_user_id: user.discord_user_id,
      },
    });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── API : Récupération par Discord username ──
app.post('/api/forgot', async (req, res) => {
  const { discord_username } = req.body;
  if (!discord_username) return res.json({ success: false, error: 'Manquant' });

  try {
    const { data: user } = await supabase
      .from('users_burgershot')
      .select('*')
      .eq('discord_username', discord_username.toLowerCase())
      .single();

    if (!user) return res.json({ success: false, error: 'Aucun compte associé à ce Discord' });

    // Envoie les infos via Discord DM
    try {
      const discordUser = await client.users.fetch(user.discord_user_id);
      const embed = new EmbedBuilder()
        .setColor(0xF5A623)
        .setTitle('🔑 Récupération de compte — Burger Shot')
        .setDescription('Tu as demandé à retrouver tes identifiants.')
        .addFields(
          { name: '👤 Ton username', value: `\`${user.username}\``, inline: true },
          { name: '🎮 Discord lié', value: `\`${user.discord_username}\``, inline: true },
          { name: '⚠️ Mot de passe', value: 'Pour des raisons de sécurité, le mot de passe ne peut pas être récupéré. Crée un nouveau compte ou contacte-nous.', inline: false },
        )
        .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
        .setTimestamp();

      await discordUser.send({ embeds: [embed] });
    } catch (e) {
      console.warn('DM forgot impossible:', e.message);
    }

    return res.json({ success: true, username: user.username });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── API : Passer une commande ────────────────
app.post('/api/order', async (req, res) => {
  const { user_id, discord_username, discord_user_id, first_name, last_name, phone, delivery_type, address, zip_code, items, total } = req.body;

  if (!user_id || !items || !total)
    return res.json({ success: false, error: 'Données manquantes' });

  try {
    const { data: order, error } = await supabase
      .from('orders_burgershot')
      .insert({
        user_id,
        discord_username,
        discord_user_id,
        first_name,
        last_name,
        phone,
        delivery_type,
        address: address || null,
        zip_code: zip_code || null,
        items,
        total,
        status: 'en_attente',
      })
      .select()
      .single();

    if (error) return res.json({ success: false, error: error.message });

    // Notif pour le bot
    await supabase.from('discord_notifications_burgershot').insert({
      type: 'order',
      order_id: order.id,
      processed: false,
    });

    return res.json({ success: true, order_id: order.id });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── API : Liste commandes d'un utilisateur ───
app.get('/api/orders', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.json({ success: false, error: 'user_id manquant' });

  try {
    const { data: orders, error } = await supabase
      .from('orders_burgershot')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) return res.json({ success: false, error: error.message });
    return res.json({ success: true, orders: orders || [] });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── API : Statut commande (page de suivi) ────
app.get('/api/order/:id', async (req, res) => {
  const { data: order } = await supabase
    .from('orders_burgershot')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!order) return res.json({ success: false, error: 'Commande introuvable' });

  const { data: messages } = await supabase
    .from('discord_messages_burgershot')
    .select('*')
    .eq('order_id', order.id)
    .eq('direction', 'out')
    .order('created_at', { ascending: false });

  return res.json({ success: true, order, messages: messages || [] });
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Express actif sur le port ${PORT}`);
});

// ── AUTO PING Keep-Alive ─────────────────────
const RENDER_URL = process.env.RENDER_URL;

function startKeepAlive() {
  if (!RENDER_URL) {
    console.warn('⚠️  RENDER_URL non défini — keep-alive désactivé');
    return;
  }
  setInterval(async () => {
    try {
      const res = await fetch(`${RENDER_URL}/ping`);
      const data = await res.json();
      console.log(`🏓 Keep-alive ping OK — ${data.timestamp}`);
    } catch (err) {
      console.error('❌ Keep-alive ping échoué:', err.message);
    }
  }, 5 * 60 * 1000);
  console.log(`🔁 Keep-alive démarré → ${RENDER_URL}/ping`);
}

// ── CONFIG ───────────────────────────────────
const DISCORD_TOKEN        = process.env.DISCORD_TOKEN;
const GUILD_ID             = process.env.GUILD_ID;
const ORDERS_CATEGORY_ID   = process.env.ORDERS_CATEGORY_ID;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_KEY         = process.env.SUPABASE_KEY;

const REQUIRED_ENV = ['DISCORD_TOKEN','GUILD_ID','ORDERS_CATEGORY_ID','SUPABASE_URL','SUPABASE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

const STATUS_LABELS = {
  en_attente:  '⏳ En attente',
  acceptee:    '✅ Acceptée',
  refusee:     '❌ Refusée',
  recue:       '📥 Reçue',
  preparation: '🍳 En préparation',
  finalisation:'🔍 Finalisation',
  termine:     '✅ Terminée',
  livraison:   '🚴 En livraison',
  reglee:      '💰 Réglée',
};

// ── BOT READY ────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  setInterval(checkNotifications, 8000);
  startKeepAlive();
});

// ── POLL NOTIFICATIONS ────────────────────────
async function checkNotifications() {
  try {
    const { data: notifs, error } = await supabase
      .from('discord_notifications_burgershot')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (error || !notifs?.length) return;

    for (const notif of notifs) {
      if (notif.type === 'order' && notif.order_id) {
        await handleNewOrder(notif.order_id);
      }
      await supabase
        .from('discord_notifications_burgershot')
        .update({ processed: true })
        .eq('id', notif.id);
    }
  } catch (err) {
    console.error('Erreur polling:', err);
  }
}

// ── NOUVELLE COMMANDE ─────────────────────────
async function handleNewOrder(orderId) {
  const { data: order } = await supabase
    .from('orders_burgershot')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) return;

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.error('Guild introuvable');

  // Numéro du salon
  const { count } = await supabase
    .from('orders_burgershot')
    .select('*', { count: 'exact', head: true })
    .not('discord_channel_id', 'is', null);

  const channelNum = String((count || 0) + 1).padStart(3, '0');
  const channelName = `commande-${channelNum}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: 0,
    parent: ORDERS_CATEGORY_ID,
    topic: `Commande #${order.id} — ${order.first_name} ${order.last_name} — ${order.discord_username}`,
  });

  await supabase
    .from('orders_burgershot')
    .update({ discord_channel_id: channel.id })
    .eq('id', order.id);

  // Formatage articles
  const itemsList = Array.isArray(order.items)
    ? order.items.map(i => `• ${i.name} ×${i.qty} — ${(i.price * i.qty).toLocaleString('fr-FR')} DA`).join('\n')
    : JSON.stringify(order.items);

  const deliveryInfo = order.delivery_type === 'livraison'
    ? `🚴 Livraison — ${order.address}, ZIP: ${order.zip_code}`
    : '🏪 Sur place';

  const embed = new EmbedBuilder()
    .setColor(0xCC1A1A)
    .setTitle(`🍔 Nouvelle commande #${order.id}`)
    .addFields(
      { name: '👤 Client', value: `${order.first_name} ${order.last_name}`, inline: true },
      { name: '📞 Téléphone', value: order.phone || 'N/A', inline: true },
      { name: '🎮 Discord', value: order.discord_username || 'N/A', inline: true },
      { name: '📦 Mode', value: deliveryInfo, inline: false },
      { name: '🛒 Articles', value: itemsList || 'Aucun', inline: false },
      { name: '💰 Total', value: `**${Number(order.total).toLocaleString('fr-FR')} DA**`, inline: true },
      { name: '📌 Statut', value: STATUS_LABELS[order.status], inline: true },
      { name: '🕐 Date', value: new Date(order.created_at).toLocaleString('fr-FR'), inline: true },
    )
    .setFooter({ text: 'Burger Shot — Panel de gestion' })
    .setTimestamp();

  const commandsHelp = [
    '**━━━ COMMANDES DISPONIBLES ━━━**',
    '`^^accepter` — Accepter la commande',
    '`^^refuser <raison>` — Refuser la commande',
    '`^^recue` — Marquer comme reçue / en cours',
    '`^^preparation` — Marquer en préparation',
    '`^^finalisation` — Marquer en finalisation',
    order.delivery_type === 'livraison' ? '`^^livraison` — Marquer en cours de livraison' : '',
    '`^^terminer` — Marquer comme terminée',
    '`^^regler` — Marquer comme réglée',
    '`^^contact <message>` — Envoyer un message au client (DM Discord)',
    '',
    '> Chaque action notifie automatiquement le client via Discord DM.',
  ].filter(Boolean).join('\n');

  await channel.send({ embeds: [embed] });
  await channel.send(commandsHelp);

  // Notif DM au client
  if (order.discord_user_id) {
    try {
      const user = await client.users.fetch(order.discord_user_id);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xF5A623)
        .setTitle('🍔 Commande reçue — Burger Shot')
        .setDescription(`Ta commande **#${order.id}** a bien été reçue ! Nous allons l'examiner rapidement.`)
        .addFields(
          { name: '💰 Total', value: `${Number(order.total).toLocaleString('fr-FR')} DA`, inline: true },
          { name: '📦 Mode', value: order.delivery_type === 'livraison' ? '🚴 Livraison' : '🏪 Sur place', inline: true },
          { name: '📌 Statut', value: STATUS_LABELS['en_attente'], inline: true },
        )
        .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
        .setTimestamp();
      await user.send({ embeds: [dmEmbed] });
    } catch (e) {
      console.warn('DM new order impossible:', e.message);
    }
  }

  console.log(`✅ Canal créé : #${channelName} pour commande #${order.id}`);
}

// ── Envoyer DM statut au client ───────────────
async function notifyClient(order, statusLabel, extraMessage = null) {
  if (!order.discord_user_id) return;
  try {
    const user = await client.users.fetch(order.discord_user_id);
    const embed = new EmbedBuilder()
      .setColor(0xCC1A1A)
      .setTitle(`🍔 Mise à jour commande #${order.id} — Burger Shot`)
      .addFields(
        { name: '📌 Nouveau statut', value: statusLabel, inline: false },
      );

    if (extraMessage) {
      embed.addFields({ name: '💬 Message de l\'équipe', value: extraMessage, inline: false });
    }

    embed
      .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch (e) {
    console.warn('DM notify impossible:', e.message);
  }
}

// ── COMMANDES DISCORD ─────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const channelId = message.channel.id;
  const channelName = message.channel.name || '';

  if (!channelName.startsWith('commande-')) return;

  // Récupère la commande liée à ce salon
  const { data: order } = await supabase
    .from('orders_burgershot')
    .select('*')
    .eq('discord_channel_id', channelId)
    .single();

  if (!order) return;

  // ── ACCEPTER ──
  if (content === '^^accepter') {
    await supabase.from('orders_burgershot').update({ status: 'acceptee' }).eq('id', order.id);
    await notifyClient({ ...order, status: 'acceptee' }, STATUS_LABELS['acceptee']);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('✅ Commande acceptée')
      .setDescription(`Commande #${order.id} → **${STATUS_LABELS['acceptee']}**`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    await message.react('✅');
    return;
  }

  // ── REFUSER ──
  if (content.startsWith('^^refuser')) {
    const reason = content.slice('^^refuser'.length).trim() || 'Aucune raison précisée';
    await supabase.from('orders_burgershot').update({ status: 'refusee', refusal_reason: reason }).eq('id', order.id);

    // Notif client
    if (order.discord_user_id) {
      try {
        const user = await client.users.fetch(order.discord_user_id);
        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle(`❌ Commande #${order.id} refusée — Burger Shot`)
          .addFields(
            { name: '📌 Statut', value: STATUS_LABELS['refusee'], inline: true },
            { name: '💬 Raison', value: reason, inline: false },
          )
          .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
          .setTimestamp();
        await user.send({ embeds: [embed] });
      } catch (e) { console.warn('DM refus impossible:', e.message); }
    }

    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('❌ Commande refusée')
      .setDescription(`Commande #${order.id} refusée\n**Raison :** ${reason}`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    await message.react('❌');
    return;
  }

  // ── STATUTS SIMPLES ──
  const statusMap = {
    '^^recue':        'recue',
    '^^preparation':  'preparation',
    '^^finalisation': 'finalisation',
    '^^terminer':     'termine',
    '^^livraison':    'livraison',
    '^^regler':       'reglee',
  };

  if (statusMap[content]) {
    // Vérif livraison
    if (content === '^^livraison' && order.delivery_type !== 'livraison') {
      await message.reply('❌ Cette commande n\'est pas en livraison.');
      return;
    }

    const newStatus = statusMap[content];
    await supabase.from('orders_burgershot').update({ status: newStatus }).eq('id', order.id);
    await notifyClient({ ...order }, STATUS_LABELS[newStatus]);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('📌 Statut mis à jour')
      .setDescription(`Commande #${order.id} → **${STATUS_LABELS[newStatus]}**`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    await message.react('✅');
    return;
  }

  // ── CONTACT ──
  if (content.startsWith('^^contact ')) {
    const msg = content.slice('^^contact '.length).trim();
    if (!msg) return message.reply('❌ Syntaxe : `^^contact <votre message>`');

    await supabase.from('orders_burgershot').update({ ml_message: msg }).eq('id', order.id);
    await supabase.from('discord_messages_burgershot').insert({
      order_id: order.id,
      direction: 'out',
      content: msg,
    });

    // DM Discord au client
    if (order.discord_user_id) {
      try {
        const user = await client.users.fetch(order.discord_user_id);
        const dmEmbed = new EmbedBuilder()
          .setColor(0x4f7af8)
          .setTitle(`💬 Message de l'équipe Burger Shot — Commande #${order.id}`)
          .setDescription(msg)
          .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
      } catch (e) { console.warn('DM contact impossible:', e.message); }
    }

    const embed = new EmbedBuilder()
      .setColor(0x4f7af8)
      .setTitle('💬 Message envoyé au client')
      .setDescription(msg)
      .setFooter({ text: 'Message envoyé via Discord DM' })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    await message.react('📨');
    return;
  }
});

// ── DÉMARRAGE ─────────────────────────────────
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Erreur connexion Discord:', err);
  process.exit(1);
});
