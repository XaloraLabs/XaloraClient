const settings = require('../settings.json')

const fetch = require('node-fetch')

module.exports = (userid, db) => {
    return new Promise(async (resolve, err) => {
        let cacheaccount = await fetch(
            settings.pterodactyl.domain + "/api/application/users/" + (await db.get("users-" + userid)) + "?include=servers",
            {
                method: "get",
                headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${settings.pterodactyl.key}` }
            }
        );
        if (await cacheaccount.statusText === "Not Found") return err('Ptero account not found');
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        resolve(cacheaccountinfo)
    })
}