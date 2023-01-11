/**
 * app.js
 *
 */

const util = require("util");
const tools = require('./tools');
const { TagList } = require('st-ethernet-ip');
const Client = require("./client");
const Scanner = require("./lib/scanner");


module.exports = async function (plugin) {
  let toWrite = [];
  let allPolls;
  const tagList = new TagList();
  const scanner = new Scanner(plugin);

  let channels = await plugin.channels.get();
  const params = plugin.params.data;

  const clientArr = [];

  let firstClient = null;
  try {
    let firstparams = params;
    firstClient = new Client(plugin, firstparams, 0);
    await firstClient.connect();
    await firstClient.PLC.getControllerTagList(tagList);
    clientArr.push(firstClient);
  } catch (err) {
    plugin.exit(8, 'Failed to connect!');
  }

  allPolls = await tools.getPolls(channels, params, tagList, true);

  for (let i = 1; i <= allPolls.length; i++) {
    try {
      let nextClient = new Client(plugin, params, i);
      clientArr[i] = nextClient;
      await nextClient.connect();
      nextClient.setPolls(allPolls[i - 1]);
      nextClient.sendNext();

    } catch (e) {
      plugin.log('Client ' + i + ' error: ' + util.inspect(e), 1);
    }
  }

  plugin.onAct(async (message) => {
    plugin.log('ACT data=' + util.inspect(message.data), 1);

    if (!message.data) return;
    message.data.forEach(item => {
      toWrite.push({
        id: item.id,
        value: item.value,
        chan: item.chan,
        nodename: item.nodename,
        nodetype: item.nodetype
      });
    });
    await firstClient.writeGroup(toWrite);
    toWrite = [];

  });

  plugin.channels.onChange(async () => {
    channels = await plugin.channels.get();
    allPolls = await tools.getPolls(channels, params, tagList, false);
    for (let i = 1; i <= allPolls.length; i++) {
      try {
        if (clientArr[i] != undefined) {
          clientArr[i].setPolls(allPolls[i - 1]);
        } else {
          let nextClient = new Client(plugin, params, i);
          clientArr[i] = nextClient;
          await nextClient.connect();
          nextClient.setPolls(allPolls[i - 1]);
          nextClient.sendNext();
          plugin.log("Client ID " + i, 1);
        }

      } catch (e) {
        plugin.log('Client ' + i + ' error: ' + util.inspect(e));
      }
    }
  });

  // Завершение работы
  async function terminate() {
    for (let i = 0; i < clientArr.length; i++) {
      plugin.log(await clientArr[i].PLC.disconnect());
    }
    plugin.exit();
  }

  //process.on('exit', terminate);
  process.on('SIGTERM', async () => {
    for (let i = 0; i < clientArr.length; i++) {
      await clientArr[i].PLC.disconnect();
    }
    plugin.exit();
  });

  // --- События плагина ---
  // Сканирование
  plugin.onScan((scanObj) => {
    if (!scanObj) return;
    if (scanObj.stop) {
      //
    } else {
      // Сканировать через первый сокет?
      if (firstClient && firstClient.PLC) {
        scanner.request(firstClient.PLC, scanObj.uuid);
      }
    }
  });

  /* process.on("SIGTERM", () => {
     plugin.exit();
   });*/
};

