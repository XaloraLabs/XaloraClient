const loadConfig = require("../handlers/config");
const rateLimit = require("express-rate-limit");
const settings = loadConfig("./config.toml");
const fetch = require("node-fetch");
const indexjs = require("../handlers/helper.js");
const adminjs = require("./admin.js");
const fs = require("fs");
const getPteroUser = require("../handlers/getPteroUser.js");
const Queue = require("../handlers/Queue.js");
const log = require("../handlers/log.js");

if (settings.pterodactyl)
    if (settings.pterodactyl.domain) {
        if (settings.pterodactyl.domain.slice(-1) == "/")
            settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);
    }

/* Manifest */
const Manifest = { "name": "Pterodactyl Server Creation", "api_level": 6, "target_platform": "3.0.0" };

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
    // Helper function to get user-specific groups key
    const getUserGroupsKey = (userId) => `user-${userId}-server-groups`;

    // GET all groups for a user
    app.get("/api/groups", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        res.json(groups);
    });

    // CREATE a new group for a user
    app.post("/api/groups", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });
        if (!req.body.name) return res.status(400).json({ error: "Group name is required" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        const newGroupId = Date.now().toString();
        groups[newGroupId] = { name: req.body.name, servers: [] };

        await db.set(getUserGroupsKey(userId), groups);
        res.status(201).json({ id: newGroupId, ...groups[newGroupId] });
    });

    // GET a specific group for a user
    app.get("/api/groups/:groupId", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        const group = groups[req.params.groupId];

        if (!group) return res.status(404).json({ error: "Group not found" });

        res.json(group);
    });

    // UPDATE a group for a user
    app.put("/api/groups/:groupId", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        const group = groups[req.params.groupId];

        if (!group) return res.status(404).json({ error: "Group not found" });

        if (req.body.name) group.name = req.body.name;

        await db.set(getUserGroupsKey(userId), groups);
        res.json(group);
    });

    // DELETE a group for a user
    app.delete("/api/groups/:groupId", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};

        if (!groups[req.params.groupId]) return res.status(404).json({ error: "Group not found" });

        delete groups[req.params.groupId];
        await db.set(getUserGroupsKey(userId), groups);
        res.status(204).send();
    });

    // ADD a server to a group
    app.post("/api/groups/:groupId/servers", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });
        if (!req.body.serverId) return res.status(400).json({ error: "Server ID is required" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        const group = groups[req.params.groupId];

        if (!group) return res.status(404).json({ error: "Group not found" });

        if (!group.servers.includes(req.body.serverId)) {
            group.servers.push(req.body.serverId);
            await db.set(getUserGroupsKey(userId), groups);
        }

        res.json(group);
    });

    // REMOVE a server from a group
    app.delete("/api/groups/:groupId/servers/:serverId", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

        const userId = req.session.userinfo.id;
        const groups = await db.get(getUserGroupsKey(userId)) || {};
        const group = groups[req.params.groupId];

        if (!group) return res.status(404).json({ error: "Group not found" });

        group.servers = group.servers.filter(id => id !== req.params.serverId);
        await db.set(getUserGroupsKey(userId), groups);
        res.json(group);
    });
    app.set('trust proxy', 1);
    
const createServerLimiter = rateLimit({
    windowMs: 3 * 1000, // 3 seconds
    max: 1, // limit each IP to 1 request per windowMs
    message: "Too many server creation requests, please try again after 3 seconds.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => {
        // Use the left-most IP in the X-Forwarded-For header
        return req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    }
});

app.get("/updateinfo", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    
    try {
        const cacheaccount = await getPteroUser(req.session.userinfo.id, db);
        if (!cacheaccount) {
            return res.send("An error has occurred while attempting to update your account information and server list.");
        }

        // Get user's package and extra resources
        const packagename = await db.get("package-" + req.session.userinfo.id);
        const pkg = settings.api.client.packages.list[packagename ? packagename : settings.api.client.packages.default];
        const extra = await db.get("extra-" + req.session.userinfo.id) || {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };

        // Calculate total allowed resources
        const totalAllowedRam = pkg.ram + extra.ram;
        const totalAllowedDisk = pkg.disk + extra.disk;
        const totalAllowedCpu = pkg.cpu + extra.cpu;

        // Calculate current resource usage
        let totalUsedRam = 0;
        let totalUsedDisk = 0;
        let totalUsedCpu = 0;
        const servers = cacheaccount.attributes.relationships.servers.data;

        for (const server of servers) {
            totalUsedRam += server.attributes.limits.memory;
            totalUsedDisk += server.attributes.limits.disk;
            totalUsedCpu += server.attributes.limits.cpu;
        }

        // Check if resources are exceeded
        if (totalUsedRam > totalAllowedRam || totalUsedDisk > totalAllowedDisk || totalUsedCpu > totalAllowedCpu) {
            console.log(`User ${req.session.userinfo.id} exceeding resources. Adjusting servers...`);

            // Adjust each server's resources
            for (const server of servers) {
                const serverId = server.attributes.id;
                
                await fetch(
                    `${settings.pterodactyl.domain}/api/application/servers/${serverId}/build`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${settings.pterodactyl.key}`,
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({
                            allocation: server.attributes.allocation,
                            memory: 1024,
                            swap: server.attributes.limits.swap,
                            disk: 5120,
                            io: server.attributes.limits.io,
                            cpu: 50,
                            feature_limits: server.attributes.feature_limits
                        })
                    }
                );

                log(
                    "resource adjustment",
                    `Adjusted resources for server ${serverId} belonging to user ${req.session.userinfo.id} to standard limits (RAM: 1024MB, Disk: 5120MB, CPU: 50%)`
                );
            }

            // Refresh user's session with updated server information
            const updatedAccount = await getPteroUser(req.session.userinfo.id, db);
            if (updatedAccount) {
                req.session.pterodactyl = updatedAccount.attributes;
            }
        } else {
            req.session.pterodactyl = cacheaccount.attributes;
        }

        if (req.query.redirect && typeof req.query.redirect === "string") {
            return res.redirect("/" + req.query.redirect);
        }
        
        res.redirect("/dashboard");
    } catch (error) {
        console.error("Error in updateinfo:", error);
        res.send("An error occurred while updating account information.");
    }
});

app.get("/create", createServerLimiter, async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let theme = indexjs.get(req);

    if (settings.api.client.allow.server.create == true) {
        let redirectlink = theme.settings.redirect.failedcreateserver ?? "/";

        const cacheaccount = await getPteroUser(req.session.userinfo.id, db).catch(() => {
            return res.send("An error has occurred while attempting to update your account information and server list.");
        });
        if (!cacheaccount) {
            return res.send("Heliactyl failed to find an account on the configured panel, try relogging");
        }
        req.session.pterodactyl = cacheaccount.attributes;

        if (req.query.name && req.query.ram && req.query.disk && req.query.cpu && req.query.egg && req.query.location) {
            try {
                decodeURIComponent(req.query.name);
            } catch (err) {
                return res.redirect(`${redirectlink}?err=COULDNOTDECODENAME`);
            }

            let packagename = await db.get("package-" + req.session.userinfo.id);
            let pkg = settings.api.client.packages.list[packagename ? packagename : settings.api.client.packages.default];

            let extra = (await db.get("extra-" + req.session.userinfo.id)) || {
                ram: 0,
                disk: 0,
                cpu: 0,
                servers: 0,
            };

            // Calculate resources used by active servers
            let ram2 = 0;
            let disk2 = 0;
            let cpu2 = 0;
            let servers2 = req.session.pterodactyl.relationships.servers.data.length;
            for (let i = 0, len = req.session.pterodactyl.relationships.servers.data.length; i < len; i++) {
                ram2 += req.session.pterodactyl.relationships.servers.data[i].attributes.limits.memory;
                disk2 += req.session.pterodactyl.relationships.servers.data[i].attributes.limits.disk;
                cpu2 += req.session.pterodactyl.relationships.servers.data[i].attributes.limits.cpu;
            }

            if (servers2 >= pkg.servers + extra.servers) {
                return res.redirect(`${redirectlink}?err=TOOMUCHSERVERS`);
            }

            let name = decodeURIComponent(req.query.name);
            if (name.length < 1) {
                return res.redirect(`${redirectlink}?err=LITTLESERVERNAME`);
            }
            if (name.length > 191) {
                return res.redirect(`${redirectlink}?err=BIGSERVERNAME`);
            }

            let location = req.query.location;

            if (Object.entries(settings.api.client.locations).filter((vname) => vname[0] == location).length !== 1) {
                return res.redirect(`${redirectlink}?err=INVALIDLOCATION`);
            }

            let requiredpackage = Object.entries(settings.api.client.locations).filter((vname) => vname[0] == location)[0][1].package;
            if (requiredpackage)
                if (!requiredpackage.includes(packagename ? packagename : settings.api.client.packages.default)) {
                    return res.redirect(`../upgrade`);
                }

            let egg = req.query.egg;

            let egginfo = settings.api.client.eggs[egg];
            if (!settings.api.client.eggs[egg]) {
                return res.redirect(`${redirectlink}?err=INVALIDEGG`);
            }
            let ram = parseFloat(req.query.ram);
            let disk = parseFloat(req.query.disk);
            let cpu = parseFloat(req.query.cpu);
            if (!isNaN(ram) && !isNaN(disk) && !isNaN(cpu)) {
                if (ram2 + ram > pkg.ram + extra.ram) {
                    return res.redirect(`${redirectlink}?err=EXCEEDRAM&num=${pkg.ram + extra.ram - ram2}`);
                }
                if (disk2 + disk > pkg.disk + extra.disk) {
                    return res.redirect(`${redirectlink}?err=EXCEEDDISK&num=${pkg.disk + extra.disk - disk2}`);
                }
                if (cpu2 + cpu > pkg.cpu + extra.cpu) {
                    return res.redirect(`${redirectlink}?err=EXCEEDCPU&num=${pkg.cpu + extra.cpu - cpu2}`);
                }
                if (egginfo.minimum.ram)
                    if (ram < egginfo.minimum.ram) {
                        return res.redirect(`${redirectlink}?err=TOOLITTLERAM&num=${egginfo.minimum.ram}`);
                    }
                if (egginfo.minimum.disk)
                    if (disk < egginfo.minimum.disk) {
                        return res.redirect(`${redirectlink}?err=TOOLITTLEDISK&num=${egginfo.minimum.disk}`);
                    }
                if (egginfo.minimum.cpu)
                    if (cpu < egginfo.minimum.cpu) {
                        return res.redirect(`${redirectlink}?err=TOOLITTLECPU&num=${egginfo.minimum.cpu}`);
                    }
                if (egginfo.maximum) {
                    if (egginfo.maximum.ram)
                        if (ram > egginfo.maximum.ram) {
                            return res.redirect(`${redirectlink}?err=TOOMUCHRAM&num=${egginfo.maximum.ram}`);
                        }
                    if (egginfo.maximum.disk)
                        if (disk > egginfo.maximum.disk) {
                            return res.redirect(`${redirectlink}?err=TOOMUCHDISK&num=${egginfo.maximum.disk}`);
                        }
                    if (egginfo.maximum.cpu)
                        if (cpu > egginfo.maximum.cpu) {
                            return res.redirect(`${redirectlink}?err=TOOMUCHCPU&num=${egginfo.maximum.cpu}`);
                        }
                }

                let specs = egginfo.info;
                specs["user"] = await db.get("users-" + req.session.userinfo.id);
                if (!specs["limits"])
                    specs["limits"] = {
                        swap: 0,
                        io: 500,
                        backups: 0,
                    };
                specs.name = name;
                specs.limits.swap = -1;
                specs.limits.memory = ram;
                specs.limits.disk = disk;
                specs.limits.cpu = cpu;
                specs.feature_limits.allocations = 10;
                if (!specs["deploy"])
                    specs.deploy = {
                        locations: [],
                        dedicated_ip: false,
                        port_range: [],
                    };
                specs.deploy.locations = [location];

    let serverinfo = await fetch(
        settings.pterodactyl.domain + "/api/application/servers", {
            method: "post",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${settings.pterodactyl.key}`,
                Accept: "application/json",
            },
            body: JSON.stringify(await specs),
        }
    );
    if (!serverinfo.ok) {
        const errorData = await serverinfo.json();
        console.error("Pterodactyl API Error:", errorData);
        
        // Log the error
        log(
            "server creation error",
            `Failed to create server for ${req.session.userinfo.username}. Pterodactyl API Error: ${JSON.stringify(errorData)}`
        );

        // Encode the error response for the URL
        const encodedError = encodeURIComponent(JSON.stringify(errorData));
        
        return res.redirect(`/dashboard?err=PTERODACTYL&data=${encodedError}`);
    }
                let serverinfotext = await serverinfo.json();
                let newpterodactylinfo = req.session.pterodactyl;
                newpterodactylinfo.relationships.servers.data.push(serverinfotext);
                req.session.pterodactyl = newpterodactylinfo;

                log(
                    "created server",
                    `${req.session.userinfo.username} created a new server named \`${name}\` with the following specs:\n\`\`\`Memory: ${ram} MB\nCPU: ${cpu}%\nDisk: ${disk}\`\`\``
                );
                console.log(`user ${req.session.userinfo.username} created a server called ${name}`)
                return res.redirect("/dashboard?err=CREATED");
            } else {
                res.redirect(`${redirectlink}?err=NOTANUMBER`);
            }
        } else {
            res.redirect(`${redirectlink}?err=MISSINGVARIABLE`);
        }
    } else {
        res.redirect(
            theme.settings.redirect.createserverdisabled ?
            theme.settings.redirect.createserverdisabled :
            "/"
        );
    }
});

async function processQueue() {
  console.log('Processing queue...');
  let queuedServers = await db.get("queuedServers") || [];
  if (queuedServers.length === 0) return;

  let serverToCreate = queuedServers[0];

  console.log(`Next server in queue: ${serverToCreate.name}`);

  // Re-fetch the egg information
  let egginfo = settings.api.client.eggs[serverToCreate.egg];
  if (!egginfo) {
    console.log(`Error: Invalid egg ${serverToCreate.egg} for server ${serverToCreate.name}`);
    await removeFromQueue(serverToCreate);
    return;
  }

  // Update specs with the latest egg info
  let specs = {
    ...egginfo.info,
    user: serverToCreate.user,
    name: serverToCreate.name,
    limits: {
      swap: -1,
      io: 500,
      backups: 0,
      memory: serverToCreate.limits.memory,
      disk: serverToCreate.limits.disk,
      cpu: serverToCreate.limits.cpu
    },
    deploy: serverToCreate.deploy || {
      locations: [],
      dedicated_ip: false,
      port_range: [],
    }
  };

  console.log('Attempting to create server...');
  try {
    let serverinfo = await fetch(
      `${settings.pterodactyl.domain}/api/application/servers`,
      {
        method: "post",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
          Accept: "application/json",
        },
        body: JSON.stringify(specs),
      }
    );
    console.log(`Pterodactyl API response status: ${serverinfo.status} ${serverinfo.statusText}`);

    if (serverinfo.ok) {
      console.log('Server created successfully');
      await removeFromQueue(serverToCreate);

      log(
        "server created from queue",
        `Server \`${serverToCreate.name}\` for user ID ${serverToCreate.userId} has been successfully created from the queue.`
      );
    } else {
      console.log('Server creation failed');
      console.log('Response body:', await serverinfo.text());
      
      // Remove the server from the queue if Pterodactyl sent an error
      await removeFromQueue(serverToCreate);
      
      log(
        "server creation failed",
        `Failed to create server \`${serverToCreate.name}\` for user ID ${serverToCreate.userId} from the queue. Server removed from queue due to Pterodactyl error.`
      );
    }
  } catch (error) {
    console.error('Error during server creation:', error);
    // Remove the server from the queue if an error occurred
    await removeFromQueue(serverToCreate);
    
    log(
      "server creation error",
      `Error occurred while creating server \`${serverToCreate.name}\` for user ID ${serverToCreate.userId} from the queue. Server removed from queue.`
    );
  }

  // Update queue positions for remaining servers
  queuedServers = await db.get("queuedServers") || [];
  queuedServers.forEach((server, index) => {
    server.queuePosition = index + 1;
  });
  await db.set("queuedServers", queuedServers);
}

async function removeFromQueue(server) {
  let queuedServers = await db.get("queuedServers") || [];
  queuedServers = queuedServers.filter(s => s.name !== server.name);
  await db.set("queuedServers", queuedServers);

  let userQueuedServers = await db.get(`${server.userId}-queued`) || [];
  userQueuedServers = userQueuedServers.filter(s => s.name !== server.name);
  await db.set(`${server.userId}-queued`, userQueuedServers);
}

// Set up interval to process queue every 5 minutes
setInterval(processQueue, 5 * 60 * 1000);

// Route to manually process the queue
app.get("/process-queue", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect("/login");

  await processQueue();
  res.json({ status: 200, msg: 'Queue processed successfully' });
});

// Route to remove a server from the queue
app.get("/queue-remove/:id", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect("/login");

  let serverPos = parseInt(req.params.id);
  let userId = req.session.userinfo.id;

  let queuedServers = await db.get("queuedServers") || [];
  
  // Find the server to remove
  let serverToRemove = queuedServers.find(server => server.queuePosition === serverPos && server.userId === userId);
  
  if (serverToRemove) {
      // Remove the server from the main queue
      queuedServers = queuedServers.filter(server => server !== serverToRemove);
      
      // Update positions for remaining servers
      queuedServers.forEach((server, index) => {
          server.queuePosition = index + 1;
      });
      
      await db.set("queuedServers", queuedServers);

      // Remove the server from the user's queue
      let userQueuedServers = await db.get(`${userId}-queued`) || [];
      userQueuedServers = userQueuedServers.filter(server => server.queuePosition !== serverPos);
      await db.set(`${userId}-queued`, userQueuedServers);

      log(
          "removed server from queue",
          `User ${userId} removed server "${serverToRemove.name}" from queue position ${serverPos}`
      );

      res.redirect('/dashboard')
  } else {
      res.status(404).json({ status: 404, msg: 'Open a ticket if you see this message.' });
  }
});

// Route to clear the entire queue
app.get("/clear-queue", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect("/login");

  try {
      let queuedServers = await db.get("queuedServers") || [];

      log(
          "cleared server queue",
          `Admin ${req.session.userinfo.username} cleared the server queue. ${queuedServers.length} servers were removed from the queue.`
      );

      await db.set("queuedServers", []);

      for (let server of queuedServers) {
          let userQueuedServers = await db.get(`${server.userId}-queued`) || [];
          userQueuedServers = userQueuedServers.filter(s => s.name !== server.name);
          await db.set(`${server.userId}-queued`, userQueuedServers);
      }

      res.json({ status: 200, message: 'Queue cleared successfully' });
  } catch (error) {
      console.error('Error clearing queue:', error);
      res.status(500).json({ status: 500, error: 'An error occurred while clearing the queue' });
  }
});

    app.get("/modify", async (req, res) => {
        if (!req.session.pterodactyl) return res.redirect("/login");
    
        let theme = indexjs.get(req);
    
        let newsettings = loadConfig('./config.toml')
        if (newsettings.api.client.allow.server.modify == true) {
          if (!req.query.id) return res.send("Missing server id.");
    
          const cacheaccount = await getPteroUser(
            req.session.userinfo.id,
            db
          ).catch(() => {
            return res.send(
              "An error has occured while attempting to update your account information and server list."
            );
          });
          if (!cacheaccount) return;
          req.session.pterodactyl = cacheaccount.attributes;
    
          let redirectlink = theme.settings.redirect.failedmodifyserver
            ? theme.settings.redirect.failedmodifyserver
            : "/"; // fail redirect link
    
          let checkexist =
            req.session.pterodactyl.relationships.servers.data.filter(
              (name) => name.attributes.id == req.query.id
            );
          if (checkexist.length !== 1) return res.send("Invalid server id.");
    
          let ram = req.query.ram
            ? isNaN(parseFloat(req.query.ram))
              ? undefined
              : parseFloat(req.query.ram)
            : undefined;
          let disk = req.query.disk
            ? isNaN(parseFloat(req.query.disk))
              ? undefined
              : parseFloat(req.query.disk)
            : undefined;
          let cpu = req.query.cpu
            ? isNaN(parseFloat(req.query.cpu))
              ? undefined
              : parseFloat(req.query.cpu)
            : undefined;
    
          if (ram || disk || cpu) {
            let newsettings = loadConfig('./config.toml')
    
            let packagename = await db.get("package-" + req.session.userinfo.id);
            let pkg =
              newsettings.api.client.packages.list[
                packagename ? packagename : newsettings.api.client.packages.default
              ];
    
            let pterorelationshipsserverdata =
              req.session.pterodactyl.relationships.servers.data.filter(
                (name) => name.attributes.id.toString() !== req.query.id
              );
    
            let ram2 = 0;
            let disk2 = 0;
            let cpu2 = 0;
            for (
              let i = 0, len = pterorelationshipsserverdata.length;
              i < len;
              i++
            ) {
              ram2 =
                ram2 + pterorelationshipsserverdata[i].attributes.limits.memory;
              disk2 =
                disk2 + pterorelationshipsserverdata[i].attributes.limits.disk;
              cpu2 = cpu2 + pterorelationshipsserverdata[i].attributes.limits.cpu;
            }
            let attemptegg = null;
            //let attemptname = null;
    
            for (let [name, value] of Object.entries(newsettings.api.client.eggs)) {
              if (value.info.egg == checkexist[0].attributes.egg) {
                attemptegg = newsettings.api.client.eggs[name];
                //attemptname = name;
              }
            }
            let egginfo = attemptegg ? attemptegg : null;
    
            if (!egginfo)
              return res.redirect(
                `${redirectlink}?id=${req.query.id}&err=MISSINGEGG`
              );
    
            let extra = (await db.get("extra-" + req.session.userinfo.id))
              ? await db.get("extra-" + req.session.userinfo.id)
              : {
                  ram: 0,
                  disk: 0,
                  cpu: 0,
                  servers: 0,
                };

            if (pkg.ram + extra.ram - ram2 + ram > 0) {
    
            if (ram2 + ram > pkg.ram + extra.ram)
              return res.redirect(
                `${redirectlink}?id=${req.query.id}&err=EXCEEDRAM&num=${
                  pkg.ram + extra.ram - ram2
                }`
              );
            if (disk2 + disk > pkg.disk + extra.disk)
              return res.redirect(
                `${redirectlink}?id=${req.query.id}&err=EXCEEDDISK&num=${
                  pkg.disk + extra.disk - disk2
                }`
              );
            if (cpu2 + cpu > pkg.cpu + extra.cpu)
              return res.redirect(
                `${redirectlink}?id=${req.query.id}&err=EXCEEDCPU&num=${
                  pkg.cpu + extra.cpu - cpu2
                }`
              );
            if (egginfo.minimum.ram)
              if (ram < egginfo.minimum.ram)
                return res.redirect(
                  `${redirectlink}?id=${req.query.id}&err=TOOLITTLERAM&num=${egginfo.minimum.ram}`
                );
            if (egginfo.minimum.disk)
              if (disk < egginfo.minimum.disk)
                return res.redirect(
                  `${redirectlink}?id=${req.query.id}&err=TOOLITTLEDISK&num=${egginfo.minimum.disk}`
                );
            if (egginfo.minimum.cpu)
              if (cpu < egginfo.minimum.cpu)
                return res.redirect(
                  `${redirectlink}?id=${req.query.id}&err=TOOLITTLECPU&num=${egginfo.minimum.cpu}`
                );
            if (egginfo.maximum) {
              if (egginfo.maximum.ram)
                if (ram > egginfo.maximum.ram)
                  return res.redirect(
                    `${redirectlink}?id=${req.query.id}&err=TOOMUCHRAM&num=${egginfo.maximum.ram}`
                  );
              if (egginfo.maximum.disk)
                if (disk > egginfo.maximum.disk)
                  return res.redirect(
                    `${redirectlink}?id=${req.query.id}&err=TOOMUCHDISK&num=${egginfo.maximum.disk}`
                  );
              if (egginfo.maximum.cpu)
                if (cpu > egginfo.maximum.cpu)
                  return res.redirect(
                    `${redirectlink}?id=${req.query.id}&err=TOOMUCHCPU&num=${egginfo.maximum.cpu}`
                  );
            }
            } else {
                if (ram2 + ram > 4096 || cpu2 + cpu > 100) return res.send('Max is 4096MB RAM, 100% CPU when your servers are in the negative')
            }
    
            let limits = {
              memory: ram ? ram : checkexist[0].attributes.limits.memory,
              disk: disk ? disk : checkexist[0].attributes.limits.disk,
              cpu: cpu ? cpu : checkexist[0].attributes.limits.cpu,
              swap: egginfo ? checkexist[0].attributes.limits.swap : 0,
              io: egginfo ? checkexist[0].attributes.limits.io : 500,
            };
    
            let serverinfo = await fetch(
              settings.pterodactyl.domain +
                "/api/application/servers/" +
                req.query.id +
                "/build",
              {
                method: "patch",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${settings.pterodactyl.key}`,
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  limits: limits,
                  feature_limits: checkexist[0].attributes.feature_limits,
                  allocation: checkexist[0].attributes.allocation,
                }),
              }
            );
            if ((await serverinfo.statusText) !== "OK")
              return res.redirect(
                `${redirectlink}?id=${req.query.id}&err=ERRORONMODIFY`
              );
            let text = JSON.parse(await serverinfo.text());
            log(
              `modify server`,
              `${req.session.userinfo.username}#${req.session.userinfo.discriminator} modified the server called \`${text.attributes.name}\` to have the following specs:\n\`\`\`Memory: ${ram} MB\nCPU: ${cpu}%\nDisk: ${disk}\`\`\``
            );
            pterorelationshipsserverdata.push(text);
            req.session.pterodactyl.relationships.servers.data =
              pterorelationshipsserverdata;
            let theme = indexjs.get(req);
            adminjs.suspend(req.session.userinfo.id);
            res.redirect("/dashboard?err=MODIFIED");
          } else {
            res.redirect(`${redirectlink}?id=${req.query.id}&err=MISSINGVARIABLE`);
          }
        } else {
          res.redirect(
            theme.settings.redirect.modifyserverdisabled
              ? theme.settings.redirect.modifyserverdisabled
              : "/"
          );
        }
      });
    
app.get("/delete", async (req, res) => {
  if (!req.session.pterodactyl) return res.redirect("/login");

  if (!req.query.id) return res.send("Missing id.");

  let theme = indexjs.get(req);

  let newsettings = loadConfig('./config.toml')
  if (newsettings.api.client.allow.server.delete == true) {
    if (
      req.session.pterodactyl.relationships.servers.data.filter(
        (server) => server.attributes.id == req.query.id
      ).length == 0
    )
      return res.send("Could not find server with that ID.");

    // Check if the server is suspended
    let serverInfo = await fetch(
      `${settings.pterodactyl.domain}/api/application/servers/${req.query.id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
        },
      }
    );

    let serverData = await serverInfo.json();

    if (serverData.attributes.suspended) {
      return res.redirect("/dashboard?err=SUSPENDED")
    }

    let deletionresults = await fetch(
      settings.pterodactyl.domain +
        "/api/application/servers/" +
        req.query.id,
      {
        method: "delete",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.pterodactyl.key}`,
        },
      }
    );
    let ok = await deletionresults.ok;
    if (ok !== true)
      return res.send(
        "An error has occurred while attempting to delete the server."
      );
    let pterodactylinfo = req.session.pterodactyl;
    pterodactylinfo.relationships.servers.data =
      pterodactylinfo.relationships.servers.data.filter(
        (server) => server.attributes.id.toString() !== req.query.id
      );
    req.session.pterodactyl = pterodactylinfo;

    adminjs.suspend(req.session.userinfo.id);

    return res.redirect("/dashboard?err=DELETED");
  } else {
    res.redirect(
      theme.settings.redirect.deleteserverdisabled
        ? theme.settings.redirect.deleteserverdisabled
        : "/"
    );
  }
});
};