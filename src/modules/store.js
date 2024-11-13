const indexjs = require("../handlers/helper.js");
const adminjs = require("./admin.js");
const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const fs = require("fs");
const ejs = require("ejs");

/* Manifest */
const Manifest = { "name": "Resources Store", "api_level": 6, "target_platform": "3.0.0" };

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
  app.get("/buy", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let newsettings = await enabledCheck(req, res);
    if (!newsettings) return;

    const { type, amount } = req.query;
    if (!type || !amount) return res.send("Missing type or amount");

    const validTypes = ["ram", "disk", "cpu", "servers"];
    if (!validTypes.includes(type)) return res.send("Invalid type");

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 10)
      return res.send("Amount must be a number between 1 and 10");

    const theme = indexjs.get(req);
    const failedCallbackPath =
      theme.settings.redirect[`failedpurchase${type}`] || "/";

    const userCoins = (await db.get(`coins-${req.session.userinfo.id}`)) || 0;
    const resourceCap =
      (await db.get(`${type}-${req.session.userinfo.id}`)) || 0;

    const { per, cost } = newsettings.store[type];
    const purchaseCost = cost * parsedAmount;

    if (userCoins < purchaseCost)
      return res.redirect(`${failedCallbackPath}?err=CANNOTAFFORD`);

    const newUserCoins = userCoins - purchaseCost;
    const newResourceCap = resourceCap + parsedAmount;
    const extraResource = per * parsedAmount;

    if (newUserCoins === 0) {
      await db.delete(`coins-${req.session.userinfo.id}`);
      await db.set(`${type}-${req.session.userinfo.id}`, newResourceCap);
    } else {
      await db.set(`coins-${req.session.userinfo.id}`, newUserCoins);
      await db.set(`${type}-${req.session.userinfo.id}`, newResourceCap);
    }

    let extra = (await db.get(`extra-${req.session.userinfo.id}`)) || {
      ram: 0,
      disk: 0,
      cpu: 0,
      servers: 0,
    };

    extra[type] += extraResource;

    if (Object.values(extra).every((v) => v === 0)) {
      await db.delete(`extra-${req.session.userinfo.id}`);
    } else {
      await db.set(`extra-${req.session.userinfo.id}`, extra);
    }

    adminjs.suspend(req.session.userinfo.id);

    res.redirect(
      (theme.settings.redirect[`purchase${type}`]
        ? theme.settings.redirect[`purchase${type}`]
        : "/") + "?err=none"
    );
  });

  async function enabledCheck(req, res) {
    const newsettings = JSON.parse(
      fs.readFileSync("./settings.json").toString()
    );
    if (newsettings.store.enabled) return newsettings;

    const theme = indexjs.get(req);
    ejs.renderFile(
      `./views/${theme.settings.notfound}`,
      await eval(indexjs.renderdataeval),
      null,
      function (err, str) {
        delete req.session.newaccount;
        if (err) {
          console.log(
            `App ― An error has occurred on path ${req._parsedUrl.pathname}:`
          );
          console.log(err);
          return res.send(
            "An error has occurred while attempting to load this page. Please contact an administrator to fix this."
          );
        }
        res.status(200);
        res.send(str);
      }
    );
    return null;
  }
};