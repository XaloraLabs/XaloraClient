
const settings = require("../settings.json");
const indexjs = require("../index.js");
const fs = require("fs");
const ejs = require("ejs");
const fetch = require("node-fetch");
const NodeCache = require("node-cache");
const log = require("../misc/log.js");
const crypto = require('crypto')

const myCache = new NodeCache({ deleteOnExpire: true, stdTTL: 59 });

/* Ensure platform release target is met */
/* Module */
module.exports.load = async function (app, db) {
    // Create a referral code
    app.post("/referral/create", async (req, res) => {
        if (!req.session.pterodactyl) return res.redirect(`/login`);

        const userId = req.session.userinfo.id;
        const code = crypto.randomBytes(8).toString("hex");
        let referrals = await db.get('referrals-' + req.session.userinfo.id) || [];

        await db.set(`referral-code-${code}`, { creator: userId, uses: 0 });
        referrals.push({
            code: code,
            uses: 0
        })

        await db.set('referrals-' + req.session.userinfo.id, referrals);
        res.json({ code: code });
    });

    // Claim a referral code
    app.post("/referral/claim", async (req, res) => {
        if (!req.session.pterodactyl) return res.redirect(`/login`);
        if (!req.body.code) return res.json({ error: "No code provided" });

        const referralData = await db.get(`referral-code-${req.body.code}`);
        if (!referralData) return res.json({ error: "Invalid code" });

        const userId = req.session.userinfo.id;

        if (referralData.creator == userId) return res.json({ error: "You can't claim your own referral code" });

        const alreadyClaimed = await db.get(`referral-claimed-${userId}`);
        if (alreadyClaimed) return res.json({ error: "Already claimed a referral code" });

        await db.set(`referral-claimed-${userId}`, req.body.code);
        await db.set(`referral-code-${req.body.code}`, { ...referralData, uses: referralData.uses + 1 });

        const creatorCoins = await db.get(`coins-${referralData.creator}`) || 0;
        await db.set(`coins-${referralData.creator}`, creatorCoins + 100);

        const claimerCoins = await db.get(`coins-${userId}`) || 0;
        await db.set(`coins-${userId}`, claimerCoins + 250);

        res.json({ success: true });
    });

    // List user's referral codes
    app.get("/referral/list", async (req, res) => {
        if (!req.session.pterodactyl) return res.redirect(`/login`);

        const userId = req.session.userinfo.id;
        const referrals = await db.get('referrals-' + userId);

        res.json({ referrals });
    });

    // Get details of a specific referral code
    app.get("/referral/:code", async (req, res) => {
        if (!req.session.pterodactyl) return res.redirect(`/login`);

        const referralData = await db.get(`referral-code-${req.params.code}`);
        if (!referralData) return res.json({ error: "Invalid code" });

        res.json({ code: req.params.code, uses: referralData.uses, creator: referralData.creator });
    });
};
