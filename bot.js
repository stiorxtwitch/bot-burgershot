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
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

app.options('*', (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'online' }));
app.get('/ping', (req, res) => res.json({ pong: true, timestamp: new Date().toISOString() }));

// ====================== CONFIG DISCORD + SUPABASE ======================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const RECRUITMENT_CATEGORY_ID = process.env.RECRUITMENT_CATEGORY_ID || '1491379454331846808';
const BLOCKED_ROLE_ID = process.env.BLOCKED_ROLE_ID || '1467127476068159539';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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

// ── BOT READY ────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
});

// ====================== ADMIN & PUBLIC API ======================

// 1. Récupérer tous les aliments
app.get('/api/aliments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aliments_burgershot')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json(data || []);
  } catch (err) {
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
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Créer un utilisateur depuis l'admin
app.post('/api/admin/register', async (req, res) => {
  const { username, discord_username, discord_user_id, password, permission } = req.body;
  if (!username || !discord_username || !discord_user_id || !password)
    return res.json({ success: false, error: 'Champs manquants' });
  try {
    const { data: existingUser } = await supabase.from('users_burgershot').select('id').eq('username', username.toLowerCase()).single();
    if (existingUser) return res.json({ success: false, error: 'username_taken' });
    const { data: existingDiscord } = await supabase.from('users_burgershot').select('id').eq('discord_username', discord_username.toLowerCase()).single();
    if (existingDiscord) return res.json({ success: false, error: 'discord_taken' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data: newUser, error } = await supabase.from('users_burgershot').insert({ username: username.toLowerCase(), discord_username: discord_username.toLowerCase(), discord_user_id, password_hash, permission: permission || null }).select().single();
    if (error) return res.json({ success: false, error: error.message });
    return res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// 4. Supprimer un utilisateur
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('users_burgershot').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Ajouter un aliment
app.post('/api/admin/aliments', async (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || !price || !category)
    return res.json({ success: false, error: 'Nom, prix et catégorie requis' });
  try {
    const { data, error } = await supabase.from('aliments_burgershot').insert({ name, description, price: parseInt(price), category }).select().single();
    if (error) return res.json({ success: false, error: error.message });
    res.json({ success: true, aliment: data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 6. Supprimer un aliment
app.delete('/api/admin/aliments/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('aliments_burgershot').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== COMMANDES ======================

// POST /api/order — Créer une commande
app.post('/api/order', async (req, res) => {
  const { user_id, discord_username, discord_user_id, first_name, last_name, phone, delivery_type, address, zip_code, items, total } = req.body;
  if (!user_id || !items || !total)
    return res.json({ success: false, error: 'Données manquantes' });
  try {
    const { data: order, error } = await supabase
      .from('orders_burgershot')
      .insert({
        user_id,
        discord_username: discord_username || null,
        discord_user_id: discord_user_id || null,
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

    // Notification Discord si le bot est prêt
    try {
      await notifyNewOrder(order);
    } catch (notifErr) {
      console.warn('Notification Discord échouée (non bloquant):', notifErr.message);
    }

    return res.json({ success: true, order_id: order.id });
  } catch (err) {
    console.error('Erreur /api/order:', err);
    return res.json({ success: false, error: err.message });
  }
});

// GET /api/orders?user_id=xxx — Commandes d'un utilisateur
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

// GET /api/order/:id — Détail d'une commande + messages
app.get('/api/order/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders_burgershot').select('*').eq('id', req.params.id).single();
    if (!order) return res.json({ success: false, error: 'Commande introuvable' });
    const { data: messages } = await supabase
      .from('order_messages_burgershot')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });
    return res.json({ success: true, order, messages: messages || [] });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// PATCH /api/order/:id/status — Mettre à jour le statut
app.patch('/api/order/:id/status', async (req, res) => {
  const { status, refus_motif } = req.body;
  if (!status) return res.json({ success: false, error: 'Statut manquant' });
  try {
    const updateData = { status };
    if (refus_motif) updateData.refus_motif = refus_motif;
    const { error } = await supabase.from('orders_burgershot').update(updateData).eq('id', req.params.id);
    if (error) return res.json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ====================== MESSAGERIE COMMANDES ======================

// GET /api/order/:id/messages — Récupérer les messages d'une commande
app.get('/api/order/:id/messages', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('order_messages_burgershot')
      .select('*')
      .eq('order_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) return res.json({ success: false, error: error.message });
    return res.json({ success: true, messages: data || [] });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// POST /api/order/:id/messages — Envoyer un message
app.post('/api/order/:id/messages', async (req, res) => {
  const { sender_type, sender_name, content } = req.body;
  // sender_type: 'client' | 'employee'
  if (!sender_type || !content) return res.json({ success: false, error: 'Données manquantes' });
  try {
    const { data, error } = await supabase
      .from('order_messages_burgershot')
      .insert({
        order_id: parseInt(req.params.id),
        sender_type,
        sender_name: sender_name || (sender_type === 'employee' ? 'Équipe' : 'Client'),
        content,
      })
      .select()
      .single();
    if (error) return res.json({ success: false, error: error.message });

    // Notifier via Discord DM si message employé → client
    try {
      if (sender_type === 'employee') {
        const { data: order } = await supabase.from('orders_burgershot').select('*').eq('id', req.params.id).single();
        if (order && order.discord_user_id) {
          const discordUser = await client.users.fetch(order.discord_user_id);
          const embed = new EmbedBuilder()
            .setColor(0xF5A623)
            .setTitle(`💬 Message — Commande #${order.id}`)
            .setDescription(content)
            .setFooter({ text: `Burger Shot — ${sender_name || 'Équipe'}` })
            .setTimestamp();
          await discordUser.send({ embeds: [embed] });
        }
      }
    } catch (dmErr) {
      console.warn('DM message impossible:', dmErr.message);
    }

    return res.json({ success: true, message: data });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ====================== NOTIFICATION DISCORD NOUVELLE COMMANDE ======================
async function notifyNewOrder(order) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  // Chercher un salon "commandes" ou "orders" dans le serveur
  const ordersChannel = guild.channels.cache.find(
    c => c.type === 0 && (c.name.includes('commande') || c.name.includes('order') || c.name.includes('cuisine'))
  );
  if (!ordersChannel) return;

  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  const itemsList = items.map(i => `• ${i.name} ×${i.qty} — ${(i.price * i.qty).toLocaleString('fr-FR')} DA`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xCC1A1A)
    .setTitle(`🍔 Nouvelle commande #${order.id}`)
    .addFields(
      { name: '👤 Client', value: `${order.first_name} ${order.last_name}`, inline: true },
      { name: '📞 Tél', value: order.phone || '—', inline: true },
      { name: '🚚 Livraison', value: order.delivery_type === 'livraison' ? '🚴 À domicile' : '🏪 Sur place', inline: true },
      { name: '🛒 Articles', value: itemsList || '—' },
      { name: '💰 Total', value: `${Number(order.total).toLocaleString('fr-FR')} DA`, inline: true },
    )
    .setFooter({ text: 'Burger Shot — Nouvelle commande reçue' })
    .setTimestamp();

  await ordersChannel.send({ embeds: [embed] });
}

// ====================== RECRUTEMENT API ======================

// API : Vérification username Discord — AMÉLIORÉE
app.post('/api/verify-discord', async (req, res) => {
  const { discord_username } = req.body;
  if (!discord_username) return res.json({ found: false, error: 'Manquant' });
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ found: false, error: 'Guild introuvable' });

    // Force un fetch complet des membres
    try {
      await guild.members.fetch({ force: true });
    } catch (fetchErr) {
      console.warn('Fetch members partiel:', fetchErr.message);
    }

    const search = discord_username.toLowerCase().trim();

    const member = guild.members.cache.find(m => {
      const uname = (m.user.username || '').toLowerCase();
      const globalName = (m.user.globalName || '').toLowerCase();
      const displayName = (m.displayName || '').toLowerCase();
      const nickname = (m.nickname || '').toLowerCase();
      return uname === search || globalName === search || displayName === search || nickname === search;
    });

    if (member) {
      return res.json({
        found: true,
        user_id: member.user.id,
        tag: member.user.globalName || member.user.username || member.user.tag,
      });
    } else {
      // Tentative de recherche par API Discord directement
      try {
        const results = await guild.members.search({ query: discord_username, limit: 10 });
        const match = results.find(m => {
          const uname = (m.user.username || '').toLowerCase();
          const globalName = (m.user.globalName || '').toLowerCase();
          return uname === search || globalName === search;
        });
        if (match) {
          return res.json({
            found: true,
            user_id: match.user.id,
            tag: match.user.globalName || match.user.username,
          });
        }
      } catch (searchErr) {
        console.warn('Search members failed:', searchErr.message);
      }
      return res.json({ found: false });
    }
  } catch (err) {
    console.error('Erreur verify-discord:', err);
    return res.json({ found: false, error: err.message });
  }
});

// API : Soumettre une candidature
app.post('/api/recruitment', async (req, res) => {
  const { first_name, last_name, age, phone, discord_username, experience, availability, motivations, worst_flaws } = req.body;
  if (!first_name || !last_name || !age || !phone || !discord_username || !experience || !motivations || !worst_flaws)
    return res.json({ success: false, error: 'Champs manquants' });

  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ success: false, error: 'Serveur Discord introuvable' });

    // Fetch forcé
    try { await guild.members.fetch({ force: true }); } catch {}

    const search = discord_username.toLowerCase().trim();
    let member = guild.members.cache.find(m => {
      const uname = (m.user.username || '').toLowerCase();
      const globalName = (m.user.globalName || '').toLowerCase();
      const displayName = (m.displayName || '').toLowerCase();
      return uname === search || globalName === search || displayName === search;
    });

    // Si pas trouvé dans le cache, tentative de recherche
    if (!member) {
      try {
        const results = await guild.members.search({ query: discord_username, limit: 10 });
        member = results.find(m => {
          const uname = (m.user.username || '').toLowerCase();
          const globalName = (m.user.globalName || '').toLowerCase();
          return uname === search || globalName === search;
        });
      } catch {}
    }

    if (!member) return res.json({ success: false, error: 'discord_not_found' });

    const recruitChannels = guild.channels.cache.filter(
      c => c.parentId === RECRUITMENT_CATEGORY_ID && c.name.startsWith('recrutement-')
    );
    const ticketNum = String(recruitChannels.size + 1).padStart(3, '0');
    const channelName = `recrutement-${ticketNum}`;

    const channel = await guild.channels.create({
      name: channelName,
      type: 0,
      parent: RECRUITMENT_CATEGORY_ID,
      topic: `Candidature de ${first_name} ${last_name} — ${discord_username}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
      ],
    });

    let availabilityText = 'Non renseignée';
    if (availability && typeof availability === 'object') {
      const days = Object.entries(availability).filter(([, val]) => val && val.start && val.end).map(([day, val]) => `• **${day}** : ${val.start} → ${val.end}`);
      availabilityText = days.length > 0 ? days.join('\n') : 'Aucune disponibilité indiquée';
    }

    const recruitEmbed = new EmbedBuilder()
      .setColor(0xCC1A1A)
      .setTitle(`📋 Candidature — ${first_name} ${last_name}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Prénom & Nom', value: `${first_name} ${last_name}`, inline: true },
        { name: '🎂 Âge', value: String(age), inline: true },
        { name: '📞 Téléphone', value: phone, inline: true },
        { name: '🎮 Discord', value: `<@${member.user.id}> (\`${discord_username}\`)`, inline: false },
        { name: '💼 Expérience', value: experience || 'Aucune', inline: false },
        { name: '📅 Disponibilités', value: availabilityText, inline: false },
        { name: '💬 Motivations', value: motivations, inline: false },
        { name: '⚠️ Pires défauts', value: worst_flaws, inline: false },
      )
      .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
      .setTimestamp();

    const commandsHelp = [
      '**━━━ COMMANDES RECRUTEMENT ━━━**',
      '`^^accepter` — Accepter la candidature',
      '`^^refuser` — Refuser la candidature',
      '`^^close` — Fermer le ticket',
      '`^^delete` — Supprimer définitivement le ticket',
      '`^^en_attente` — Informer le candidat que sa candidature est en cours de visionnage',
      '`^^entretien <date et heure>` — Fixer un entretien avec le candidat',
    ].join('\n');

    await channel.send({ content: `<@${member.user.id}>`, embeds: [recruitEmbed] });
    await channel.send(commandsHelp);

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

    return res.json({ success: true, channel_id: channel.id, channel_name: channelName, discord_user_id: member.user.id });
  } catch (err) {
    console.error('Erreur recrutement:', err);
    return res.json({ success: false, error: err.message });
  }
});

// API : Inscription
app.post('/api/register', async (req, res) => {
  const { username, discord_username, discord_user_id, password } = req.body;
  if (!username || !discord_username || !password || !discord_user_id)
    return res.json({ success: false, error: 'Champs manquants' });
  try {
    const { data: existingUser } = await supabase.from('users_burgershot').select('id').eq('username', username.toLowerCase()).single();
    if (existingUser) return res.json({ success: false, error: 'username_taken' });
    const { data: existingDiscord } = await supabase.from('users_burgershot').select('id').eq('discord_username', discord_username.toLowerCase()).single();
    if (existingDiscord) return res.json({ success: false, error: 'discord_taken' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data: newUser, error } = await supabase.from('users_burgershot').insert({ username: username.toLowerCase(), discord_username: discord_username.toLowerCase(), discord_user_id, password_hash }).select().single();
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
    return res.json({ success: false, error: err.message });
  }
});

// API : Connexion
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Champs manquants' });
  try {
    const { data: user } = await supabase.from('users_burgershot').select('*').eq('username', username.toLowerCase()).single();
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.json({ success: false, error: 'Mot de passe incorrect' });
    return res.json({ success: true, user: { id: user.id, username: user.username, discord_username: user.discord_username, discord_user_id: user.discord_user_id, permission: user.permission || null } });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ====================== COMMANDES DISCORD RECRUTEMENT ======================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const channelName = message.channel.name || '';

  if (channelName.startsWith('recrutement-')) {
    const ticketNumMatch = channelName.match(/recrutement-(\d+)/);
    const ticketNum = ticketNumMatch ? ticketNumMatch[1] : '000';
    const candidateDiscordId = await getRecruitmentDiscordUserId(message.channel);

    if (content.startsWith('^^')) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.has(BLOCKED_ROLE_ID))
        return message.reply('❌ Tu n\'as pas la permission d\'utiliser les commandes de recrutement.');
    }

    if (content === '^^accepter') {
      try {
        await message.channel.setName(`recrutement-${ticketNum}-accepter`);
        const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Candidature Acceptée — Burger Shot RH').setDescription('Félicitations ! Ta candidature a été **acceptée** par notre équipe RH.\nUn membre de l\'équipe te contactera prochainement.').setFooter({ text: 'Burger Shot — Recrutement RH 🍔' }).setTimestamp();
        await message.channel.send({ embeds: [embed] });
        if (candidateDiscordId) {
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Candidature Acceptée — Burger Shot').setDescription('Félicitations ! Ta candidature chez **Burger Shot** a été acceptée !\nUn membre RH te contactera prochainement.').setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' }).setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch {}
        }
        await message.react('✅');
      } catch (err) { await message.reply('❌ Erreur lors de l\'acceptation.'); }
      return;
    }

    if (content === '^^refuser') {
      try {
        await message.channel.setName(`recrutement-${ticketNum}-refuser`);
        if (candidateDiscordId) {
          await message.channel.permissionOverwrites.edit(candidateDiscordId, { ViewChannel: false });
          try {
            const user = await client.users.fetch(candidateDiscordId);
            const dmEmbed = new EmbedBuilder().setColor(0xef4444).setTitle('❌ Candidature Refusée — Burger Shot').setDescription('Nous sommes désolés, ta candidature chez **Burger Shot** n\'a pas été retenue.\nNous te souhaitons bonne chance dans tes futures démarches.').setFooter({ text: 'Burger Shot — Le goût qui te tire dessus 🔥' }).setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch {}
        }
        const embed = new EmbedBuilder().setColor(0xef4444).setTitle('❌ Candidature Refusée').setDescription('La candidature a été refusée et le candidat a perdu l\'accès au ticket.').setFooter({ text: 'Burger Shot — Recrutement RH 🍔' }).setTimestamp();
        await message.channel.send({ embeds: [embed] });
        await message.react('❌');
      } catch (err) { await message.reply('❌ Erreur lors du refus.'); }
      return;
    }

    if (content === '^^close') {
      try {
        if (candidateDiscordId) await message.channel.permissionOverwrites.edit(candidateDiscordId, { ViewChannel: false });
        const embed = new EmbedBuilder().setColor(0x888888).setTitle('🔒 Ticket fermé').setDescription('Le ticket a été fermé.').setFooter({ text: 'Burger Shot — Recrutement RH 🍔' }).setTimestamp();
        await message.channel.send({ embeds: [embed] });
        await message.react('🔒');
      } catch (err) { await message.reply('❌ Erreur lors de la fermeture.'); }
      return;
    }

    if (content === '^^delete') {
      try {
        const embed = new EmbedBuilder().setColor(0xef4444).setTitle('🗑️ Suppression du ticket').setDescription('Ce ticket sera supprimé dans **5 secondes**...').setTimestamp();
        await message.channel.send({ embeds: [embed] });
        await message.react('🗑️');
        setTimeout(async () => { try { await message.channel.delete(); } catch {} }, 5000);
      } catch (err) { await message.reply('❌ Erreur lors de la suppression.'); }
      return;
    }

    if (content === '^^en_attente') {
      try {
        const embed = new EmbedBuilder().setColor(0xF5A623).setTitle('⏳ Candidature en cours de traitement — Burger Shot RH').setDescription('Votre candidature est actuellement **en cours de visionnage** par notre équipe RH.\n\nNous reviendrons vers vous dans les plus brefs délais. Merci de votre patience !').setFooter({ text: 'Burger Shot — Recrutement RH 🍔' }).setTimestamp();
        const mention = candidateDiscordId ? `<@${candidateDiscordId}>` : '';
        await message.channel.send({ content: mention, embeds: [embed] });
        await message.react('⏳');
      } catch (err) { await message.reply('❌ Erreur lors de l\'envoi.'); }
      return;
    }

    if (content.startsWith('^^entretien ')) {
      const datetime = content.slice('^^entretien '.length).trim();
      if (!datetime) return message.reply('❌ Syntaxe : `^^entretien <date et heure>`');
      try {
        const embed = new EmbedBuilder().setColor(0x4f7af8).setTitle('📅 Entretien fixé — Burger Shot RH').setDescription(`Un entretien a été fixé avec notre équipe RH.\n\n**📆 Date & Heure :** ${datetime}\n\nMerci d'être disponible à l'heure indiquée.`).setFooter({ text: 'Burger Shot — Recrutement RH 🍔' }).setTimestamp();
        const mention = candidateDiscordId ? `<@${candidateDiscordId}>` : '';
        await message.channel.send({ content: mention, embeds: [embed] });
        await message.react('📅');
      } catch (err) { await message.reply('❌ Erreur lors de la fixation de l\'entretien.'); }
      return;
    }
  }
});

async function getRecruitmentDiscordUserId(channel) {
  const memberOverwrite = channel.permissionOverwrites.cache.find(ow => ow.type === 1 && ow.id !== client.user.id);
  return memberOverwrite ? memberOverwrite.id : null;
}

// ── DÉMARRAGE ─────────────────────────────────
const REQUIRED_ENV = ['DISCORD_TOKEN', 'GUILD_ID', 'SUPABASE_URL', 'SUPABASE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) { console.error(`❌ Variable manquante : ${key}`); process.exit(1); }
}

client.login(DISCORD_TOKEN).catch(err => { console.error('Erreur connexion Discord:', err); process.exit(1); });

app.listen(PORT, () => { console.log(`🌐 Serveur Express actif sur le port ${PORT}`); });
