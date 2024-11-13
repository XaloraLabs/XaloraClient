const express = require("express");
const PterodactylClientModule = require("../handlers/client.js");
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const WebSocket = require("ws");
const axios = require("axios");
const FormData = require("form-data");

/* Manifest */
const Manifest = { "name": "Pterodactyl Server Management", "api_level": 6, "target_platform": "3.0.0" };

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

  /*
   * ------------------------------------------------------------------------------------------------
   * Utility Functions
   * ------------------------------------------------------------------------------------------------
   */

  async function logActivity(db, serverId, action, details) {
    const timestamp = new Date().toISOString();
    const activityLog = await db.get(`activity_log_${serverId}`) || [];

    activityLog.unshift({ timestamp, action, details });

    // Keep only the last 100 activities
    if (activityLog.length > 100) {
      activityLog.pop();
    }

    await db.set(`activity_log_${serverId}`, activityLog);
  }

  const PANEL_URL = settings.pterodactyl.domain;
  const API_KEY = settings.pterodactyl.key;

  const ADMIN_COOKIES =
    ""; // Transfer is pending reimplementation. Current solution is poor.
  const CSRF_TOKEN = "";

  async function apiRequest(endpoint, method = "GET", body = null) {
    const response = await fetch(`${PANEL_URL}/api/application${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "Application/vnd.pterodactyl.v1+json",
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${await response.text()}`);
    }

    return response.json();
  }

  async function getAvailableAllocations(nodeId) {
    const response = await apiRequest(
      `/nodes/${nodeId}/allocations?per_page=10000`
    );
    return response.data.filter(
      (allocation) => !allocation.attributes.assigned
    );
  }

  async function transferServer(serverId, allocationId, targetNodeId) {
    return fetch(
      `${PANEL_URL}/admin/servers/view/${serverId}/manage/transfer`,
      {
        method: "POST",
        headers: {
          Cookie: ADMIN_COOKIES,
          "X-CSRF-TOKEN": CSRF_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `node_id=${targetNodeId}&allocation_id=${allocationId}`,
      }
    )
      .then((response) => {
        if (response.ok) {
          console.log(`Transfer job added to queue for server ${serverId}`);
        } else {
          console.error(
            `Failed to transfer server ${serverId}: ${response.statusText}`
          );
        }
      })
      .catch((error) => {
        console.error(`Error transferring server ${serverId}:`, error.message);
      });
  }

  async function getServerDetails(serverId) {
    const response = await apiRequest(`/servers/${serverId}`);
    return response.data;
  }

  /*
   * ------------------------------------------------------------------------------------------------
   * Middleware
   * ------------------------------------------------------------------------------------------------
   */

  // Middleware to check if user is authenticated
  const isAuthenticated = (req, res, next) => {
    if (req.session.pterodactyl) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // Middleware to check server ownership or subuser status
  const ownsServer = async (req, res, next) => {
    const serverId = req.params.id || req.params.serverId || req.params.instanceId;
    const userId = req.session.pterodactyl.username;
    console.log(`Checking server access for user ${userId} and server ${serverId}`);

    const userServers = req.session.pterodactyl.relationships.servers.data;
    const serverOwned = userServers.some(server => server.attributes.identifier === serverId);

    if (serverOwned) {
      console.log(`User ${userId} owns server ${serverId}`);
      return next();
    }

    // Check if the user is a subuser of the server
    try {
      const subuserServers = await db.get(`subuser-servers-${userId}`) || [];
      const hasAccess = subuserServers.some(server => server.id === serverId);
      if (hasAccess) {
        console.log(`User ${userId} is a subuser of server ${serverId}`);
        return next();
      }
    } catch (error) {
      console.error('Error checking subuser status:', error);
    }

    console.log(`User ${userId} does not have access to server ${serverId}`);
    res.status(403).json({ error: 'Forbidden.' });
  };

  /*
   * ------------------------------------------------------------------------------------------------
   * Team Management Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  const router = express.Router();
  const pterodactylClient = new PterodactylClientModule(
    settings.pterodactyl.domain,
    settings.pterodactyl.client_key
  );

  // Add a list function to get all keys with a specific prefix
  async function listKeys(prefix) {
    return new Promise((resolve, reject) => {
      const keys = [];
      db.db.each(
        "SELECT [key] FROM keyv WHERE [key] LIKE ?",
        [`${db.namespace}:${prefix}%`],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            keys.push(row.key.replace(`${db.namespace}:`, ''));
          }
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(keys);
          }
        }
      );
    });
  }

  /*
   * ------------------------------------------------------------------------------------------------
   * Spigot API Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // Spigot API base URL
  const SPIGOT_API_BASE = "https://api.spiget.org/v2";

  // Endpoint to list plugins (first 100)
  router.get("/plugins/list", async (req, res) => {
    try {
      const response = await axios.get(`${SPIGOT_API_BASE}/resources`, {
        params: {
          size: 100,
          sort: "-downloads", // Sorting by downloads (most popular)
        },
      });
      res.json(response.data);
    } catch (error) {
      console.error("Error fetching plugin list:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Search endpoint
  router.get("/plugins/search", async (req, res) => {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    try {
      const response = await axios.get(
        `${SPIGOT_API_BASE}/search/resources/${query}`,
        {
          params: {
            size: 100,
            sort: "-downloads", // Sorting by downloads (most popular)
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error searching plugins:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /*
   * ------------------------------------------------------------------------------------------------
   * Backup Management Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET /api/server/:id/backups
  router.get(
    "/server/:id/backups",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const response = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/backups`,
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.json(response.data);
      } catch (error) {
        console.error("Error fetching backups:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/backups
  router.post(
    "/server/:id/backups",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const response = await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/backups`,
          {},
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(201).json(response.data);
      } catch (error) {
        console.error("Error creating backup:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // GET /api/server/:id/backups/:backupId/download
  router.get(
    "/server/:id/backups/:backupId/download",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const backupId = req.params.backupId;
        const response = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/backups/${backupId}/download`,
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.json(response.data);
      } catch (error) {
        console.error("Error generating backup download link:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // DELETE /api/server/:id/backups/:backupId
  router.delete(
    "/server/:id/backups/:backupId",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const backupId = req.params.backupId;
        await axios.delete(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/backups/${backupId}`,
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting backup:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /*
   * ------------------------------------------------------------------------------------------------
   * Plugin Management Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // POST /api/plugins/install/:serverId
  router.post(
    "/plugins/install/:serverId",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      const { serverId } = req.params;
      const { pluginId } = req.body;

      if (!pluginId) {
        return res.status(400).json({ error: "Plugin ID is required" });
      }

      try {
        // 1. Get plugin download details
        const pluginDetails = await axios.get(
          `${SPIGOT_API_BASE}/resources/${pluginId}`
        );
        const downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;

        // 2. Download the plugin
        const pluginResponse = await axios.get(downloadUrl, {
          responseType: "arraybuffer",
        });
        const pluginBuffer = Buffer.from(pluginResponse.data, "binary");

        // 3. Get signed upload URL from Pterodactyl
        const uploadUrlResponse = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/upload`,
          {
            headers: {
              'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );

        const uploadUrl = uploadUrlResponse.data.attributes.url;

        // 4. Upload the plugin to the signed URL using multipart/form-data
        const form = new FormData();
        const tempFileName = `temp_${Date.now()}_${pluginId}.jar`;
        form.append("files", pluginBuffer, {
          filename: tempFileName,
          contentType: "application/java-archive",
        });

        const headers = form.getHeaders();
        await axios.post(uploadUrl, form, {
          headers: {
            ...headers,
            "Content-Length": form.getLengthSync(),
          },
        });

        // 5. Rename (move) the file to the plugins directory
        const renameResponse = await axios.put(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/rename`,
          {
            root: "/",
            files: [
              {
                from: tempFileName,
                to: `plugins/${pluginDetails.data.name}.jar`,
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
              'Accept': "application/json",
              "Content-Type": "application/json",
            },
          }
        );

        res.json({ message: "Plugin installed successfully" });
      } catch (error) {
        console.error("Error installing plugin:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /*
   * ------------------------------------------------------------------------------------------------
   * File Management Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET /api/server/:id/files/list
  router.get(
    "/server/:id/files/list",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const directory = req.query.directory || "/";
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 10;

        const response = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/list`,
          {
            params: { 
              directory,
              page: page,
              per_page: perPage
            },
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );

        // Add pagination metadata to the response
        const totalItems = response.data.meta?.pagination?.total || 0;
        const totalPages = Math.ceil(totalItems / perPage);

        const paginatedResponse = {
          ...response.data,
          meta: {
            ...response.data.meta,
            pagination: {
              ...response.data.meta?.pagination,
              current_page: page,
              per_page: perPage,
              total_pages: totalPages
            }
          }
        };

        res.json(paginatedResponse);
      } catch (error) {
        console.error("Error listing files:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // GET /api/server/:id/files/contents
  router.get(
    "/server/:id/files/contents",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const file = encodeURIComponent(req.query.file); // URL-encode the file path
        const response = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/contents?file=${file}`,
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            responseType: "text", // Treat the response as plain text
          }
        );

        // Send the raw file content back to the client
        res.send(response.data);
      } catch (error) {
        console.error("Error getting file contents:", error);

        // Optionally log the error response for more details
        if (error.response) {
          console.error("Error response data:", error.response.data);
        }

        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/files/write
  router.post(
    "/server/:id/files/write",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const file = encodeURIComponent(req.query.file); // URL-encode the file path
        const content = req.body; // Expect the raw file content from the client

        const response = await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/write?file=${file}`,
          content, // Send the content as the raw body
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "text/plain", // Adjust based on your file type (e.g., 'text/yaml')
            },
          }
        );

        await logActivity(db, serverId, 'Write File', { file });

        res.status(204).send(); // No content response
      } catch (error) {
        console.error("Error writing file:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/files/compress
  router.post(
    "/server/:id/files/compress",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { root, files } = req.body;
        await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/compress`,
          { root, files },
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(200).json(response.data);
      } catch (error) {
        console.error("Error compressing files:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/files/decompress
  router.post(
    "/server/:id/files/decompress",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { root, file } = req.body;
        await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/decompress`,
          { root, file },
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error decompressing file:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/files/delete
  router.post(
    "/server/:id/files/delete",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { root, files } = req.body;
        await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/delete`,
          { root, files },
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        await logActivity(db, serverId, 'Delete File', { root, files });
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting files:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // GET /api/server/:id/files/upload
  router.get(
    "/server/:id/files/upload",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const directory = req.query.directory || "/";
        const response = await axios.get(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/upload`,
          {
            params: { directory },
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.json(response.data);
      } catch (error) {
        console.error("Error getting upload URL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /api/server/:id/files/create-folder
  router.post(
    "/server/:id/files/create-folder",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { root, name } = req.body;
        await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/create-folder`,
          { root, name },
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error creating folder:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // PUT /api/server/:id/files/rename
  router.put(
    "/server/:id/files/rename",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { root, files } = req.body;
        await axios.put(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/rename`,
          { root, files },
          {
            headers: {
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error renaming file/folder:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /*
   * ------------------------------------------------------------------------------------------------
   * Renewal System
   * ------------------------------------------------------------------------------------------------
   */

  // Constants for renewal system
  const RENEWAL_PERIOD_HOURS = settings.renew.time;
  const WARNING_THRESHOLD_HOURS = settings.renew.warning; // When to start showing warnings
  const CHECK_INTERVAL_MINUTES = settings.renew.interval; // How often to check for expired servers

  // Initialize the renewal system
  async function initializeRenewalSystem(db) {
    // Start the background task to check for expired servers
    setInterval(async () => {
      await checkExpiredServers(db);
    }, CHECK_INTERVAL_MINUTES * 60 * 1000);
  }

  async function getRenewalStatus(db, serverId, user) {
    try {
      const renewalData = await db.get(`renewal_${serverId}`);
      const hasRenewalBypass = await db.get(`renewbypass-${user}`);

      if (!renewalData) {
        // Initialize renewal data if it doesn't exist
        const now = new Date();
        const nextRenewal = hasRenewalBypass ? 
          new Date('2099-12-31T23:59:59.999Z').toISOString() : 
          new Date(now.getTime() + RENEWAL_PERIOD_HOURS * 60 * 60 * 1000).toISOString();

        const initialRenewalData = {
          lastRenewal: now.toISOString(),
          nextRenewal: nextRenewal,
          isActive: true,
          renewalCount: 0,
          hasRenewalBypass: hasRenewalBypass
        };
        await db.set(`renewal_${serverId}`, initialRenewalData);
        return initialRenewalData;
      }

      // If renewal bypass has been purchased, update the nextRenewal date
      if (hasRenewalBypass && !renewalData.hasRenewalBypass) {
        const updatedRenewalData = {
          ...renewalData,
          nextRenewal: new Date('2099-12-31T23:59:59.999Z').toISOString(),
          hasRenewalBypass: true,
          isActive: true // Ensure server is active if it was previously expired
        };
        await db.set(`renewal_${serverId}`, updatedRenewalData);
        return updatedRenewalData;
      }

      return renewalData;
    } catch (error) {
      console.error(`Error getting renewal status for server ${serverId}:`, error);
      throw new Error('Failed to get renewal status');
    }
  }

  async function renewServer(db, serverId) {
    try {
      const now = new Date();
      const renewalData = await getRenewalStatus(db, serverId);

      // Update renewal data
      const updatedRenewalData = {
        lastRenewal: now.toISOString(),
        nextRenewal: new Date(now.getTime() + RENEWAL_PERIOD_HOURS * 60 * 60 * 1000).toISOString(),
        isActive: true,
        renewalCount: (renewalData.renewalCount || 0) + 1
      };

      await db.set(`renewal_${serverId}`, updatedRenewalData);
      await logActivity(db, serverId, 'Server Renewal', {
        renewalCount: updatedRenewalData.renewalCount,
        nextRenewal: updatedRenewalData.nextRenewal
      });

      return updatedRenewalData;
    } catch (error) {
      console.error(`Error renewing server ${serverId}:`, error);
      throw new Error('Failed to renew server');
    }
  }

  async function checkExpiredServers(db) {
    try {
      // Get all renewal keys from the database
      const renewalKeys = await listKeys('renewal_');
      const now = new Date();

      for (const key of renewalKeys) {
        const serverId = key.replace('renewal_', '');
        const renewalData = await db.get(key);

        if (!renewalData || !renewalData.isActive) continue;

        const nextRenewal = new Date(renewalData.nextRenewal);
        const hoursUntilExpiration = (nextRenewal - now) / (1000 * 60 * 60);

        // If server is expired, shut it down
        if (hoursUntilExpiration <= 0) {
          await handleExpiredServer(db, serverId);
        }
        // If server is approaching expiration, log a warning
        else if (hoursUntilExpiration <= WARNING_THRESHOLD_HOURS) {
          await logActivity(db, serverId, 'Renewal Warning', {
            hoursRemaining: Math.round(hoursUntilExpiration * 10) / 10
          });
        }
      }
    } catch (error) {
      console.error('Error checking expired servers:', error);
    }
  }

  async function handleExpiredServer(db, serverId) {
    try {
      // Update renewal status
      const renewalData = await db.get(`renewal_${serverId}`);
      renewalData.isActive = false;
      await db.set(`renewal_${serverId}`, renewalData);

      // Stop the server
      await executePowerAction(serverId, 'stop');

      // Log the expiration
      await logActivity(db, serverId, 'Server Expired', {
        lastRenewal: renewalData.lastRenewal,
        renewalCount: renewalData.renewalCount
      });
    } catch (error) {
      console.error(`Error handling expired server ${serverId}:`, error);
    }
  }

  // GET /api/server/:id/renewal/status
  router.get('/server/:id/renewal/status', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const renewalStatus = await getRenewalStatus(db, serverId, req.session.userinfo.id);

      // Calculate time remaining
      const now = new Date();
      const nextRenewal = new Date(renewalStatus.nextRenewal);
      const timeRemaining = nextRenewal - now;

      // Format the response
      const response = {
        ...renewalStatus,
        timeRemaining: {
          total: timeRemaining,
          hours: Math.floor(timeRemaining / (1000 * 60 * 60)),
          minutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((timeRemaining % (1000 * 60)) / 1000)
        },
        requiresRenewal: timeRemaining <= WARNING_THRESHOLD_HOURS * 60 * 60 * 1000,
        isExpired: timeRemaining <= 0
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting renewal status:', error);
      res.status(500).json({ error: 'Failed to get renewal status' });
    }
  });

  // POST /api/server/:id/renewal/renew
  router.post('/server/:id/renewal/renew', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const currentStatus = await getRenewalStatus(db, serverId);

      // Check if renewal is actually needed
      const now = new Date();
      const nextRenewal = new Date(currentStatus.nextRenewal);
      const timeRemaining = nextRenewal - now;

      // Allow renewal if less than 24 hours remaining or expired
      if (timeRemaining > WARNING_THRESHOLD_HOURS * 60 * 60 * 1000) {
        return res.status(400).json({
          error: 'Renewal not required yet',
          nextRenewal: currentStatus.nextRenewal,
          timeRemaining: {
            hours: Math.floor(timeRemaining / (1000 * 60 * 60)),
            minutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60))
          }
        });
      }

      // Process the renewal
      const renewalData = await renewServer(db, serverId);

      // If server was stopped due to expiration, restart it
      if (!currentStatus.isActive) {
        await executePowerAction(serverId, 'start');
      }

      res.json({
        message: 'Server renewed successfully',
        renewalData
      });
    } catch (error) {
      console.error('Error renewing server:', error);
      res.status(500).json({ error: 'Failed to renew server' });
    }
  });

  /*
   * ------------------------------------------------------------------------------------------------
   * Additional API Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET /api/subuser-servers. This is how we show the user their subuser servers.
  router.get('/subuser-servers', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.pterodactyl.username;
      console.log(`Fetching subuser servers for user ${userId}`);
      let subuserServers = await db.get(`subuser-servers-${userId}`) || [];

      console.log(`Found ${subuserServers.length} subuser servers for user ${userId}`);
      res.json(subuserServers);
    } catch (error) {
      console.error('Error fetching subuser servers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  async function updateSubuserInfo(serverId, serverOwnerId) {
    try {
      console.log(`Updating subuser info for server ${serverId}`);
      const response = await axios.get(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/users`,
        {
          headers: {
            'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      const subusers = response.data.data.map(user => ({
        id: user.attributes.username,
        username: user.attributes.username,
        email: user.attributes.email,
      }));

      console.log(`Found ${subusers.length} subusers for server ${serverId}`);

      // Update server owner's subuser list
      await db.set(`subusers-${serverId}`, subusers);

      // Update each subuser's server list
      const serverName = await getServerName(serverId);
      for (const subuser of subusers) {
        console.log(`Updating subuser-servers for user ${subuser.id}`);
        let subuserServers = await db.get(`subuser-servers-${subuser.id}`) || [];
        if (!subuserServers.some(server => server.id === serverId)) {
          subuserServers.push({
            id: serverId,
            name: serverName,
            ownerId: serverOwnerId
          });
          await db.set(`subuser-servers-${subuser.id}`, subuserServers);
          console.log(`Added server ${serverId} to subuser-servers for user ${subuser.id}`);
        }
      }

      // Remove any subusers that are no longer associated with this server
      const currentSubuserIds = new Set(subusers.map(u => u.id));
      const allUsers = await db.get('all_users') || [];
      for (const userId of allUsers) {
        let userSubuserServers = await db.get(`subuser-servers-${userId}`) || [];
        const updatedUserSubuserServers = userSubuserServers.filter(server => 
          server.id !== serverId || currentSubuserIds.has(userId)
        );
        if (updatedUserSubuserServers.length !== userSubuserServers.length) {
          await db.set(`subuser-servers-${userId}`, updatedUserSubuserServers);
          console.log(`Updated subuser-servers for user ${userId}`);
        }
      }

    } catch (error) {
      console.error(`Error updating subuser info for server ${serverId}:`, error);
    }
  }

  router.post('/sync-user-servers', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.pterodactyl.id;
      console.log(`Syncing servers for user ${userId}`);

      // Add the current user to the all_users list
      await addUserToAllUsersList(userId);

      // Sync owned servers
      const ownedServers = req.session.pterodactyl.relationships.servers.data;
      for (const server of ownedServers) {
        await updateSubuserInfo(server.attributes.identifier, userId);
      }

      // Fetch and sync subuser servers
      const subuserServers = await db.get(`subuser-servers-${userId}`) || [];
      for (const server of subuserServers) {
        await updateSubuserInfo(server.id, server.ownerId);
      }

      res.json({ message: 'User servers synced successfully' });
    } catch (error) {
      console.error('Error syncing user servers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Helper function to get server name
  async function getServerName(serverId) {
    try {
      const response = await axios.get(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}`,
        {
          headers: {
            'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data.attributes.name;
    } catch (error) {
      console.error('Error fetching server name:', error);
      return 'Unknown Server';
    }
  }

  async function addUserToAllUsersList(userId) {
    let allUsers = await db.get('all_users') || [];
    if (!allUsers.includes(userId)) {
      allUsers.push(userId);
      await db.set('all_users', allUsers);
    }
  }

  // Update the existing /server/:id/users endpoint to call updateSubuserInfo
  router.get('/server/:id/users', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.get(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/users`,
        {
          headers: {
            'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      // Update subuser info in the database
      await updateSubuserInfo(serverId, req.session.userinfo.id);

      res.json(response.data);
    } catch (error) {
      console.error('Error fetching subusers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/server/:id/users', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const response = await axios.post(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/users`,
        { email, permissions: [
            "control.console",
            "control.start",
            "control.stop",
            "control.restart",
            "user.create",
            "user.update",
            "user.delete",
            "user.read",
            "file.create",
            "file.read",
            "file.update",
            "file.delete",
            "file.archive",
            "file.sftp",
            "backup.create",
            "backup.read",
            "backup.delete",
            "backup.update",
            "backup.download",
            "allocation.update",
            "startup.update",
            "startup.read",
            "database.create",
            "database.read",
            "database.update",
            "database.delete",
            "database.view_password",
            "schedule.create",
            "schedule.read",
            "schedule.update",
            "settings.rename",
            "schedule.delete",
            "settings.reinstall",
            "websocket.connect"
          ] },
        {
          headers: {
            'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      // Update subuser info after adding a new subuser
      await updateSubuserInfo(serverId, req.session.userinfo.id);

      // Add the new user to the all_users list
      const newUserId = response.data.attributes.username;
      await addUserToAllUsersList(newUserId);

      res.status(201).json(response.data);
    } catch (error) {
      console.error('Error creating subuser:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/server/:id/users/:subuser - Delete User
  router.delete('/server/:id/users/:subuser', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, subuser: subuserId } = req.params;
      await axios.delete(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/users/${subuserId}`,
        {
          headers: {
            'Authorization': `Bearer ${settings.pterodactyl.client_key}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting subuser:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /*
   * ------------------------------------------------------------------------------------------------
   * Server Control Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET server details
  router.get("/server/:id", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const serverDetails = await pterodactylClient.getServerDetails(serverId);
      res.json(serverDetails);
    } catch (error) {
      console.error("Error fetching server details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET WebSocket credentials
  router.get(
    "/server/:id/websocket",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const wsCredentials = await pterodactylClient.getWebSocketCredentials(
          serverId
        );
        res.json(wsCredentials);
      } catch (error) {
        console.error("Error fetching WebSocket credentials:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST Send command to server
  router.post(
    "/server/:id/command",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { command } = req.body;
        await pterodactylClient.sendCommand(serverId, command);
        res.json({ success: true, message: "Command sent successfully" });
      } catch (error) {
        console.error("Error sending command:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST Set server power state
  router.post(
    "/server/:id/power",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { signal } = req.body;

        const response = await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/power`,
          {
            signal: signal,
          },
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
            },
          }
        );

        res.status(204).send();
      } catch (error) {
        console.error("Error changing power state:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /*
   * ------------------------------------------------------------------------------------------------
   * Server Variables Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET /api/server/:id/variables
  router.get('/server/:id/variables', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.get(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/startup`,
        {
          headers: {
            Authorization: `Bearer ${settings.pterodactyl.client_key}`,
            Accept: 'application/json',
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching server variables:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/server/:id/variables
  router.put('/server/:id/variables', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { key, value } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({ error: 'Missing key or value' });
      }

      const response = await axios.put(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/startup/variable`,
        { key, value },
        {
          headers: {
            Authorization: `Bearer ${settings.pterodactyl.client_key}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error('Error updating server variable:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /*
   * ------------------------------------------------------------------------------------------------
   * File Operations Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // POST /api/server/:id/files/copy
  router.post('/server/:id/files/copy', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { location } = req.body;

      if (!location) {
        return res.status(400).json({ error: 'Missing location' });
      }

      await axios.post(
        `${settings.pterodactyl.domain}/api/client/servers/${serverId}/files/copy`,
        { location },
        {
          headers: {
            Authorization: `Bearer ${settings.pterodactyl.client_key}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      res.status(204).send();
    } catch (error) {
      console.error('Error copying file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /*
   * ------------------------------------------------------------------------------------------------
   * WebSocket and Command Endpoints
   * ------------------------------------------------------------------------------------------------
   */

  // GET WebSocket credentials
  router.get(
    "/server/:id/websocket",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const wsCredentials = await pterodactylClient.getWebSocketCredentials(
          serverId
        );
        res.json(wsCredentials);
      } catch (error) {
        console.error("Error fetching WebSocket credentials:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST Send command to server
  router.post(
    "/server/:id/command",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { command } = req.body;
        await pterodactylClient.sendCommand(serverId, command);
        res.json({ success: true, message: "Command sent successfully" });
      } catch (error) {
        console.error("Error sending command:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST Set server power state
  router.post(
    "/server/:id/power",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const { signal } = req.body;

        const response = await axios.post(
          `${settings.pterodactyl.domain}/api/client/servers/${serverId}/power`,
          {
            signal: signal,
          },
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.pterodactyl.client_key}`,
            },
          }
        );

        res.status(204).send();
      } catch (error) {
        console.error("Error changing power state:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /*
   * ------------------------------------------------------------------------------------------------
   * Renewal Handling Functions
   * ------------------------------------------------------------------------------------------------
   */

  async function executePowerAction(instanceId, powerAction) {
    try {
      const validActions = ['start', 'stop', 'restart', 'kill'];
      if (!validActions.includes(powerAction)) {
        throw new Error(`Invalid power action: ${powerAction}`);
      }

      const response = await axios.post(
        `${settings.pterodactyl.domain}/api/client/servers/${instanceId}/power`,
        { signal: powerAction },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.pterodactyl.client_key}`,
          },
        }
      );

      if (response.status === 204) {
        console.log(`Successfully executed power action: ${powerAction} for server ${instanceId}`);
        return true;
      } else {
        console.error(`Unexpected response status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`Error executing power action for server ${instanceId}:`, error.message);
      return false;
    }
  }

  async function sendWebhookNotification(webhookUrl, message) {
    try {
      await axios.post(webhookUrl, {
        content: message,
      });
    } catch (error) {
      console.error("Failed to send webhook notification:", error.message);
    }
  }

  /*
   * ------------------------------------------------------------------------------------------------
   * Renewal System Routes
   * ------------------------------------------------------------------------------------------------
   */

  // Initialize the renewal system when the module loads
  initializeRenewalSystem(db);

  /*
   * ------------------------------------------------------------------------------------------------
   * Use the router with the '/api' prefix
   * ------------------------------------------------------------------------------------------------
   */
  app.use("/api", router);

};

/*
 * ------------------------------------------------------------------------------------------------
 * Additional Methods for PterodactylClientModule
 * ------------------------------------------------------------------------------------------------
 */

// Additional methods for PterodactylClientModule
PterodactylClientModule.prototype.getWebSocketCredentials = async function (
  serverId
) {
  try {
    const response = await axios.get(
      `${this.apiUrl}/api/client/servers/${serverId}/websocket`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching WebSocket credentials:", error);
    throw error;
  }
};

PterodactylClientModule.prototype.sendCommand = async function (
  serverId,
  command
) {
  await this.connectWebSocket(serverId);
  this.sendToWebSocket("send command", [command]);
};

PterodactylClientModule.prototype.setPowerState = async function (
  serverId,
  state
) {
  await this.connectWebSocket(serverId);
  this.sendToWebSocket("set state", [state]);
};
