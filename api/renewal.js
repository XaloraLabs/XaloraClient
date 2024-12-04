const settings = require("../settings.json");
const { CronJob } = require('cron')
const getAllServers = require('../misc/getAllServers')
const fetch = require('node-fetch')
const chalk = require("chalk");

module.exports.load = async function (app, db) {
    // Renewal system is ...
    app.get(`/api/renewalstatus`, async (req, res) => {
        if (!settings.renewals.status) return res.json({ error: true })
        if (!req.query.id) return res.json({ error: true })
        if (!req.session.pterodactyl) res.json({ error: true })
        if (req.session.pterodactyl.relationships.servers.data.filter(server => server.attributes.id == req.query.id).length == 0) return res.json({ error: true });

        const lastRenew = await db.get(`lastrenewal-${req.query.id}`)
        if (!lastRenew) return res.json({ text: 'Disabled' })

        // if (lastRenew > Date.now()) return res.json({ text: 'Renewed', success: true })
        else {
            if ((Date.now() - lastRenew) > (settings.renewals.delay * 86400000)) {
                return res.json({ text: 'Last chance to renew!', renewable: true })
            }
            const time = msToDaysAndHours((settings.renewals.delay * 86400000) - (Date.now() - lastRenew))
            return res.json({ text: time, renewable: true })
        }
    })

    app.get(`/renew`, async (req, res) => {
    if (!settings.renewals.status) return res.send(`Renewals are currently disabled.`);
    if (!req.query.id) return res.send(`Missing ID.`);
    if (!req.session.pterodactyl) return res.redirect(`/login`);

    const server = req.session.pterodactyl.relationships.servers.data.filter(server => server.attributes.id == req.query.id)[0];
    if (!server) return res.send(`No server with that ID was found!`);

    const lastRenew = await db.get(`lastrenewal-${req.query.id}`);
    if (!lastRenew) return res.send('No renewals are recorded for this ID.');

    // Calculate the end of the current renewal period
    const currentRenewalEnd = lastRenew + (settings.renewals.delay * 86400000);

    // Check if it's too early to renew
    if (Date.now() < currentRenewalEnd - 86400000) { // Allow renewals only within the last day of the period
        const timeLeft = msToDaysAndHours(currentRenewalEnd - Date.now());
        return res.send(`
            <div class="mb-4 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center justify-between">
                <span>You can only renew in the last day of your current period. Time left: ${timeLeft}.</span>
                <button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `);
    }

    const cost = settings.renewals.cost;
    let coins = await db.get("coins-" + req.session.userinfo.id);
    coins = coins ? coins : 0;

    if (cost > coins) return res.redirect(`/dashboard` + "?err=CANNOTAFFORDRENEWAL");

    // Deduct the renewal cost
    await db.set("coins-" + req.session.userinfo.id, coins - cost);

    // Calculate the new renewal time
    const newTime = currentRenewalEnd; // Start the new period from the end of the current period
    await db.set(`lastrenewal-${req.query.id}`, newTime);

    // Unsuspend the server
    try {
        const unsuspendResponse = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${req.query.id}/unsuspend`,
            {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    "Authorization": `Bearer ${settings.pterodactyl.key}`
                }
            }
        );

        if (!unsuspendResponse.ok) {
            console.error(`Failed to unsuspend server with ID ${req.query.id}.`);
            return res.send(`Renewal successful, but failed to unsuspend the server. Please contact support.`);
        }

        console.log(`Server with ID ${req.query.id} was successfully renewed and unsuspended.`);
        return res.redirect(`/dashboard` + `?success=RENEWED`);
    } catch (error) {
        console.error(`Error unsuspending server with ID ${req.query.id}:`, error);
        return res.send(`Renewal successful, but an error occurred while unsuspending the server.`);
    }
});


    

    new CronJob(`* * * * *`, () => {
        if (settings.renewals.status) {
            console.log(chalk.cyan("[Xalora]") + chalk.white(" Checking renewal servers... "));
            getAllServers().then(async servers => {
                for (const server of servers) {
                    const id = server.attributes.id
                    const lastRenew = await db.get(`lastrenewal-${id}`)
                    if (!lastRenew) continue

                    if (lastRenew > Date.now()) continue
                    if ((Date.now() - lastRenew) > (settings.renewals.delay * 86400000)) {
                        // Server hasn't paid for renewal and gets suspended
                        let deletionresults = await fetch(
                            settings.pterodactyl.domain + "/api/application/servers/" + id + "/suspend",
                            {
                                method: "post",
                                headers: {
                                    'Content-Type': 'application/json',
                                    "Authorization": `Bearer ${settings.pterodactyl.key}`
                                }
                            }
                        );
                        let ok = await deletionresults.ok;
                        if (ok !== true) continue;
                        console.log(`Server with ID ${id} failed renewal and was suspended.`)
                        
                        
                    }
                }
            })
            console.log(chalk.cyan("[Xalora]") + chalk.white("The renewal check-over is now complete."));
        }
    }, null, true, settings.timezone)
        .start()

};

function msToDaysAndHours(ms) {
    const msInDay = 86400000
    const msInHour = 3600000

    const days = Math.floor(ms / msInDay)
    const hours = Math.round((ms - (days * msInDay)) / msInHour * 100) / 100

    let pluralDays = days === 1 ? '' : 's';
    let pluralHours = hours === 1 ? '' : 's';

    return `${days} day${pluralDays} and ${hours} hour${pluralHours}`
}