/**
 * app.js
 *
 */

const util = require("util");
const tools = require('./tools');
const { Controller, Tag, TagList, TagGroup } = require('st-ethernet-ip');
const Scanner = require("./lib/scanner");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function (plugin) {
  let nextTimer; // таймер поллинга
  let toWrite = []; // Массив команд на запись
  let chanValues = {};
  const PLC = new Controller(false, { unconnectedSendTimeout: 2000 })
  const tagList = new TagList();
  const scanner = new Scanner(plugin);

  let channels = await plugin.channels.get();
  const params = plugin.params.data;


  try {
    await connect(params);
    await PLC.getControllerTagList(tagList);
    this.polls = await tools.getPolls(channels, params, tagList, true);
    this.queue = tools.getPollArray(this.polls);
    sendNext();
  } catch (err) {
    plugin.exit(8, util.inspect(err));
  }

  async function sendNext(single) {
    let isOnce = false;
    if (typeof single !== undefined && single === true) {
      isOnce = true;
    }

    if (toWrite.length) {
      if (toWrite.length > 1) {
        plugin.log(`sendNext: WRITE group = ${util.inspect(toWrite)}`, 2);
        return writeGroup(toWrite);
      } else {
        let item = toWrite.shift()
        plugin.log(`sendNext: WRITE item = ${util.inspect(item)}`, 2);
        return write(item)
      }

    }

    if (this.queue.length <= 0) {
      this.polls.forEach(item => {
        if (item.curpoll < item.polltimefctr) {
          item.curpoll++;
        } else {
          item.curpoll = 1;
        }
      })
      this.queue = tools.getPollArray(this.polls);

    }
    item = this.queue.shift();

    //plugin.log(`sendNext item = ${util.inspect(item)}`, 2);
    if (item) {
      return read(item, !isOnce);
    } else {
      await sleep(params.polldelay || 1);
      setImmediate(() => {
        sendNext();
      });
    }

  }

  function connect(params) {
    return new Promise((resolve, reject) => {
      const { address, slot } = params;
      PLC.connect(address, slot).then(async () => {
        plugin.log("Connected to " + util.inspect(PLC.properties), 1);
        resolve();
      }).catch(err => {
        plugin.log("An error has occured : " + util.inspect(err));
        reject(err);
        plugin.exit();
      })
    });
  }

  async function read(group, allowSendNext) {
    try {
      const res = [];
      let value;
      //plugin.log('group.tagarr ' + util.inspect(group.tagarr, null, 7), 1);
      await PLC.readTagGroup(group.taggroup);
      group.taggroup.forEach((tag) => {
        if (typeof chanValues[tag.name] !== 'object') chanValues[tag.name] = {}
        if (tag.value == true || tag.value == false) {
          value = tag.value == false ? 0 : 1;
        } else {
          value = tag.value;
        }
        if (chanValues[tag.name].value != value) {
          res.push({ id: tag.name, value: value });
          chanValues[tag.name] = { value: value, tag: tag };
        }
      });
      if (res.length > 0) plugin.sendData(res);

    } catch (e) {
      plugin.log('Read error: ' + util.inspect(e), 1);
      if (e.toString().includes("TIMEOUT")) {
        await connect(params);
      } else {
        for (let i = 0; i < group.tagarr.length; i++) {
          const tag = new Tag(group.tagarr[i].chan);
          try {
            await PLC.readTag(tag);
            if (typeof chanValues[tag.name] !== 'object') chanValues[tag.name] = {}
            if (tag.value == true || tag.value == false) {
              value = tag.value == false ? 0 : 1;
            } else {
              value = tag.value;
            }
            if (chanValues[tag.name].value != value) {
              plugin.sendData({ id: tag.name, value: value });
              chanValues[tag.name] = { value: value, tag: tag };
            }
          } catch (e) {
            plugin.log("Removed Tag " + tag.name, 1);
            plugin.send({ type: "removeChannels", data: [{ id: tag.name }] });
          }
        }
        await updateChannels();
      }
    }

    if (toWrite.length || allowSendNext) {
      if (!toWrite.length) {
        await sleep(params.polldelay || 1); // Интервал между запросами
      }
      setImmediate(() => {
        sendNext();
      });
    }
  }

  async function write(data) {
    plugin.log("Data " + util.inspect(data), 2);
    chanValues[data.chan].tag.value = data.value;
    try {
      await PLC.writeTag(chanValues[data.chan].tag);
      plugin.sendData({ id: data.id, value: data.value, chan: data.chan })
    } catch (e) {
      plugin.log('Read error: ' + util.inspect(e), 1);
    }
  }

  async function writeGroup(data) {
    const writegroup = new TagGroup();
    for (let i = 0; i < data.data.length; i++) {
      chanValues[data.data[i].chan].tag.value = data.data[i].value;
      writegroup.add(chanValues[data.data[i].chan].tag);
    }
    await PLC.writeTagGroup(writegroup);
  }


  plugin.onAct(message => {
    //console.log('Write recieve', message);
    plugin.log('ACT data=' + util.inspect(message.data), 1);

    if (!message.data) return;
    message.data.forEach(item => {
      toWrite.push({ id: item.id, value: item.value, chan: item.chan });
    });
    // Попытаться отправить на контроллер
    // Сбросить таймер поллинга, чтобы не случилось наложения
    clearTimeout(nextTimer);
    sendNext();
  });

  plugin.channels.onChange(async () => {
    await updateChannels();
  });

  async function updateChannels() {
    try {

      clearTimeout(nextTimer);
      channels = await plugin.channels.get();
      this.polls = await tools.getPolls(channels, params, tagList, false);
      this.queue = tools.getPollArray(this.polls);
      chanValues = {};
      if (this.queue !== undefined) {
        await sendNext(true);
      }
    } catch (e) {
      plugin.log('ERROR onChange: ' + util.inspect(e), 1);
    }
  }
  // Завершение работы
  function terminate() {
    //client.close();
  }

  process.on('exit', terminate);
  process.on('SIGTERM', () => {
    process.exit(0);
  });

  // --- События плагина ---
  // Сканирование
  plugin.onScan((scanObj) => {
    if (!scanObj) return;
    if (scanObj.stop) {
      //
    } else {
      scanner.request(PLC, scanObj.uuid);
    }
  });

  process.on("SIGTERM", () => {
    plugin.exit();
  });
};

