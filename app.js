"use strict";

/**
 * Heliactyl Next "aeolus"
 * 
 * @author SRYDEN
 * @version 3.0.0-canary
 * @license SRYDEN-PUBLIC-USE
 * @website https://sryden.com/open-source
 * @source https://github.com/heliactyloss/next
 */

/**
 * Load logging functionality. This is an alternative to using `logger`, it hijacks the console.log function.
 */
require("./src/handlers/console.js")();

/**
 * Load required packages
 */
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const chalk = require("chalk");
const axios = require("axios");
const arciotext = require("./src/handlers/afk.js");
const cluster = require("cluster");
const os = require("os");
const ejs = require("ejs");
const readline = require("readline");
const chokidar = require("chokidar");
const helmet = require("helmet"); // Security
const morgan = require("morgan"); // HTTP Logging
const rateLimit = require("express-rate-limit"); // Rate Limiting
// const cors = require("cors"); // CORS Handling. It's not generally needed in Heliactyl Next.
const compression = require("compression"); // Response Compression
const dotenv = require("dotenv"); // Environment Variables
const winston = require("winston"); // Advanced Logging
const jsYaml = require('js-yaml');

/**
 * Load environment variables
 */
dotenv.config();

/**
 * Define global Buffer if not exists
 */
global.Buffer = global.Buffer || require("buffer").Buffer;

/**
 * Override process.emitWarning
 */
process.emitWarning = () => {};

/**
 * Polyfill for btoa if not defined
 */
if (typeof btoa === "undefined") {
  global.btoa = (str) => Buffer.from(str, "binary").toString("base64");
}

/**
 * Polyfill for atob if not defined
 */
if (typeof atob === "undefined") {
  global.atob = (b64Encoded) =>
    Buffer.from(b64Encoded, "base64").toString("binary");
}

/**
 * Load settings.
 */
const loadConfig = require("./src/handlers/config");
const settings = loadConfig();

/**
 * Setup Winston logger
 */
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

/**
 * Load database
 */
const Database = require("./src/db.js");
const db = new Database(settings.database);

/**
 * Renew bypass system
 */
const renewBypassIds = settings.renewbypass.users;

renewBypassIds.forEach((id) => {
  db.set(`renewbypass-${id}`, true);
});

/**
 * Centralized Error Handling
 */
const handleErrors = () => {
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
    process.exit(1); // Optionally, shut down the process gracefully
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise);
    logger.error("Reason:", reason);
  });

  /**
   * Shim Promise to capture stack traces on rejection
   */
  const shimPromiseWithStackCapture = () => {
    const OriginalPromise = global.Promise;
    const captureStack = () => new Error().stack;

    class PromiseWithStack extends OriginalPromise {
      constructor(executor) {
        const stack = captureStack();
        super((resolve, reject) => {
          executor(resolve, (reason) => {
            if (reason instanceof Error) {
              if (!reason.stack) {
                reason.stack = stack;
              }
            } else {
              const err = new Error(reason);
              err.stack = stack;
              reject(err);
              return;
            }
            reject(reason);
          });
        });
      }

      static all = OriginalPromise.all;
      static race = OriginalPromise.race;
      static resolve = OriginalPromise.resolve;
      static reject = OriginalPromise.reject;
    }

    global.Promise = PromiseWithStack;
  };

  shimPromiseWithStackCapture();
};

// Initialize error handlers
handleErrors();

/**
 * Cluster handling
 */
if (cluster.isMaster) {
  /**
   * Master Process
   */

  const spinnerFrames = [
    "⠋",
    "⠙",
    "⠹",
    "⠸",
    "⠼",
    "⠴",
    "⠦",
    "⠧",
    "⠇",
    "⠏",
  ];
  let currentFrame = 0;
  const spinner = setInterval(() => {
    process.stdout.write(
      `\r${chalk.gray(spinnerFrames[currentFrame++])} Initializing Heliactyl...`
    );
    currentFrame %= spinnerFrames.length;
  }, 100);

  setTimeout(() => {
    clearInterval(spinner);
    console.clear();
    startMasterApp();
  }, 1000); // Adjusted timeout to 1 second for demonstration

  const startMasterApp = () => {
    // Create tree view of modules in /modules/
    const moduleFiles = fs.readdirSync("./src/modules").filter((file) =>
      file.endsWith(".js")
    );
    const settingsVersion = settings.version;
    const runtime = typeof Bun !== "undefined" ? "Bun" : "Node.js";

    logger.info(`Running under the ${runtime} runtime`);
    logger.info("Loading modules...");

    const modulesTable = moduleFiles.map((file) => {
      const module = require(`./src/modules/${file}`);
      if (!module.load || !module.heliactylModule) {
        logger.warn(
          `Module "${file}" has an error: No module manifest or load function was specified.`
        );
        process.exit(1);
        return {
          File: file,
          Status: "No module information",
          "API Level": 0,
          "Target Platform": "Unknown",
        };
      }

      const { name, api_level, target_platform } = module.heliactylModule;

      if (target_platform !== settingsVersion) {
        logger.warn(
          `Module "${name}" has an error: Target platform mismatch (expected: ${settingsVersion}, found: ${target_platform})`
        );
        process.exit(1);
        return {
          File: file,
          Name: name,
          Status: `Error: Target platform mismatch (expected: ${settingsVersion}, found: ${target_platform})`,
          "API Level": api_level,
          "Target Platform": target_platform,
        };
      }

      return {
        File: file,
        Name: name,
        Status: "Module loaded!",
        "API Level": api_level,
        "Target Platform": target_platform,
      };
    });

    // Optionally display modules table
    // logger.info(JSON.stringify(modulesTable, null, 2));

    const numCPUs = Math.max(
      1,
      Math.min(parseInt(settings.clusters) - 1, os.cpus().length)
    );
    logger.info("Starting workers...");
    logger.info(`Master \`heliactyln3_${process.pid}\` is alive`);
    logger.info(`Forking ${numCPUs} workers...`);
    logger.info(`Heliactyl Next v${settings.version} (${settings.platform_codename})`);

    for (let i = 0; i < numCPUs; i++) {
      const worker = cluster.fork();
      if (i === 0) {
        worker.send({ type: "FIRST_WORKER" });
      }
    }

    cluster.on("exit", (worker, code, signal) => {
      logger.error(
        `Worker ${worker.process.pid} died. Forking a new worker...`
      );
      cluster.fork();
    });

    // Watch for file changes and reboot workers
    const watchPaths = ["./src/modules", "./src/handlers", "./src/views"];
    watchPaths.forEach((watchPath) => {
      chokidar.watch(watchPath).on("change", (path) => {
        logger.warn(`File changed: ${path}. Rebooting workers...`);
        for (const id in cluster.workers) {
          cluster.workers[id].kill();
        }
      });
    });
  };

  cluster.on("online", (worker) => {
    const workerTree = Object.values(cluster.workers).map((w) => ({
      id: w.id,
      pid: w.process.pid,
      state: w.state,
    }));
    // Optionally log workerTree
    // logger.info(JSON.stringify(workerTree, null, 2));
  });
} else {
  /**
   * Worker Process
   */

  let isFirstWorker = false;

  process.on("message", (msg) => {
    if (msg.type === "FIRST_WORKER") {
      isFirstWorker = true;
      logger.info(
        `Cluster \`heliactyln3_${process.pid}\` is designated as the first worker`
      );
      logger.info(
        `Web clusters are now listening on port ${settings.website.port}`
      );
    }
  });

  /**
   * Cluster-safe interval
   */
  global.clusterSafeInterval = (callback, delay) => {
    if (isFirstWorker) {
      return setInterval(callback, delay);
    }
    return {
      unref: () => {},
      ref: () => {},
      close: () => {},
    };
  };

  global.setInterval = (callback, delay) =>
    clusterSafeInterval(callback, delay);

  /**
   * Initialize Express App
   */
  const express = require("express");
  const session = require("express-session");
  // const csrf = require("csurf"); // CSRF Protection
  // const helmet = require("helmet");
  const nocache = require("nocache");
  const app = express();
  const expressWs = require("express-ws")(app);
  const cookieParser = require("cookie-parser");

  /**
   * Setup Session Store
   */
  let SessionMiddleware;
  const sessionOptions = {
    secret: settings.website.secret,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production', // Set to true if using https
      httpOnly: true, // Mitigate XSS
      // sameSite: 'lax', // CSRF protection
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  };

  if (settings.sessions.provider === "redis") {
    // Session store using Redis
    const RedisStore = require("connect-redis").default;
    const redis = require("redis");

    const redisClient = redis.createClient({
      socket: {
        host: settings.sessions.redis.host,
        port: settings.sessions.redis.port,
      },
      password: settings.sessions.redis.password, // if applicable
      legacyMode: true, // Required for connect-redis compatibility
    });

    redisClient.connect().catch((err) => {
      logger.error("Heliactyl cannot boot due to a Redis connection error. If you don't have Redis installed, please set sessions.provider to `sqlite` in the config. Error:", err);
      process.exit(1);
    });

    sessionOptions.store = new RedisStore({ client: redisClient });
  } else {
    // Fallback to SQLite session store
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionOptions.store = new SQLiteStore({
      db: 'sessions.db',
      dir: './src',
      // Options can be added here
    });
    logger.info("Using SQLite for session storage.");
  }

  SessionMiddleware = session(sessionOptions);

  /**
   * Apply session middleware
   */
  app.use(SessionMiddleware);

  /**
   * Apply Security Middlewares
   */
  // app.use(helmet()); // Sets various HTTP headers to secure Express apps
  // app.use(cors()); // Enables CORS with default settings

  /**
   * Set Views Directory
   */
  app.set('views', path.join(__dirname, '/src/views'));

  /**
   * Setup HTTP Request Logging
   */
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );

  /**
   * Setup Response Compression
   */
  app.use(compression());

  /**
   * Set View Engine
   */
  app.set("view engine", "ejs");

  /**
   * Apply Parsers and Static Routes
   */
  app.use(cookieParser());
  app.use(express.text());

  app.use('/assets', express.static(path.join(__dirname, '/src/assets')));

  /**
   * Set CORS Headers
   */
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  /**
   * Apply Body Parsing Middleware
   */
  app.use(
    express.json({
      inflate: true,
      limit: "500kb",
      strict: true,
      type: "application/json",
    })
  );

  /**
   * Apply No-Cache Middleware
   */
  app.use(nocache());

  /**
   * Set Custom Headers
   */
  app.use((req, res, next) => {
    res.setHeader(
      "X-Powered-By",
      "3rd Gen Heliactyl Next (" + settings.platform_codename + ")"
    );
    res.setHeader(
      "X-Heliactyl",
      `v${settings.platform_version} - Platform "${settings.platform_codename}"`
    );
    res.setHeader(
      "X-UA",
      `Heliactyl/${settings.version} (${settings.platform_codename})`
    );
    next();
  });

  /**
   * Centralized Error Handling Middleware
   */
  app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
      // CSRF token errors
      res.status(403).send('Form tampered with.');
    } else if (err.status === 500 && err.message === "Gateway Timeout") {
      res.status(500).render("500", { err: "Gateway Timeout" });
    } else {
      next(err);
    }
  });

  /**
   * Rate Limiting Middleware
   */
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message:
      "Too many requests from this IP, please try again after 15 minutes",
  });

  app.use("/api/", apiLimiter); // Apply to API routes

  /**
   * Middleware to Handle User Bans Based on Coin Balance
   */
  app.use(async (req, res, next) => {
    if (req.session.userinfo && req.path !== "/banned") {
      const userId = req.session.userinfo.id;
      const coins = (await db.get(`coins-${userId}`)) || 0;
      if (coins > 150000000) {
        req.session.banned = true;
        return res.redirect("/banned");
      }
    }
    next();
  });

  /**
   * Load API Routes from Modules
   */
  const loadApiRoutes = () => {
    const apiFiles = fs
      .readdirSync("./src/modules")
      .filter((file) => file.endsWith(".js"));
    apiFiles.forEach((file) => {
      const apiModule = require(`./src/modules/${file}`);
      apiModule.load(app, db);
    });
  };

  loadApiRoutes();

  /**
   * Retrieve Theme Settings
   * @param {Object} req - The request object 
   * @returns {Object} - Theme settings
   */
  const getThemeSettings = (req) => ({
    settings: fs.existsSync("./src/views/pages.yml")
      ? jsYaml.load(fs.readFileSync("./src/views/pages.yml", "utf8"))
      : defaultThemeSettings,
  });

  /**
   * Expose Helper Functions
   */
  module.exports = {
    get: getThemeSettings,
    isLimited: async () => !cache,
    ratelimits: async (length) => {
      if (cache) return setTimeout(module.exports.ratelimits, 1);
      cache = true;
      setTimeout(() => {
        cache = false;
      }, length * 1000);
    },
    renderDataEval: (req, theme) => renderDataEval(req, theme, db),
    db: db,
  };

  /**
   * Listen for Incoming Connections
   */
  const listener = app.listen(settings.website.port, async () => {
    await db.set("afkSessions", {});
    logger.info(
      `${chalk.gray("[cluster]")} Cluster state updated: ${chalk.green("running")}`
    );
  });

  /**
   * Rate Limiting Manager
   */
  let cache = false;

  app.use((req, res, next) => {
    const rateLimitManager = settings.api.client.ratelimits;
    const pathName = req._parsedUrl.pathname;

    if (rateLimitManager[pathName]) {
      if (cache) {
        setTimeout(() => {
          const queries = new URLSearchParams(req.query).toString();
          res.redirect(
            `${pathName.startsWith("/")
              ? ""
              : "/"}${pathName}?${queries}`
          );
        }, 1000);
        return;
      }
      cache = true;
      setTimeout(() => {
        cache = false;
      }, 1000 * rateLimitManager[pathName]);
    }
    next();
  });
}