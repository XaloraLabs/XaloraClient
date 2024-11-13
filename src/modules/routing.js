const indexjs = require("../handlers/helper.js");
const express = require("express");
const loadConfig = require("../handlers/config");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const rateLimit = require("express-rate-limit");
const cacheMiddleware = require("../middleware/cache");
const settings = loadConfig("./config.toml");

/* Manifest */
const Manifest = { "name": "Page Routing", "api_level": 6, "target_platform": "3.0.0" };

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
  // Load pages.yml
  const pagesPath = path.join(__dirname, '../../src/views/pages.yml');
  let pagesConfig;
  try {
    const fileContents = fs.readFileSync(pagesPath, 'utf8');
    pagesConfig = yaml.load(fileContents);
  } catch (e) {
    console.error(`Failed to load pages.yml: ${e}`);
    process.exit(1);
  }

  // Apply Rate Limiting
  if (pagesConfig.rate_limit && pagesConfig.rate_limit.enabled) {
    const limiter = rateLimit({
      windowMs: pagesConfig.rate_limit.window_ms || 60000, // default 1 minute
      max: pagesConfig.rate_limit.max_requests || 100, // default 100 requests
      message: "Too many requests from this IP, please try again later."
    });
    app.use(limiter);
  }

  // Apply Logging Middleware
  if (pagesConfig.logging) {
    const morgan = require('morgan');
    app.use(morgan(pagesConfig.logging.format || 'combined', {
      skip: function (req, res) { return res.statusCode < 400 },
      stream: process.stderr
    }));
    app.use(morgan(pagesConfig.logging.format || 'combined', {
      skip: function (req, res) { return res.statusCode >= 400 },
      stream: process.stdout
    }));
  }

  // Apply Caching Middleware
  if (pagesConfig.cache && pagesConfig.cache.enabled) {
    app.use(cacheMiddleware(pagesConfig.cache.ttl_seconds || 300));
  }

  app.all("*", async (req, res) => {
    try {
      // Check if user needs to re-login
      if (req.session.pterodactyl && 
          req.session.pterodactyl.id !== await db.get("users-" + req.session.userinfo.id)) {
        return res.render("login", { prompt: "none" });
      }

      const theme = pagesConfig; // ???

      // Check if user needs to be logged in for this route
      if (pagesConfig.mustbeloggedin.includes(req.path) && 
          (!req.session.pterodactyl)) {
        return res.redirect('../')
      }

      // Handle admin routes
      if (pagesConfig.mustbeadmin.includes(req.path)) {
        const renderData = await indexjs.renderdataeval(req, theme);
        return res.render(pagesConfig.index, renderData);
      }

      // Handle regular routes with timeout protection
      try {
        const renderData = await Promise.race([
          indexjs.renderdataeval(req, theme),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Database Failure')), 3000))
        ]);
        
        // Determine the template to render based on the route
        const template = pagesConfig.pages[req.path] || pagesConfig.notfound;
        return res.render(template, renderData);
      } catch (error) {
        if (error.message === 'Database Failure') {
          return res.status(500).render("500", { err: 'Database Failure' });
        }
        throw error;
      }
    } catch (err) {
      console.error(err);
      return res.status(500).render("500", { err });
    }
  });
};