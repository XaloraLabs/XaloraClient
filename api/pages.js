// Imports nécessaires
const settings = require("../settings.json");
const indexjs = require("../index.js");
const ejs = require("ejs");
const express = require("express");
const fetch = require('node-fetch');

module.exports.load = async (app, db) => {
  app.all("/", async (req, res) => {
    // Vérification de la session utilisateur
    if (req.session.pterodactyl && req.session.pterodactyl.id !== await db.get("users-" + req.session.userinfo.id)) {
      return res.redirect("/login?prompt=none");
    }

    const theme = indexjs.get(req);

    // Vérification des permissions
    if (theme.settings.mustbeloggedin.includes(req._parsedUrl.pathname) && (!req.session.userinfo || !req.session.pterodactyl)) {
      return res.redirect("/login");
    }

    // Gestion des pages admin
    if (theme.settings.mustbeadmin.includes(req._parsedUrl.pathname)) {
      return renderPage(req, res, theme, db, theme.settings.notfound);
    }


    // Affichage de la page principale
    return renderPage(req, res, theme, db, theme.settings.index);
  });

  app.use('/assets', express.static('./assets'));
};


const renderPage = async (req, res, theme, db, template) => {
    try {
      const renderData = await eval(indexjs.renderdataeval);
      const str = await ejs.renderFile(`./themes/${theme.name}/${template}`, renderData);
      delete req.session.newaccount;
      res.send(str);
    } catch (err) {
      console.log(`[WEBSITE] Erreur sur le chemin ${req._parsedUrl.pathname} :`, err);
      res.send("Une erreur est survenue. Veuillez contacter un administrateur.");
    }
};
