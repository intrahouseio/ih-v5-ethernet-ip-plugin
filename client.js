
const util = require("util");
const { Controller, Tag, TagGroup } = require('st-ethernet-ip');

const tools = require('./tools');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Client {
  constructor(plugin, params, idx) {
    this.plugin = plugin;
    this.params = params;
    this.idx = idx;
    this.polls = [];
    this.queue = [];
    this.chanValues = {};
    this.toWrite = [];
    
    this.PLC = new Controller(false, { unconnectedSendTimeout: 2000 });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const { address, slot } = this.params;
      this.PLC.connect(address, slot)
        .then(() => {
          this.plugin.log('Client '+this.idx+' connected to ' + util.inspect(this.params.address), 1);
          resolve();
        })
        .catch(err => {
          this.plugin.log('Client '+this.idx+' An error has occured : ' + util.inspect(err));
          this.plugin.exit();
          reject(err);
        });
    });
  }

  setPolls(polls) {
    this.polls = polls;
    this.chanValues = {};
  }

  async sendNext(single) {
    let isOnce = false;
    if (typeof single !== undefined && single === true) {
      isOnce = true;
    }
    const item = this.polls;

    if (item) {
      return this.read(item, !isOnce);
    } else {
      await sleep(this.params.polldelay || 1);
      setImmediate(() => {
        this.sendNext();
      });
    }
  }

  async read(group, allowSendNext) {
    try {
      const res = [];
      let value;
      await this.PLC.readTagGroup(group.taggroup);
      group.taggroup.forEach(tag => {
        if (typeof this.chanValues[tag.name] !== 'object') this.chanValues[tag.name] = {};
        if (tag.value == true || tag.value == false) {
          value = tag.value == false ? 0 : 1;
        } else {
          value = tag.value;
        }
        if (this.chanValues[tag.name].value != value) {
          res.push({ id: tag.name, value: value });
          this.chanValues[tag.name] = { value: value, tag: tag };
        }
      });
      if (res.length > 0) this.plugin.sendData(res);
    } catch (e) {
      let remarr = [];
      let tagarr = [];
      this.plugin.log('Read error: ' + util.inspect(e), 1);
      if (e.toString().includes('TIMEOUT')) {
        await this.connect();
      } else {
        group.taggroup.forEach(item => {
            tagarr.push(item);
        })
        for (let i = 0; i < tagarr.length; i++) {
          const tag = tagarr[i];
          try {
            await this.PLC.readTag(tag);
            if (typeof this.chanValues[tag.name] !== 'object') this.chanValues[tag.name] = {};
            if (tag.value == true || tag.value == false) {
              value = tag.value == false ? 0 : 1;
            } else {
              value = tag.value;
            }
            if (this.chanValues[tag.name].value != value) {
              this.plugin.sendData({ id: tag.name, value: value });
              this.chanValues[tag.name] = { value: value, tag: tag };
            }
          } catch (e) {
            this.plugin.log('Removed Tag ' + tag.name, 1);
            this.polls.taggroup.remove(tag);
            remarr.push({ id: tag.name });            
          }
        }
        this.plugin.send({ type: 'removeChannels', data: remarr });
      }
    }
    await sleep(this.params.polldelay || 1);
    if (allowSendNext) {
      setImmediate(() => {
        this.sendNext();
      });
    }
  }

  async write(data) {
    this.plugin.log('Data ' + util.inspect(data), 2);
    this.chanValues[data.chan].tag.value = data.value;
    try {
      await this.PLC.writeTag(this.chanValues[data.chan].tag);
      this.plugin.sendData({ id: data.id, value: data.value, chan: data.chan });
    } catch (e) {
      this.plugin.log('Read error: ' + util.inspect(e), 1);
    }
  }

  async writeGroup(data) {
    this.plugin.log('Data ' + util.inspect(data), 2);
    const group = new TagGroup();
    for (let i = 0; i < data.length; i++) {
        const tag = new Tag(data[i].chan);
        tag.value = data[i].value;
        group.add(tag);
    }
    try {
        await this.PLC.readTagGroup(group);
        await this.PLC.writeTagGroup(group);
    } catch (e) {
        this.plugin.log('Write error: ' + util.inspect(e), 1);
    }
    
  }
}

module.exports = Client;
