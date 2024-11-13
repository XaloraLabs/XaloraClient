const express = require('express');
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const WebSocket = require('ws');
const axios = require('axios');

/* Manifest */
const Manifest = { "name": "Server Build Settings", "api_level": 6, "target_platform": "3.0.0" };

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
    const router = express.Router();

    // Middleware to check if user is authenticated
    const isAuthenticated = (req, res, next) => {
        if (req.session.pterodactyl) {
            next();
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    };

    // Middleware to check if user owns the server
    const ownsServer = (req, res, next) => {
        const serverId = req.params.id;
        const userServers = req.session.pterodactyl.relationships.servers.data;
        const serverOwned = userServers.some(server => server.attributes.identifier === serverId);
        
        if (serverOwned) {
            next();
        } else {
            res.status(403).json({ error: "Forbidden. You don't have access to this server." });
        }
    };

    // POST Reinstall server
    router.post('/server/:id/reinstall', isAuthenticated, ownsServer, async (req, res) => {
        try {
            const serverId = req.params.id;
            await axios.post(`${settings.pterodactyl.domain}/api/client/servers/${serverId}/settings/reinstall`, {}, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.client_key}`
                }
            });
            res.status(204).send(); // No content response on success
        } catch (error) {
            console.error('Error reinstalling server:', error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // POST Rename server
    router.post('/server/:id/rename', isAuthenticated, ownsServer, async (req, res) => {
        try {
            const serverId = req.params.id;
            const { name } = req.body; // Expecting the new name for the server in the request body

            await axios.post(`${settings.pterodactyl.domain}/api/client/servers/${serverId}/settings/rename`, 
            { name: name }, 
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.client_key}`
                }
            });
            res.status(204).send(); // No content response on success
        } catch (error) {
            console.error('Error renaming server:', error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Use the router with the '/api' prefix
    app.use('/api', router);
};