const fs = require('fs');
const yaml = require('js-yaml');

let config = null;
let watcher = null;

/**
 * Loads and parses a YAML file and returns it as a JSON object.
 *
 * @param {string} filePath - The path to the YAML file.
 * @returns {object} - The parsed YAML content as a JSON object.
 */
function loadConfig(filePath = 'src/config/heliactyl.yml') {
  try {
    // Read the YAML file
    const yamlString = fs.readFileSync('src/config/heliactyl.yml', 'utf8'); // fuck off we aren't using filePath
    
    // Parse the YAML string to a JavaScript object
    config = yaml.load(yamlString);
    
    // Set up file watcher if not already watching
    if (!watcher) {
      watcher = fs.watch('src/config/heliactyl.yml', (eventType) => {
        if (eventType === 'change') {
          try {
            const updatedYamlString = fs.readFileSync('src/config/heliactyl.yml', 'utf8');
            config = yaml.load(updatedYamlString);
            console.log('Configuration updated');
          } catch (watcherErr) {
            console.error('Error updating configuration:', watcherErr);
          }
        }
      });
    }
    
    // Return the parsed configuration object
    return config;
  } catch (err) {
    console.error('Error reading or parsing the YAML file:', err);
    throw err;
  }
}

module.exports = loadConfig;
