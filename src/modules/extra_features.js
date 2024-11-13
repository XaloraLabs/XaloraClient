const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const fs = require("fs");
const indexjs = require("../handlers/helper.js");
const fetch = require("node-fetch");
const Queue = require("../handlers/Queue.js");

/* Manifest */
const Manifest = { "name": "Extra Features", "api_level": 6, "target_platform": "3.0.0" };

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
module.exports.load = async function(app, db) {
  app.get(`/api/password`, async (req, res) => {
    if (!req.session.userinfo.id) return res.redirect("/login");

    let checkPassword = await db.get("password-" + req.session.userinfo.id);

    if (checkPassword) {
      return res.json({ password: checkPassword });
    } else {
      let newpassword = makeid(settings.api.client.passwordgenerator["length"]);

      await fetch(
        settings.pterodactyl.domain + "/api/application/users/" + req.session.pterodactyl.id,
        {
          method: "patch",
          headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          },
          body: JSON.stringify({
            username: req.session.pterodactyl.username,
            email: req.session.pterodactyl.email,
            first_name: req.session.pterodactyl.first_name,
            last_name: req.session.pterodactyl.last_name,
            password: newpassword
          })
        }
      );

      await db.set("password-" + req.session.userinfo.id, newpassword)
      return res.json({ password: newpassword });
    }
  });

  app.get("/panel", async (req, res) => {
    res.redirect(settings.pterodactyl.domain);
  });

  app.get("/notifications", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let notifications = await db.get('notifications-' + req.session.userinfo.id) || [];

    res.json(notifications)
  });

  app.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    if (settings.api.client.allow.regen !== true) return res.send("You cannot regenerate your password currently.");

    let newpassword = makeid(settings.api.client.passwordgenerator["length"]);
    req.session.password = newpassword;

    await fetch(
      settings.pterodactyl.domain + "/api/application/users/" + req.session.pterodactyl.id,
      {
        method: "patch",
        headers: {
          'Content-Type': 'application/json',
          "Authorization": `Bearer ${settings.pterodactyl.key}`
        },
        body: JSON.stringify({
          username: req.session.pterodactyl.username,
          email: req.session.pterodactyl.email,
          first_name: req.session.pterodactyl.first_name,
          last_name: req.session.pterodactyl.last_name,
          password: newpassword
        })
      }
    );

    let theme = indexjs.get(req);
    await db.set("password-" + req.session.userinfo.id, newpassword)
    res.redirect("/account")
  });
};

function makeid(length) {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}