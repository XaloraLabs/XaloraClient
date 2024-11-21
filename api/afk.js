// Orignal code by betterheliactyl
// Modified by achul123

const fs = require('fs');

let currentlyonpage = {};

module.exports.load = async function(app, db) {

  app.ws("/afk/ws", async (ws, req) => {

    let newsettings = JSON.parse(fs.readFileSync("./settings.json"));

    if (newsettings.api["afk page"].enabled !== true || !req.session || !req.session.userinfo) {
      return ws.close();
    }

    if (currentlyonpage[req.session.userinfo.id]) {
      return ws.close();
    }

    currentlyonpage[req.session.userinfo.id] = true;

    let coinloop = setInterval(
      async function() {
        let usercoins = await db.get("coins-" + req.session.userinfo.id);
        usercoins = usercoins ? usercoins : 0;
        usercoins = usercoins + newsettings.api["afk page"].coins;
        if (usercoins > 999999999999999) return ws.close();
        await db.set("coins-" + req.session.userinfo.id, usercoins);  
        ws.send(JSON.stringify({"type":"coin"}))
      }, newsettings.api["afk page"].every * 1000
    );

    ws.onclose = async() => {
      clearInterval(coinloop);
      delete currentlyonpage[req.session.userinfo.id];
    }
  });
};
