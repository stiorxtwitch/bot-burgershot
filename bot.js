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

    let availabilityText = 'Non renseignée';
    if (availability && typeof availability === 'object') {
      const days = Object.entries(availability)
        .filter(([, val]) => val && val.start && val.end)
        .map(([day, val]) => `• **${day}** : ${val.start} → ${val.end}`);
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
        { name: '💼 Expérience dans le domaine', value: experience || 'Aucune', inline: false },
        { name: '📅 Disponibilités', value: availabilityText, inline: false },
        { name: '💬 Motivations', value: motivations, inline: false },
        { name: '⚠️ Pire défauts', value: worst_flaws, inline: false },
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

// ====================== PARTIE COMMANDES DE NOURRITURE DÉSACTIVÉE ======================
// Tout ce qui concerne la création et la gestion des commandes de nourriture est désactivé

// app.post('/api/order', async (req, res) => {
//   const { user_id, discord_username, discord_user_id, first_name, last_name, phone, delivery_type, address, zip_code, items, total } = req.body;
//   if (!user_id || !items || !total)
//     return res.json({ success: false, error: 'Données manquantes' });
//   try {
//     const { data: order, error } = await supabase
//       .from('orders_burgershot')
//       .insert({
//         user_id,
//         discord_username,
//         discord_user_id,
//         first_name,
//         last_name,
//         phone,
//         delivery_type,
//         address: address || null,
//         zip_code: zip_code || null,
//         items,
//         total,
//         status: 'en_attente',
//       })
//       .select()
//       .single();
//     if (error) return res.json({ success: false, error: error.message });
//     await supabase.from('discord_notifications_burgershot').insert({
//       type: 'order',
//       order_id: order.id,
//       processed: false,
//     });
//     return res.json({ success: true, order_id: order.id });
//   } catch (err) {
//     return res.json({ success: false, error: err.message });
//   }
// });

// app.get('/api/orders', async (req, res) => {
//   const { user_id } = req.query;
//   if (!user_id) return res.json({ success: false, error: 'user_id manquant' });
//   try {
//     const { data: orders, error } = await supabase
//       .from('orders_burgershot')
//       .select('*')
//       .eq('user_id', user_id)
//       .order('created_at', { ascending: false });
//     if (error) return res.json({ success: false, error: error.message });
//     return res.json({ success: true, orders: orders || [] });
//   } catch (err) {
//     return res.json({ success: false, error: err.message });
//   }
// });

// app.get('/api/order/:id', async (req, res) => {
//   const { data: order } = await supabase
//     .from('orders_burgershot')
//     .select('*')
//     .eq('id', req.params.id)
//     .single();
//   if (!order) return res.json({ success: false, error: 'Commande introuvable' });
//   const { data: messages } = await supabase
//     .from('discord_messages_burgershot')
//     .select('*')
//     .eq('order_id', order.id)
//     .eq('direction', 'out')
//     .order('created_at', { ascending: false });
//   return res.json({ success: true, order, messages: messages || [] });
// });

// async function handleNewOrder(orderId) {
//   // TOUTE LA FONCTION handleNewOrder EST DÉSACTIVÉE
// }

// async function notifyClient(order, statusLabel, extraMessage = null) {
//   // TOUTE LA FONCTION notifyClient EST DÉSACTIVÉE
// }

// ====================== CONFIG DISCORD + SUPABASE ======================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const RECRUITMENT_CATEGORY_ID = '1491379454331846808';
const BLOCKED_ROLE_ID = '1467127476068159539';

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

// ── COMMANDES DISCORD (UNIQUEMENT RECRUTEMENT) ─────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const channelName = message.channel.name || '';

  // ==================== RECRUTEMENT ====================
  if (channelName.startsWith('recrutement-')) {
    const ticketNumMatch = channelName.match(/recrutement-(\d+)/);
    const ticketNum = ticketNumMatch ? ticketNumMatch[1] : '000';
    const candidateDiscordId = await getRecruitmentDiscordUserId(message.channel);

    if (content.startsWith('^^')) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.has(BLOCKED_ROLE_ID)) {
        return message.reply('❌ Tu n\'as pas la permission d\'utiliser les commandes de recrutement.');
      }
    }

    // ^^accepter
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

    // ^^refuser
    if (content === '^^refuser') {
      try {
        await message.channel.setName(`recrutement-${ticketNum}-refuser`);
        if (candidateDiscordId) {
          await message.channel.permissionOverwrites.edit(candidateDiscordId, { ViewChannel: false });
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

    // ^^close
    if (content === '^^close') {
      try {
        if (candidateDiscordId) {
          await message.channel.permissionOverwrites.edit(candidateDiscordId, { ViewChannel: false });
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

    // ^^delete
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
          try { await message.channel.delete(); } catch (e) {}
        }, 5000);
      } catch (err) {
        console.error('Erreur ^^delete:', err);
        await message.reply('❌ Erreur lors de la suppression.');
      }
      return;
    }

    // ^^en_attente
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
        await message.react('⏳');
      } catch (err) {
        console.error('Erreur ^^en_attente:', err);
        await message.reply('❌ Erreur lors de l\'envoi.');
      }
      return;
    }

    // ^^entretien <date et heure>
    if (content.startsWith('^^entretien ')) {
      const datetime = content.slice('^^entretien '.length).trim();
      if (!datetime) return message.reply('❌ Syntaxe : `^^entretien <date et heure>`');

      try {
        const embed = new EmbedBuilder()
          .setColor(0x4f7af8)
          .setTitle('📅 Entretien fixé — Burger Shot RH')
          .setDescription(`Un entretien a été fixé avec notre équipe RH.\n\n**📆 Date & Heure :** ${datetime}\n\nMerci d'être disponible à l'heure indiquée.`)
          .setFooter({ text: 'Burger Shot — Recrutement RH 🍔' })
          .setTimestamp();
        const mention = candidateDiscordId ? `<@${candidateDiscordId}>` : '';
        await message.channel.send({ content: mention, embeds: [embed] });
        await message.react('📅');
      } catch (err) {
        console.error('Erreur ^^entretien:', err);
        await message.reply('❌ Erreur lors de la fixation de l\'entretien.');
      }
      return;
    }
  }
});

// ── Fonction utilitaire pour récupérer l'ID Discord du candidat ──
async function getRecruitmentDiscordUserId(channel) {
  const memberOverwrite = channel.permissionOverwrites.cache.find(
    ow => ow.type === 1 && ow.id !== client.user.id
  );
  return memberOverwrite ? memberOverwrite.id : null;
}

// ── DÉMARRAGE ─────────────────────────────────
const REQUIRED_ENV = ['DISCORD_TOKEN', 'GUILD_ID', 'RECRUITMENT_CATEGORY_ID', 'SUPABASE_URL', 'SUPABASE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Variable manquante : ${key}`);
    process.exit(1);
  }
}

client.login(DISCORD_TOKEN).catch(err => {
  console.error('Erreur connexion Discord:', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Express actif sur le port ${PORT}`);
});
