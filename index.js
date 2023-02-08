/**
 * ethernetip index.js
 */
const util = require('util');

//const plugin = require('ih-plugin-api')();
const app = require('./app');

(async () => {
  let plugin;
  try {
    // Получить параметры 
    const opt = getOptFromArgs();
    const pluginapi = opt && opt.pluginapi ? opt.pluginapi : 'ih-plugin-api';
    plugin = require(pluginapi+'/index.js')();
    plugin.log('Plugin Ethernet/IP client has started.', 0);

    plugin.params.data = await plugin.params.get();
    plugin.log('Received params data:'+util.inspect(plugin.params.data));

    // Получить каналы 
    //plugin.channels.data = await plugin.channels.get();
    
    app(plugin);
  } catch (err) {
    plugin.exit(8, `Error: ${util.inspect(err)}`);
  }
})();

function getOptFromArgs() {
  let opt;
  try {
    opt = JSON.parse(process.argv[2]); 
  } catch (e) {
    opt = {};
  }
  return opt;
}