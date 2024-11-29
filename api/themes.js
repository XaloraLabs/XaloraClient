const fs = require('fs');
const path = require('path');
const settings = require('../settings.json');

module.exports.load = async function (app) {
    // Endpoint to get available themes
    app.get('/api/themes', (req, res) => {
        const themesDir = path.join(__dirname, '../themes');

        fs.readdir(themesDir, { withFileTypes: true }, (err, files) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to read themes directory' });
            }

            const themes = files
                .filter(file => file.isDirectory())
                .map(file => file.name);

            res.json({ themes });
        });
    });

    // Endpoint to set the theme
    app.post('/api/themes/set', (req, res) => {
        const { theme } = req.body;
        const settingsPath = path.join(__dirname, '../settings.json');

        fs.readFile(settingsPath, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to read settings file' });
            }

            const settings = JSON.parse(data);
            settings.theme = theme;

            fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8', (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to update settings file' });
                }
                res.json({ success: true });
            });
        });
    });
};