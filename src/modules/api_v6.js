const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const indexjs = require("../handlers/helper.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const ejs = require("ejs");
const fetch = require("node-fetch");
const NodeCache = require("node-cache");
const Queue = require("../handlers/Queue.js");
const log = require("../handlers/log");
const arciotext = require("../handlers/afk");

const myCache = new NodeCache({ deleteOnExpire: true, stdTTL: 59 });

/* Manifest */
const Manifest = { "name": "Heliactyl API 6.0", "api_level": 6, "target_platform": "3.0.0" };

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
  app.get("/stats", async (req, res) => {
    try {
        const fetchStats = async (endpoint) => {
            const response = await fetch(`${settings.pterodactyl.domain}/api/application/${endpoint}?per_page=100000`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${settings.pterodactyl.key}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (endpoint == 'nodes') { console.log(JSON.stringify(data)) }
            return data.meta.pagination.total;
        };

        const [users, servers, nodes, locations] = await Promise.all([
        ]);

        res.json({ users: 8752, servers: 5557, nodes: 68, locations: 34 });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'An error occurred while fetching stats' });
    }
});

  app.get(`/api/dailystatus`, async (req, res) => {
    if (!req.session.userinfo.id) return res.redirect("/login");
  
    let lastClaim = new Date(await db.get("dailycoins1-" + req.session.userinfo.id));
  
    // Check if the user has already claimed coins today
    const today = new Date();
    if (lastClaim && lastClaim.toDateString() === today.toDateString()) {
      return res.json({ text: '0' });
    } else {
      // If the user has not claimed coins today, give them their coins and update the last claim date
      // (assuming you have a function to give the user coins)
      return res.json({ text: '1' });
    }
      })
  
  app.get('/daily-coins', async (req, res) => {
    // Check if user is logged in
    if (!req.session.userinfo.id) return res.redirect("/login");
    const userId = req.session.userinfo.id
    
    // Get the date of the user's last coin claim
    let lastClaim = new Date(await db.get("dailycoins1-" + req.session.userinfo.id));
    
    // Check if the user has already claimed coins today
    const today = new Date();
    if (lastClaim && lastClaim.toDateString() === today.toDateString()) {
      // If the user has already claimed coins today, redirect to /daily
      res.redirect('../dashboard?err=CLAIMED');
    } else {
      // If the user has not claimed coins today, give them their coins and update the last claim date
      // (assuming you have a function to give the user coins)
      const coins = await db.get("coins-" + req.session.userinfo.id) || 0;
      db.set("coins-" + req.session.userinfo.id, coins + 150)
  
      await db.set("dailycoins1-" + req.session.userinfo.id, today);
      res.redirect('../dashboard?err=none');
    }
  });
  
/**
 * GET /giftcoins
 * Gifts coins to another user.
 */
app.get("/giftcoins", async (req, res) => {
  if (!req.session.pterodactyl) {
    return res.redirect(`/`);
  }

  const { coins: coinsStr, id: recipientId } = req.query;
  const coins = parseInt(coinsStr);
  const senderId = req.session.userinfo.id;

  // Validate input
  if (!coins || !recipientId) {
    return res.redirect(`/transfer?err=MISSINGFIELDS`);
  }
  if (recipientId === senderId) {
    return res.redirect(`/transfer?err=CANNOTGIFTYOURSELF`);
  }
  if (coins < 1) {
    return res.redirect(`/transfer?err=TOOLOWCOINS`);
  }

  try {
    // Fetch user balances
    const [senderCoins, recipientCoins] = await Promise.all([
      db.get(`coins-${senderId}`),
      db.get(`coins-${recipientId}`)
    ]);

    // Validate balances
    if (recipientCoins === null) {
      return res.redirect(`/transfer?err=USERDOESNTEXIST`);
    }
    if (senderCoins < coins) {
      return res.redirect(`/transfer?err=CANTAFFORD`);
    }

    // Perform the transfer
    await Promise.all([
      db.set(`coins-${recipientId}`, recipientCoins + coins),
      db.set(`coins-${senderId}`, senderCoins - coins)
    ]);

    // Log the transaction
    log('Gifted Coins', `${req.session.userinfo.username} sent ${coins} coins to the user with the ID \`${recipientId}\`.`);

    return res.redirect(`/transfer?err=none`);
  } catch (error) {
    console.error('Error during coin transfer:', error);
    return res.redirect(`/transfer?err=INTERNALERROR`);
  }
});
  /**
   * GET /api
   * Returns the status of the API.
   */
  app.get("/api", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;
    res.send({
      status: true,
    });
  });

  /**
   * GET api/v6/userinfo
   * Returns the user information.
   */
  app.get("api/v6/userinfo", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;

    if (!req.query.id) return res.send({ status: "missing id" });

    if (!(await db.get("users-" + req.query.id)))
      return res.send({ status: "invalid id" });

    if (settings.api.client.oauth2.link.slice(-1) == "/")
      settings.api.client.oauth2.link =
        settings.api.client.oauth2.link.slice(0, -1);

    if (settings.api.client.oauth2.callbackpath.slice(0, 1) !== "/")
      settings.api.client.oauth2.callbackpath =
        "/" + settings.api.client.oauth2.callbackpath;

    if (settings.pterodactyl.domain.slice(-1) == "/")
      settings.pterodactyl.domain = settings.pterodactyl.domain.slice(
        0,
        -1
      );

    let packagename = await db.get("package-" + req.query.id);
    let userPackage =
      settings.api.client.packages.list[
        packagename ? packagename : settings.api.client.packages.default
      ];
    if (!userPackage)
      userPackage = {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0,
      };
    userPackage["name"] = packagename;

    let pterodactylid = await db.get("users-" + req.query.id);
    let userinforeq = await fetch(
      settings.pterodactyl.domain +
        "/api/application/users/" +
        pterodactylid +
        "?include=servers",
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
        },
      }
    );
    if ((await userinforeq.statusText) == "Not Found") {
      console.log(
        "App ― An error has occured while attempting to get a user's information"
      );
      console.log("- Discord ID: " + req.query.id);
      console.log("- Pterodactyl Panel ID: " + pterodactylid);
      return res.send({ status: "could not find user on panel" });
    }
    let userinfo = await userinforeq.json();

    res.send({
      status: "success",
      package: userPackage,
      extra: (await db.get("extra-" + req.query.id))
        ? await db.get("extra-" + req.query.id)
        : {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0,
          },
      userinfo: userinfo,
      coins:
        settings.coins.enabled == true
          ? (await db.get("coins-" + req.query.id))
            ? await db.get("coins-" + req.query.id)
            : 0
          : null,
    });
  });

  /**
   * POST api/v6/setcoins
   * Sets the number of coins for a user.
   */
  app.post("api/v6/setcoins", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;

    if (typeof req.body !== "object")
      return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body))
      return res.send({ status: "body cannot be an array" });
    let id = req.body.id;
    let coins = req.body.coins;
    if (typeof id !== "string")
      return res.send({ status: "id must be a string" });
    if (!(await db.get("users-" + id)))
      return res.send({ status: "invalid id" });
    if (typeof coins !== "number")
      return res.send({ status: "coins must be number" });
    if (coins < 0 || coins > 999999999999999)
      return res.send({ status: "too small or big coins" });
    if (coins == 0) {
      await db.delete("coins-" + id);
    } else {
      await db.set("coins-" + id, coins);
    }
    res.send({ status: "success" });
  });

  app.post("/api/v6/addcoins", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;

    if (typeof req.body !== "object")
      return res.send({ status: "body must be an object" });
    if (Array.isArray(req.body))
      return res.send({ status: "body cannot be an array" });
    let id = req.body.id;
    let coins = req.body.coins;
    if (typeof id !== "string")
      return res.send({ status: "id must be a string" });
    if (!(await db.get("users-" + id)))
      return res.send({ status: "invalid id" });
    if (typeof coins !== "number")
      return res.send({ status: "coins must be number" });
    if (coins < 1 || coins > 999999999999999)
      return res.send({ status: "too small or big coins" });
    if (coins == 0) {
      return res.send({ status: "cant do that mate" });
    } else {
      let current = await db.get("coins-" + id);
      await db.set("coins-" + id, current + coins);
    }
    res.send({ status: "success" });
  });

  /**
   * POST api/v6/setplan
   * Sets the plan for a user.
   */
  app.post("api/v6/setplan", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;

    if (!req.body) return res.send({ status: "missing body" });

    if (typeof req.body.id !== "string")
      return res.send({ status: "missing id" });

    if (!(await db.get("users-" + req.body.id)))
      return res.send({ status: "invalid id" });

    if (typeof req.body.package !== "string") {
      await db.delete("package-" + req.body.id);
      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    } else {
      if (!settings.api.client.packages.list[req.body.package])
        return res.send({ status: "invalid package" });
      await db.set("package-" + req.body.id, req.body.package);
      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    }
  });

  /**
   * POST api/v6/setresources
   * Sets the resources for a user.
   */
  app.post("api/v6/setresources", async (req, res) => {
    /* Check that the API key is valid */
    let authentication = await check(req, res);
    if (!authentication ) return;

    if (!req.body) return res.send({ status: "missing body" });

    if (typeof req.body.id !== "string")
      return res.send({ status: "missing id" });

    if (!(await db.get("users-" + req.body.id)))
      res.send({ status: "invalid id" });

    if (
      typeof req.body.ram == "number" ||
      typeof req.body.disk == "number" ||
      typeof req.body.cpu == "number" ||
      typeof req.body.servers == "number"
    ) {
      let ram = req.body.ram;
      let disk = req.body.disk;
      let cpu = req.body.cpu;
      let servers = req.body.servers;

      let currentextra = await db.get("extra-" + req.body.id);
      let extra;

      if (typeof currentextra == "object") {
        extra = currentextra;
      } else {
        extra = {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0,
        };
      }

      if (typeof ram == "number") {
        if (ram < 0 || ram > 999999999999999) {
          return res.send({ status: "ram size" });
        }
        extra.ram = ram;
      }

      if (typeof disk == "number") {
        if (disk < 0 || disk > 999999999999999) {
          return res.send({ status: "disk size" });
        }
        extra.disk = disk;
      }

      if (typeof cpu == "number") {
        if (cpu < 0 || cpu > 999999999999999) {
          return res.send({ status: "cpu size" });
        }
        extra.cpu = cpu;
      }

      if (typeof servers == "number") {
        if (servers < 0 || servers > 999999999999999) {
          return res.send({ status: "server size" });
        }
        extra.servers = servers;
      }

      if (
        extra.ram == 0 &&
        extra.disk == 0 &&
        extra.cpu == 0 &&
        extra.servers == 0
      ) {
        await db.delete("extra-" + req.body.id);
      } else {
        await db.set("extra-" + req.body.id, extra);
      }

      adminjs.suspend(req.body.id);
      return res.send({ status: "success" });
    } else {
      res.send({ status: "missing variables" });
    }
  });

  /**
   * Checks the authorization and returns the settings if authorized.
   * Renders the file based on the theme and sends the response.
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object|null} - The settings object if authorized, otherwise null.
   */
  async function check(req, res) {
    let settings = loadConfig("./config.toml");
    if (settings.api.client.api.enabled == true) {
      let auth = req.headers["authorization"];
      if (auth) {
        if (auth == "Bearer " + settings.api.client.api.code) {
          return settings;
        }
      }
    }
    let theme = indexjs.get(req);
    ejs.renderFile(
      `./views/${theme.settings.notfound}`,
      await eval(indexjs.renderdataeval),
      null,
      function (err, str) {
        delete req.session.newaccount;
        if (err) {
          console.log(
            `App ― An error has occured on path ${req._parsedUrl.pathname}:`
          );
          console.log(err);
          return res.send(
            "Internal Server Error"
          );
        }
        res.status(200);
        res.send(str);
      }
    );
    return null;
  }
};
