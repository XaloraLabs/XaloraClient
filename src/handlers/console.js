const winston = require("winston");

function createLogger() {
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
      new winston.transports.File({ filename: "logs/app.log" }),
    ],
  });

  // Replace console.log with the logger
  const originalLog = console.log;
  console.log = function () {
    const args = Array.from(arguments); // Capture arguments passed to console.log
    const combinedMessage = args.map(arg => arg.toString()).join(' '); // Convert each argument to string

    // Log the message with Winston
    logger.info(combinedMessage);
  };

  return logger;
}

module.exports = createLogger;
