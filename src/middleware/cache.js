const NodeCache = require('node-cache');
const cache = new NodeCache();

module.exports = (ttl) => {
  return (req, res, next) => {
    const key = '__express__' + req.originalUrl || req.url;
    const cachedBody = cache.get(key);
    if (cachedBody) {
      return res.send(cachedBody);
    } else {
      res.sendResponse = res.send;
      res.send = (body) => {
        cache.set(key, body, ttl);
        res.sendResponse(body);
      };
      next();
    }
  };
};