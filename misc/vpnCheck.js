const fetch = require('node-fetch');
const { renderFile } = require('ejs');
const fs = require('fs');
let newsettings = JSON.parse(fs.readFileSync("./settings.json"));

module.exports = (key, db, ip) => {
    return new Promise(async resolve => {
        let ipcache = await db.get(`vpncheckcache-${ip}`)
        if (!ipcache) {
            vpncheck = await(await fetch(`https://proxycheck.io/v2/${ip}?key=${key}&vpn=1`)).json().catch(() => { })
        }
        if (ipcache || (vpncheck && vpncheck[ip])) {
            if (!ipcache) ipcache = vpncheck[ip].proxy
            await db.set(`vpncheckcache-${ip}`, ipcache, 172800000)
            // Is a VPN/proxy?
            if (ipcache === "yes") {
                resolve(true)
                renderFile(
                    `./themes/${newsettings.theme}/alerts/vpn.ejs`,
                    {
                        settings: newsettings,
                        db,
                        extra: { home: { name: 'VPN Detected' } }
                    },
                    null,
                    (err) => {
                        if (err) return renderFile(`./themes/default/alerts/vpn.ejs`);
                    }
                )
                return 
            } else return resolve(false)
        } else return resolve(false)
    })
}
