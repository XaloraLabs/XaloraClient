"use strict";

const crypto = require('crypto');
const loadConfig = require("../handlers/config");
const settings = loadConfig();
const fetch = require("node-fetch");
const indexjs = require("../handlers/helper.js");
const log = require("../handlers/log");
const fs = require("fs");
const { renderFile } = require("ejs");
const { google } = require('googleapis');

// Clean up trailing slashes in settings
function cleanupSettings() {
  if (settings.api.client.oauth2.discord.link.slice(-1) == "/") {
    settings.api.client.oauth2.discord.link = settings.api.client.oauth2.discord.link.slice(0, -1);
  }

  if (settings.api.client.oauth2.discord.callbackpath.slice(0, 1) !== "/") {
    settings.api.client.oauth2.discord.callbackpath = "/" + settings.api.client.oauth2.discord.callbackpath;
  }

  if (settings.pterodactyl.domain.slice(-1) == "/") {
    settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);
  }
}

// Initialize Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  settings.api.client.oauth2.google.id,
  settings.api.client.oauth2.google.secret,
  settings.api.client.oauth2.google.link + settings.api.client.oauth2.google.callbackpath
);

// Common utility functions
function makeid(length) {
  let result = "";
  let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Handle user creation in Pterodactyl
async function createPterodactylUser(userinfo, email, db, req) {
  if (!(await db.get("users-" + userinfo.id))) {
    if (settings.api.client.allow.newusers !== true) {
      return { success: false, error: "New users cannot signup currently." };
    }

    let genpassword = null;
    if (settings.api.client.passwordgenerator.signup === true) {
      genpassword = makeid(settings.api.client.passwordgenerator["length"]);
    }

    try {
      const accountjson = await fetch(
        `${settings.pterodactyl.domain}/api/application/users`,
        {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.pterodactyl.key}`,
          },
          body: JSON.stringify({
            username: userinfo.id,
            email: email,
            first_name: userinfo.username || userinfo.given_name || userinfo.login,
            last_name: userinfo.discriminator ? `#${userinfo.discriminator}` : (userinfo.family_name || ''),
            password: genpassword,
          }),
        }
      );

      if (accountjson.status === 201) {
        const accountinfo = await accountjson.json();
        let userids = (await db.get("users")) || [];
        userids.push(accountinfo.attributes.id);
        await db.set("users", userids);
        await db.set("users-" + userinfo.id, accountinfo.attributes.id);
        req.session.newaccount = true;
        req.session.password = genpassword;
        return { success: true };
      }

      // Handle existing email case
      const existingAccount = await handleExistingEmail(email, userinfo.id, db);
      if (existingAccount.success) {
        req.session.pterodactyl = existingAccount.user;
        return { success: true };
      }

      return { success: false, error: existingAccount.error };
    } catch (error) {
      return { success: false, error: "An error occurred while creating your account." };
    }
  }
  return { success: true };
}

async function handleExistingEmail(email, userId, db) {
  const accountlistjson = await fetch(
    `${settings.pterodactyl.domain}/api/application/users?include=servers&filter[email]=${encodeURIComponent(email)}`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.pterodactyl.key}`,
      },
    }
  );

  const accountlist = await accountlistjson.json();
  const user = accountlist.data.find((acc) => acc.attributes.email === email);

  if (user) {
    const userids = (await db.get("users")) || [];
    if (!userids.includes(user.attributes.id)) {
      userids.push(user.attributes.id);
      await db.set("users", userids);
      await db.set("users-" + userId, user.attributes.id);
      return { success: true, user: user.attributes };
    }
    return { success: false, error: "Account exists but is associated with a different user." };
  }

  return { success: false, error: "No existing account found." };
}

// Provider-specific handlers
const providerHandlers = {
  discord: {
    getLoginURL: (settings, req) => {
      const newsettings = JSON.parse(fs.readFileSync("./settings.json"));
      return `https://discord.com/api/oauth2/authorize?client_id=${settings.api.client.oauth2.id
        }&redirect_uri=${encodeURIComponent(
          settings.api.client.oauth2.link + settings.api.client.oauth2.callbackpath
        )}&response_type=code&scope=identify%20email${newsettings.api.client.bot.joinguild.enabled == true
          ? "%20guilds.join"
          : ""
        }${newsettings.api.client.j4r.enabled == true ? "%20guilds" : ""}${settings.api.client.oauth2.prompt == false
          ? "&prompt=none"
          : req.query.prompt
            ? req.query.prompt == "none"
              ? "&prompt=none"
              : ""
            : ""
        }`;
    },

    handleCallback: async (req, res, db) => {
      const code = req.query.code;
      if (!code) return { success: false };

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "post",
        body: `client_id=${settings.api.client.oauth2.id}&client_secret=${settings.api.client.oauth2.secret
          }&grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${settings.api.client.oauth2.link + settings.api.client.oauth2.callbackpath
          }`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const tokenData = await tokenResponse.json();

      // Handle Discord-specific features
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const userinfo = await userResponse.json();

      if (!userinfo.verified) {
        return { success: false, error: "Please verify your Discord email first." };
      }

      // Handle Discord-specific features like J4R and guild joining
      if (settings.api.client.j4r.enabled) {
        const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const guildsinfo = await guildsResponse.json();
        await handleJ4R(userinfo.id, guildsinfo, db);
      }

      if (settings.api.client.bot.joinguild.enabled) {
        await handleGuildJoin(userinfo.id, tokenData.access_token);
      }

      return {
        success: true,
        userinfo,
        email: userinfo.email,
      };
    }
  },

  github: {
    getLoginURL: (settings) => {
      return `https://github.com/login/oauth/authorize?client_id=${settings.api.client.oauth2.github.id
        }&redirect_uri=${encodeURIComponent(
          settings.api.client.oauth2.github.callback
        )}&scope=read:user,user:email`;
    },

    handleCallback: async (req, res) => {
      const code = req.query.code;
      if (!code) return { success: false };

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: settings.api.client.oauth2.github.id,
          client_secret: settings.api.client.oauth2.github.secret,
          code: code,
          redirect_uri: settings.api.client.oauth2.github.callback,
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        return { success: false, error: "Failed to obtain access token" };
      }

      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `token ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });

      const userinfo = await userResponse.json();

      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `token ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });

      const emails = await emailResponse.json();
      const primaryEmail = emails.find((email) => email.primary);

      return {
        success: true,
        userinfo: {
          ...userinfo,
          username: userinfo.login,
          id: userinfo.id.toString(),
        },
        email: primaryEmail.email,
      };
    }
  },

  google: {
    getLoginURL: () => {
      return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
      });
    },

    handleCallback: async (req, res) => {
      const code = req.query.code;
      if (!code) return { success: false };

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: "v2",
      });

      const userinfo = await oauth2.userinfo.get();
      return {
        success: true,
        userinfo: userinfo.data,
        email: userinfo.data.email,
      };
    }
  }
};

// Discord-specific helper functions
async function handleJ4R(userId, guildsinfo, db) {
  if (guildsinfo.message === "401: Unauthorized") return false;

  let userj4r = (await db.get(`j4rs-${userId}`)) ?? [];
  let coins = (await db.get(`coins-${userId}`)) ?? 0;
  const newsettings = JSON.parse(fs.readFileSync("./settings.json"));

  // Check for new J4R rewards
  for (const guild of newsettings.api.client.j4r.ads) {
    if (
      guildsinfo.find((g) => g.id === guild.id) &&
      !userj4r.find((g) => g.id === guild.id)
    ) {
      userj4r.push({
        id: guild.id,
        coins: guild.coins,
      });
      coins += guild.coins;
    }
  }

  // Check for left servers
  for (const j4r of userj4r) {
    if (!guildsinfo.find((g) => g.id === j4r.id)) {
      userj4r = userj4r.filter((g) => g.id !== j4r.id);
      coins -= j4r.coins;
    }
  }

  await db.set(`j4rs-${userId}`, userj4r);
  await db.set(`coins-${userId}`, coins);
  return true;
}

async function handleGuildJoin(userId, accessToken) {
  const newsettings = JSON.parse(fs.readFileSync("./settings.json"));
  if (typeof newsettings.api.client.bot.joinguild.guildid === "string") {
    await joinGuild(newsettings.api.client.bot.joinguild.guildid, userId, accessToken);
  } else if (Array.isArray(newsettings.api.client.bot.joinguild.guildid)) {
    for (let guild of newsettings.api.client.bot.joinguild.guildid) {
      await joinGuild(guild, userId, accessToken);
    }
  }
}

async function joinGuild(guildId, userId, accessToken) {
  await fetch(
    `https://discord.com/api/guilds/${guildId}/members/${userId}`,
    {
      method: "put",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${settings.api.client.bot.token}`,
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    }
  );
}

/* Manifest */
const Manifest = { "name": "Heliactyl OAuth2", "api_level": 6, "target_platform": "3.0.0" };

/*
 * ------------------------------------------------------------------------------------------------
 * Heliactyl module loader & compatibility check
 * ------------------------------------------------------------------------------------------------
*/
function isLegacyVersion(version) {
  /* check if version starts with 12, 14, 18, or 19 */
  const legacyPrefixes = ['12.', '14.', '18.', '19.'];
  return legacyPrefixes.some(prefix => version.startsWith(prefix));
}

if (isLegacyVersion(Manifest.target_platform)) {
  console.log(`Couldn't load module: "${Manifest.name}" is a Heliactyl Legacy module and cannot run on Heliactyl Next.`);
  process.exit();
} else if (Manifest.target_platform !== settings.version) {
  console.log(`Couldn't load module: "${Manifest.name}" does not support this version of Heliactyl Next. The module was built for v${Manifest.target_platform} but is trying to run on version v${settings.version}.`);
  process.exit();
}
/*
 * ------------------------------------------------------------------------------------------------
 * Module implementation
 * ------------------------------------------------------------------------------------------------
*/
module.exports.heliactylModule = Manifest; /* legacy support */
module.exports.load = async function (app, db) {
  cleanupSettings();

  // Setup routes for each provider
  for (const [provider, handler] of Object.entries(providerHandlers)) {
    app.get(`/${provider}/login`, async (req, res) => {
      if (req.query.redirect) req.session.redirect = "/" + req.query.redirect;

      const loginAttemptId = crypto.randomBytes(16).toString('hex');
      res.cookie('loginAttempt', loginAttemptId, { httpOnly: true, maxAge: 5 * 60 * 1000 });

      res.redirect(handler.getLoginURL(settings, req));
    });

    app.get(settings.api.client.oauth2[provider].callbackpath, async (req, res) => {
      try {
        const result = await handler.handleCallback(req, res, db);
        if (!result.success) {
          return res.redirect('/login');
        }

        // IP checks
        let ip = req.headers["cf-connecting-ip"] || req.connection.remoteAddress;
        ip = (ip ? ip : "::1").replace(/::1/g, "::ffff:127.0.0.1").replace(/^.*:/, "");

        if (settings.api.client.oauth2.ip.block.includes(ip)) {
          return res.send("Your IP has been blocked from signing in.");
        }

        // Whitelist check
        if (settings.whitelist.status && !settings.whitelist.users.includes(result.userinfo.id)) {
          return res.send("Service is under maintenance.");
        }

        // Create/verify Pterodactyl account
        // Create/verify Pterodactyl account
        const pterodactylResult = await createPterodactylUser(result.userinfo, result.email, db, req);
        if (!pterodactylResult.success) {
          return res.send(pterodactylResult.error);
        }

        // Cache account info
        const cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + result.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.pterodactyl.key}`,
            },
          }
        );

        if ((await cacheaccount.statusText) === "Not Found") {
          return res.send("An error occurred while fetching your user information.");
        }

        const cacheaccountinfo = JSON.parse(await cacheaccount.text());
        req.session.pterodactyl = cacheaccountinfo.attributes;
        req.session.userinfo = result.userinfo;

        // Handle role packages (Discord-specific)
        if (provider === 'discord' && settings.api.client.packages.rolePackages.roles) {
          await handleRolePackages(result.userinfo.id, db);
        }

        // Create notifications
        let notifications = await db.get('notifications-' + result.userinfo.id) || [];

        // Add auth notification
        notifications.push({
          "action": "user:auth",
          "name": "Sign in from new location",
          "timestamp": new Date().toISOString()
        });

        await db.set('notifications-' + result.userinfo.id, notifications);

        // Handle redirect
        const theme = indexjs.get(req);
        const customredirect = req.session.redirect;
        delete req.session.redirect;

        if (customredirect) {
          return res.redirect(customredirect);
        }
        return res.redirect(theme.settings.redirect.callback ? theme.settings.redirect.callback : "/");

      } catch (error) {
        console.error(`Error during ${provider} OAuth:`, error);
        return res.redirect('/login');
      }
    });
  }

  // Logout route (common for all providers)
  app.get("/logout", (req, res) => {
    let theme = indexjs.get(req);
    req.session.destroy(() => {
      return res.redirect(theme.settings.redirect.logout ? theme.settings.redirect.logout : "/");
    });
  });
};

// Helper function for Discord role packages
async function handleRolePackages(userId, db) {
  const settings = require('../settings.json');

  try {
    const member = await fetch(
      `https://discord.com/api/v9/guilds/${settings.api.client.packages.rolePackages.roleServer}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${settings.api.client.bot.token}`,
        },
      }
    );

    const memberinfo = await member.json();
    if (!memberinfo.user) return;

    const currentpackage = await db.get(`package-${userId}`);
    if (Object.values(settings.api.client.packages.rolePackages.roles).includes(currentpackage)) {
      for (const rolePackage of Object.keys(settings.api.client.packages.rolePackages.roles)) {
        if (settings.api.client.packages.rolePackages.roles[rolePackage] === currentpackage) {
          if (!memberinfo.roles.includes(rolePackage)) {
            await db.set(`package-${userId}`, settings.api.client.packages.default);
          }
        }
      }
    }

    for (const role of memberinfo.roles) {
      if (settings.api.client.packages.rolePackages.roles[role]) {
        await db.set(
          `package-${userId}`,
          settings.api.client.packages.rolePackages.roles[role]
        );
      }
    }
  } catch (error) {
    console.error('Error handling role packages:', error);
  }
}