const settings = require("../settings.json");
const fs = require('fs');
const fetch = require('node-fetch');
const getPteroUser = require('../misc/getPteroUser.js')

module.exports.load = async function(app, db) {
  app.get("/panel", async (req, res) => {
    res.redirect(settings.pterodactyl.domain);
  });

  app.get("/updateinfo", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    const cacheaccount = await getPteroUser(req.session.userinfo.id, db)
      .catch(() => {
        return res.send("An error has occured while attempting to update your account information and server list.");
      })
    if (!cacheaccount) return
    req.session.pterodactyl = cacheaccount.attributes;
    if (req.query.redirect) if (typeof req.query.redirect == "string") return res.redirect("/" + req.query.redirect);
    res.redirect("/settings");
  });

  app.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    let newsettings = JSON.parse(fs.readFileSync("./settings.json"));

    if (newsettings.api.client.allow.regen !== true) return res.send("You cannot regenerate your password currently.");

    let newpassword = makeid(newsettings.api.client.passwordgenerator["length"]);
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
    res.redirect("/settings")
  });
};

function makeid(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let result = Array.from({ length }, () => characters.charAt(Math.floor(Math.random() * charactersLength))).join('');
  return result;
}