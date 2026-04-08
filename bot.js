// ============================================
// BURGER SHOT — Bot Discord + Admin Panel
// ============================================
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());

// ── CORS ─────────────────────────────────────
app.use(cors({
  origin: [
    'https://stiorxtwitch.github.io',
    'https://burgershot-liegecity.vercel.app',
    'https://burgershot-liegecity-mw0c4qo8e-stiorxtwitchs-projects.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

app.options('*', (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3000;

// ── Routes basiques ──────────────────────────
app.get('/', (req, res) => res.json({ status: 'online' }));
app.get('/ping', (req, res) => res.json({ pong: true, timestamp: new Date().toISOString() }));

// ====================== ADMIN & PUBLIC API ======================

// 1. Récupérer tous les aliments
app.get('/api/aliments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aliments_burgershot')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Erreur /api/aliments:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Erreur serveur /api/aliments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Récupérer tous les utilisateurs
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users_burgershot')
      .select('id, username, discord_username, permission, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, users: data || [] });
  } catch (err) {
    console.error('Erreur /api/admin/users:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Créer un utilisateur depuis l'admin
app.post('/api/admin/register', async (req, res) => {
  const { username, discord_username, discord_user_id, password, permission } = req.body;

  if (!username || !discord_username || !discord_user_id || !password) {
    return res.json({ success: false, error: 'Champs manquants' });
  }

  try {
    const { data: existingUser } = await supabase
      .from('users_burgershot')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();
    if (existingUser) return res.json({ success: false, error: 'username_taken' });

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
        permission: permission || null
      })
      .select()
      .single();

    if (error) return res.json({ success: false, error: error.message });

    return res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Erreur admin/register:', err);
    return res.json({ success: false, error: err.message });
  }
});

// 4. Supprimer un utilisateur
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('users_burgershot')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Ajouter un aliment
app.post('/api/admin/aliments', async (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || !price || !category) {
    return res.json({ success: false, error: 'Nom, prix et catégorie requis' });
  }

  try {
    const { data, error } = await supabase
      .from('aliments_burgershot')
      .insert({
        name,
        description,
        price: parseInt(price),
        category
      })
      .select()
      .single();

    if (error) return res.json({ success: false, error: error.message });
    res.json({ success: true, aliment: data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 6. Supprimer un aliment
app.delete('/api/admin/aliments/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('aliments_burgershot')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== RECRUTEMENT API ======================

// API : Soumettre une candidature
app.post('/api/recruitment', async (req, res) => {
  const {
    first_name,
    last_name,
    age,
    phone,
    discord_username,
    experience,
    availability,
    motivations,
    worst_flaws
  } = req.body;

  if (!first_name || !last_name || !age || !phone || !discord_username || !experience || !motivations || !worst_flaws) {
    return res.json({ success: false, error: 'Champs manquants' });
  }

  try {
    // Chercher le membre Discord par username
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ success: false, error: 'Serveur Discord introuvable' });

    await guild.members.fetch();
    const member = guild.members.cache.find(
      m => m.user.username.toLowerCase() === discord_username.toLowerCase() ||
           (m.user.globalName && m.user.globalName.toLowerCase() === discord_username.toLowerCase())
    );

    if (!member) {
      return res.json({ success: false, error: 'discord_not_found' });
    }

    // Vérifier si une candidature est déjà en cours pour cet utilisateur
    const existingChannel = guild.channels.cache.find(
      c => c.parentId === RECRUITMENT_CATEGORY_ID &&
           c.name.startsWith('recrutement-') &&
           !c.name.endsWith('-refuser') &&
           !c.name.endsWith('-accepter')
    );

    // Compter les tickets de recrutement existants
    const recruitChannels = guild.channels.cache.filter(
      c => c.parentId === RECRUITMENT_CATEGORY_ID && c.name.startsWith('recrutement-')
    );
    const ticketNum = String(recruitChannels.size + 1).padStart(3, '0');
    const channelName = `recrutement-${ticketNum}`;

    // Créer le salon de ticket
    const channel = await guild.channels.create({
      name: channelName,
      type: 0,
      parent: RECRUITMENT_CATEGORY_ID,
      topic: `Candidature de ${first_name} ${last_name} — ${discord_username}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ],
    });

    // Construire la liste des disponibilités
    let availabilityText = 'Non renseignée';
    if (availability && typeof availability === 'object') {
      const days = Object.entries(availability)
        .filter(([, val]) => val && val.start && val.end)
        .map(([day, val]) => `• **${day}** : ${val.start} → ${val.end}`);
      availabilityText = days.length > 0 ? days.join('\n') : 'Aucune disponibilité indiquée';
    }

    // Embed de la candidature
    const recruitEmbed = new EmbedBuilder()
      .setColor(0xCC1A1A)
      .setTitle(`📋 Candidature — ${first_name} ${last_name}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Prénom & Nom', value: `${first_name} ${last_name}`, inline: true },
        { name: '🎂 Âge', value: String(age), inline: true },
        { name: '📞 Téléphone', value: phone, inline: true },
        { name: '🎮 Discord', value: `<@${member.user.id}> (\`${discord_username}\`)`, inline: false },
        { name: '💼 Expérience dans le domaine', value: experience || 'Aucune', inline: false },
        { name: '📅 Disponibilités', value: availabilityText, inline: false },
        { name: '💬 Motivations', value: motivations, inline: false },
        { name: '⚠️ Pire défauts', value: worst_flaws, inline: false },
      )
      .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
      .setTimestamp();

    const commandsHelp = [
      '**━━━ COMMANDES RECRUTEMENT ━━━**',
      '`^^accepter` — Accepter la candidature (ticket renommé en recrutement-XXX-accepter)',
      '`^^refuser` — Refuser la candidature (ticket renommé en recrutement-XXX-refuser)',
      '`^^close` — Fermer le ticket (retire l\'accès au candidat)',
      '`^^delete` — Supprimer définitivement le ticket',
      '`^^en_attente` — Informer le candidat que sa candidature est en cours de visionnage',
      '`^^entretien <date et heure>` — Fixer un entretien avec le candidat',
    ].join('\n');

    await channel.send({ content: `<@${member.user.id}>`, embeds: [recruitEmbed] });
    await channel.send(commandsHelp);

    // DM de confirmation au candidat
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xF5A623)
        .setTitle('🍔 Candidature reçue — Burger Shot')
        .setDescription(`Ta candidature a bien été reçue ! Un ticket a été créé : <#${channel.id}>`)
        .addFields(
          { name: '👤 Nom', value: `${first_name} ${last_name}`, inline: true },
          { name: '📌 Statut', value: '⏳ En attente de traitement', inline: true },
        )
        .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
        .setTimestamp();
      await member.user.send({ embeds: [dmEmbed] });
    } catch (dmErr) {
      console.warn('DM recrutement impossible:', dmErr.message);
    }

    console.log(`✅ Ticket recrutement créé : #${channelName} pour ${first_name} ${last_name}`);

    return res.json({
      success: true,
      channel_id: channel.id,
      channel_name: channelName,
      discord_user_id: member.user.id
    });

  } catch (err) {
    console.error('Erreur recrutement:', err);
    return res.json({ success: false, error: err.message });
  }
});

// API : Vérification username Discord
app.post('/api/verify-discord', async (req, res) => {
  const { discord_username } = req.body;
  if (!discord_username) return res.json({ found: false, error: 'Manquant' });

  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ found: false, error: 'Guild introuvable' });

    await guild.members.fetch();
    const member = guild.members.cache.find(
      m => m.user.username.toLowerCase() === discord_username.toLowerCase() ||
           (m.user.globalName && m.user.globalName.toLowerCase() === discord_username.toLowerCase())
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

// API : Inscription
app.post('/api/register', async (req, res) => {
  const { username, discord_username, discord_user_id, password } = req.body;
  if (!username || !discord_username || !password || !discord_user_id)
    return res.json({ success: false, error: 'Champs manquants' });

  try {
    const { data: existingUser } = await supabase
      .from('users_burgershot')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();
    if (existingUser) return res.json({ success: false, error: 'username_taken' });

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

    try {
      const discordUser = await client.users.fetch(discord_user_id);
      const embed = new EmbedBuilder()
        .setColor(0xCC1A1A)
        .setTitle('🍔 Bienvenue chez Burger Shot !')
        .setDescription('Ton compte a bien été créé.')
        .addFields(
          { name: '👤 Username', value: `\`${username.toLowerCase()}\``, inline: true },
          { name: '🎮 Discord', value: `\`${discord_username}\``, inline: true },
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

// API : Connexion
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
        permission: user.permission || null
      },
    });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// API : Passer une commande
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

// API : Liste commandes
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

// API : Statut commande
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

// ── Keep-Alive ───────────────────────────────
const RENDER_URL = process.env.RENDER_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await fetch(`${RENDER_URL}/ping`);
    } catch (e) {}
  }, 5 * 60 * 1000);
}

// ── CONFIG DISCORD + SUPABASE ─────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ORDERS_CATEGORY_ID = process.env.ORDERS_CATEGORY_ID;
const RECRUITMENT_CATEGORY_ID = '1491379454331846808';
const BLOCKED_ROLE_ID = '1467127476068159539'; // Ce rôle ne peut PAS utiliser les commandes recrutement
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const REQUIRED_ENV = ['DISCORD_TOKEN', 'GUILD_ID', 'ORDERS_CATEGORY_ID', 'SUPABASE_URL', 'SUPABASE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Variable manquante : ${key}`);
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
  en_attente: '⏳ En attente',
  acceptee: '✅ Acceptée',
  refusee: '❌ Refusée',
  recue: '📥 Reçue',
  preparation: '🍳 En préparation',
  finalisation: '🔍 Finalisation',
  termine: '✅ Terminée',
  livraison: '🚴 En livraison',
  reglee: '💰 Réglée',
};

// ── BOT READY ────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  setInterval(checkNotifications, 8000);
});

// ── POLL NOTIFICATIONS ───────────────────────
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
    '`^^recue` — Marquer comme reçue',
    '`^^preparation` — Marquer en préparation',
    '`^^finalisation` — Marquer en finalisation',
    order.delivery_type === 'livraison' ? '`^^livraison` — Marquer en cours de livraison' : '',
    '`^^terminer` — Marquer comme terminée',
    '`^^regler` — Marquer comme réglée',
    '`^^contact <message>` — Envoyer un message au client',
  ].filter(Boolean).join('\n');

  await channel.send({ embeds: [embed] });
  await channel.send(commandsHelp);

  if (order.discord_user_id) {
    try {
      const user = await client.users.fetch(order.discord_user_id);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xF5A623)
        .setTitle('🍔 Commande reçue — Burger Shot')
        .setDescription(`Ta commande **#${order.id}** a bien été reçue !`)
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
      .addFields({ name: '📌 Nouveau statut', value: statusLabel, inline: false });
    if (extraMessage) embed.addFields({ name: '💬 Message', value: extraMessage });
    embed.setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' }).setTimestamp();
    await user.send({ embeds: [embed] });
  } catch (e) {
    console.warn('DM notify impossible:', e.message);
  }
}

// ── Extraire le discord_user_id depuis un salon recrutement ──
async function getRecruitmentDiscordUserId(channel) {
  // Cherche les overwrites de permissions pour trouver l'ID du membre
  const memberOverwrite = channel.permissionOverwrites.cache.find(
    ow => ow.type === 1 && ow.id !== client.user.id // type 1 = membre
  );
  return memberOverwrite ? memberOverwrite.id : null;
}

// ── COMMANDES DISCORD ─────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const channelName = message.channel.name || '';

  // ══════════════════════════════════════════════
  // COMMANDES COMMANDES (tickets commande-)
  // ══════════════════════════════════════════════
  if (channelName.startsWith('commande-')) {
    const { data: order } = await supabase
      .from('orders_burgershot')
      .select('*')
      .eq('discord_channel_id', message.channel.id)
      .single();

    if (!order) return;

    if (content === '^^accepter') {
      await supabase.from('orders_burgershot').update({ status: 'acceptee' }).eq('id', order.id);
      await notifyClient({ ...order, status: 'acceptee' }, STATUS_LABELS['acceptee']);
      const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Commande acceptée').setDescription(`Commande #${order.id} → **${STATUS_LABELS['acceptee']}**`).setTimestamp();
      await message.channel.send({ embeds: [embed] });
      await message.react('✅');
      return;
    }

    if (content.startsWith('^^refuser')) {
      const reason = content.slice('^^refuser'.length).trim() || 'Aucune raison';
      await supabase.from('orders_burgershot').update({ status: 'refusee', refusal_reason: reason }).eq('id', order.id);

      if (order.discord_user_id) {
        try {
          const user = await client.users.fetch(order.discord_user_id);
          const embed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle(`❌ Commande #${order.id} refusée`)
            .addFields({ name: 'Raison', value: reason })
            .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
            .setTimestamp();
          await user.send({ embeds: [embed] });
        } catch (e) {}
      }
      const embed = new EmbedBuilder().setColor(0xef4444).setTitle('❌ Commande refusée').setDescription(`Commande #${order.id} refusée\nRaison : ${reason}`).setTimestamp();
      await message.channel.send({ embeds: [embed] });
      await message.react('❌');
      return;
    }

    const statusMap = {
      '^^recue': 'recue',
      '^^preparation': 'preparation',
      '^^finalisation': 'finalisation',
      '^^terminer': 'termine',
      '^^livraison': 'livraison',
      '^^regler': 'reglee',
    };

    if (statusMap[content]) {
      if (content === '^^livraison' && order.delivery_type !== 'livraison') {
        return message.reply('❌ Cette commande n\'est pas en livraison.');
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

    if (content.startsWith('^^contact ')) {
      const msg = content.slice('^^contact '.length).trim();
      if (!msg) return message.reply('❌ Syntaxe : `^^contact <message>`');

      await supabase.from('orders_burgershot').update({ ml_message: msg }).eq('id', order.id);
      await supabase.from('discord_messages_burgershot').insert({
        order_id: order.id,
        direction: 'out',
        content: msg,
      });

      if (order.discord_user_id) {
        try {
          const user = await client.users.fetch(order.discord_user_id);
          const dmEmbed = new EmbedBuilder()
            .setColor(0x4f7af8)
            .setTitle(`💬 Message équipe — Commande #${order.id}`)
            .setDescription(msg)
            .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
            .setTimestamp();
          await user.send({ embeds: [dmEmbed] });
        } catch (e) {}
      }

      const embed = new EmbedBuilder()
        .setColor(0x4f7af8)
        .setTitle('💬 Message envoyé')
        .setDescription(msg)
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      await message.react('📨');
    }

    return; // fin des commandes commande-
  }

  // ══════════════════════════════════════════════
  // COMMANDES RECRUTEMENT (tickets recrutement-)
  // ══════════════════════════════════════════════
  if (channelName.startsWith('recrutement-')) {

    // Vérification : le rôle bloqué ne peut pas utiliser les commandes ^^
    if (content.startsWith('^^')) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.has(BLOCKED_ROLE_ID)) {
        return message.reply('❌ Tu n\'as pas la permission d\'utiliser les commandes de recrutement.');
      }
    }

    // Extraire le numéro du ticket depuis le nom du salon
    const ticketNumMatch = channelName.match(/recrutement-(\d+)/);
    const ticketNum = ticketNumMatch ? ticketNumMatch[1] : '000';

    // Récupérer le discord_user_id du candidat (via les overwrites du salon)
    const candidateDiscordId = await getRecruitmentDiscordUserId(message.channel);

    // ── ^^accepter ──
    if (content === '^^accepter') {
      try {
        await message.channel.setName(`recrutement-${ticketNum}-accepter`);

        const embed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle('✅ Candidature Acceptée — Burger Shot RH')
          .setDescription('Félicitations ! Ta candidature a été **acceptée** par notre équipe RH.\nUn membre de l\'équipe te contactera prochainement pour la suite.')
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        if (candidateDiscordId) {
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder()
              .setColor(0x22c55e)
              .setTitle('✅ Candidature Acceptée — Burger Shot')
              .setDescription('Félicitations ! Ta candidature chez **Burger Shot** a été acceptée !\nUn membre RH te contactera prochainement.')
              .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {}
        }

        await message.react('✅');
      } catch (err) {
        console.error('Erreur ^^accepter recrutement:', err);
        await message.reply('❌ Erreur lors de l\'acceptation.');
      }
      return;
    }

    // ── ^^refuser ──
    if (content === '^^refuser') {
      try {
        await message.channel.setName(`recrutement-${ticketNum}-refuser`);

        // Retirer l'accès au candidat
        if (candidateDiscordId) {
          await message.channel.permissionOverwrites.edit(candidateDiscordId, {
            ViewChannel: false,
          });
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder()
              .setColor(0xef4444)
              .setTitle('❌ Candidature Refusée — Burger Shot')
              .setDescription('Nous sommes désolés, ta candidature chez **Burger Shot** n\'a pas été retenue.\nNous te souhaitons bonne chance dans tes futures démarches.')
              .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {}
        }

        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle('❌ Candidature Refusée')
          .setDescription('La candidature a été refusée et le candidat a perdu l\'accès au ticket.')
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await message.react('❌');
      } catch (err) {
        console.error('Erreur ^^refuser recrutement:', err);
        await message.reply('❌ Erreur lors du refus.');
      }
      return;
    }

    // ── ^^close ──
    if (content === '^^close') {
      try {
        // Retirer l'accès au candidat sans supprimer le salon
        if (candidateDiscordId) {
          await message.channel.permissionOverwrites.edit(candidateDiscordId, {
            ViewChannel: false,
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0x888888)
          .setTitle('🔒 Ticket fermé')
          .setDescription('Le ticket a été fermé. Le candidat n\'a plus accès à ce salon.')
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await message.react('🔒');
      } catch (err) {
        console.error('Erreur ^^close:', err);
        await message.reply('❌ Erreur lors de la fermeture.');
      }
      return;
    }

    // ── ^^delete ──
    if (content === '^^delete') {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle('🗑️ Suppression du ticket')
          .setDescription('Ce ticket sera supprimé dans **5 secondes**...')
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        await message.react('🗑️');

        setTimeout(async () => {
          try {
            await message.channel.delete();
          } catch (e) {
            console.warn('Impossible de supprimer le salon:', e.message);
          }
        }, 5000);
      } catch (err) {
        console.error('Erreur ^^delete:', err);
        await message.reply('❌ Erreur lors de la suppression.');
      }
      return;
    }

    // ── ^^en_attente ──
    if (content === '^^en_attente') {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xF5A623)
          .setTitle('⏳ Candidature en cours de traitement — Burger Shot RH')
          .setDescription('Votre candidature est actuellement **en cours de visionnage** par notre équipe RH.\n\nNous reviendrons vers vous dans les plus brefs délais. Merci de votre patience !')
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();

        const mention = candidateDiscordId ? `<@${candidateDiscordId}>` : '';
        await message.channel.send({ content: mention, embeds: [embed] });

        if (candidateDiscordId) {
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder()
              .setColor(0xF5A623)
              .setTitle('⏳ Candidature en cours de traitement — Burger Shot')
              .setDescription('Votre candidature est en cours de visionnage par notre équipe RH.\nNous vous contacterons prochainement.')
              .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {}
        }

        await message.react('⏳');
      } catch (err) {
        console.error('Erreur ^^en_attente:', err);
        await message.reply('❌ Erreur lors de l\'envoi.');
      }
      return;
    }

    // ── ^^entretien <date et heure> ──
    if (content.startsWith('^^entretien ')) {
      const datetime = content.slice('^^entretien '.length).trim();
      if (!datetime) {
        return message.reply('❌ Syntaxe : `^^entretien <date et heure>` — Ex: `^^entretien Samedi 12 Avril à 18h00`');
      }

      try {
        const embed = new EmbedBuilder()
          .setColor(0x4f7af8)
          .setTitle('📅 Entretien fixé — Burger Shot RH')
          .setDescription(`Un entretien a été fixé avec notre équipe RH.\n\n**📆 Date & Heure :** ${datetime}\n\nMerci d'être disponible à l'heure indiquée. En cas d'empêchement, contactez-nous au plus vite.`)
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();

        const mention = candidateDiscordId ? `<@${candidateDiscordId}>` : '';
        await message.channel.send({ content: mention, embeds: [embed] });

        if (candidateDiscordId) {
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder()
              .setColor(0x4f7af8)
              .setTitle('📅 Entretien fixé — Burger Shot')
              .setDescription(`Un entretien a été fixé avec l'équipe RH de **Burger Shot** !\n\n**📆 Date & Heure :** ${datetime}\n\nSois disponible à l'heure indiquée. En cas d'empêchement, contacte-nous.`)
              .setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' })
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {}
        }

        await message.react('📅');
      } catch (err) {
        console.error('Erreur ^^entretien:', err);
        await message.reply('❌ Erreur lors de la fixation de l\'entretien.');
      }
      return;
    }
  }
});

// ── DÉMARRAGE ─────────────────────────────────
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Erreur connexion Discord:', err);
  process.exit(1);
});
