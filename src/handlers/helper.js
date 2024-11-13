"use strict";

const fs = require("fs");
const path = require("path");
const jsYaml = require('js-yaml');
const winston = require("winston");
const dotenv = require("dotenv");
const Database = require("../db.js");
const loadConfig = require("../handlers/config");
const arciotext = require("./afk.js");

// Load environment variables
dotenv.config();

// Load settings
const settings = loadConfig();

// Setup Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "src/logs/app.log" }),
  ],
});

// Load database
const db = new Database(settings.database);

// Function to retrieve theme settings
const getThemeSettings = (req) => ({
  settings: fs.existsSync("./src/views/pages.yml")
    ? jsYaml.load(fs.readFileSync("./src/views/pages.yml", "utf8"))
    : {
        index: "index.ejs",
        notfound: "index.ejs",
        redirect: {},
        pages: {},
        mustBeLoggedIn: [],
        mustBeAdmin: [],
        variables: {},
      },
});

/**
 * Default theme settings
 * @type {Object}
 */
const defaultThemeSettings = {
  index: "index.ejs",
  notfound: "index.ejs",
  redirect: {},
  pages: {},
  mustBeLoggedIn: [],
  mustBeAdmin: [],
  variables: {},
};

/**
 * Renders data for the theme.
 * @param {Object} req - The request object.
 * @param {Object} theme - The theme object.
 * @returns {Promise<Object>} The rendered data.
 */
const renderDataEval = async (req, theme, db) => {
  const JavaScriptObfuscator = require("javascript-obfuscator");
  const newSettings = loadConfig("./config.toml");
  const packageNameKey = req.session.userinfo
    ? `package-${req.session.userinfo.id}`
    : null;
  const packageName = packageNameKey
    ? (await db.get(packageNameKey) || settings.api.client.packages.default)
    : null;

  const renderData = {
    req,
    settings: newSettings,
    userinfo: req.session.userinfo,
    packagename: packageName,
    extraresources: req.session.userinfo
      ? (await db.get(`extra-${req.session.userinfo.id}`) || {
          ram: 0,
          disk: 0,
          cpu: 0,
          servers: 0,
        })
      : null,
    packages: req.session.userinfo
      ? settings.api.client.packages.list[packageName]
      : null,
    coins:
      settings.coins.enabled && req.session.userinfo
        ? (await db.get(`coins-${req.session.userinfo.id}`) || 0)
        : null,
    pterodactyl: req.session.pterodactyl,
    db,
  };

  renderData.arcioafktext = JavaScriptObfuscator.obfuscate(`
    let everywhat = ${settings.afk.every};
    let gaincoins = ${settings.afk.coins};
    let wspath = "ws";

    ${arciotext}
  `).getObfuscatedCode();

  return renderData;
};

// Export shared functionalities
module.exports = {
  logger,
  db,
  settings,
  get: getThemeSettings,
  renderDataEval: (req, theme) => renderDataEval(req, theme, db),
};

module.exports.renderdataeval = renderDataEval;