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
  let writeTagObj = {};
  const tagList = new TagList();
  const scanner = new Scanner(plugin);

  let channels = await plugin.channels.get();
  plugin.log('Received channels data: '+util.inspect(channels), 2);
  const params = plugin.params.data;

  const clientArr = [];

  let firstClient = null;
  let firstClientStatus = "";
  try {
    let firstparams = params;
    firstClient = new Client(plugin, firstparams, 0);
    firstClientStatus = await firstClient.connect();
    await firstClient.PLC.getControllerTagList(tagList);
    firstClientStatus = await firstClient.PLC.disconnect();
    plugin.log("Client 0 " + firstClientStatus, 2);
    
  } catch (err) {
    plugin.sendLog('Failed to connect!');
    plugin.exit(8, 'Failed to connect!');
  }
  try {
    allPolls = await tools.getPolls(channels, params, tagList, true, plugin);
  } catch (e) {
    plugin.sendLog('error: ' + util.inspect(e));
    plugin.log('error: ' + util.inspect(e), 1);
  }
  
  for (let i = 1; i <= allPolls.length; i++) {
    try {
      let nextClient = new Client(plugin, params, i, tagList, writeTagObj);
      clientArr[i] = nextClient;
      await nextClient.connect();
      nextClient.setPolls(allPolls[i-1]);
      nextClient.sendNext();

    } catch (e) {
      plugin.sendLog('Client ' + i + ' error: ' + util.inspect(e));
      plugin.log('Client ' + i + ' error: ' + util.inspect(e), 1);
    }
  }

  plugin.onAct(async (message) => {
    plugin.log('ACT data=' + util.inspect(message.data), 1);
    
    if (!message.data) return;
    /*message.data.forEach(item => {
      toWrite.push({
        id: item.id,
        value: item.value,
        chan: item.chan,
        nodename: item.nodename,
        nodetype: item.nodetype,
        dataType: item.dataType
      });
    });*/
    clientArr[1].setWrite(message.data);
    //toWrite = [];

  });

  plugin.channels.onChange(async () => {
    channels = await plugin.channels.get();
    allPolls = await tools.getPolls(channels, params, tagList, false);
    for (let i = 1; i <= allPolls.length; i++) {
      try {
        if (clientArr[i] != undefined) {
          clientArr[i].setPolls(allPolls[i-1]);
        } else {
          let nextClient = new Client(plugin, params, i);
          clientArr[i] = nextClient;
          await nextClient.connect();
          nextClient.setPolls(allPolls[i-1]);
          nextClient.sendNext();
          plugin.log("Client ID " + i, 1);
        }

      } catch (e) {
        plugin.sendLog('Client ' + i + ' error: ' + util.inspect(e));
        plugin.log('Client ' + i + ' error: ' + util.inspect(e), 1);
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
  plugin.onScan(async (scanObj) => {
    if (!scanObj) return;
    if (scanObj.stop) {
      //
      
      firstClientStatus = await firstClient.PLC.disconnect();
      plugin.log("Client 0 " + firstClientStatus, 2);
    } else {
      // Сканировать через первый сокет?
      if (firstClientStatus == "disconnected") {
        firstClientStatus = await firstClient.connect();
      }
      scanner.request(firstClient.PLC, scanObj.uuid);
    }
  });

  /* process.on("SIGTERM", () => {
     plugin.exit();
   });*/
};

