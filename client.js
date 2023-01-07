
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
    this.objArray = [];

    this.PLC = new Controller(false);
  }
  isObject = obj => {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
  }

  obj2arr(obj, parentname) {
    let name = '';
    Object.keys(obj).forEach(key => {
      if (this.isObject(obj[key])) {
        name = parentname == '' || parentname == undefined ? key : parentname + '.' + key;
        this.obj2arr(obj[key], name);
      } else {
        this.objArray.push({ chan: parentname + '.' + key, value: obj[key] })
      }
    })
  }

  connect() {
    return new Promise((resolve, reject) => {
      const { address, slot } = this.params;
      this.PLC.connect(address, slot)
        .then(() => {
          this.plugin.log('Client ' + this.idx + ' connected to ' + util.inspect(this.params.address), 1);
          resolve();
        })
        .catch(err => {
          this.plugin.log('Client ' + this.idx + ' An error has occured : ' + util.inspect(err));
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

  parseTagValue(tag, group) {
    let value;
    let res = [];
    //Value Object
    if (this.isObject(tag.value)) {
      this.objArray = [];
      this.obj2arr(tag.value, tag.name);
      this.objArray.forEach(item => {
        if (group.tagObj[item.chan] != undefined) {
          if (typeof item.value === 'boolean') {
            value = item.value == false ? 0 : 1;
          } else {
            value = item.value;
          }
          if (this.chanValues[group.tagObj[item.chan]] != value) {
            res.push({ id: group.tagObj[item.chan], value });
            this.chanValues[group.tagObj[item.chan]] = value;
          }
        }
      })
      //Value Array
    } else if (Array.isArray(tag.value)) {
      if (group.tagArr[tag.name] != undefined) {
        Object.keys(group.tagArr[tag.name]).forEach(key => {
          if (Number(key) < tag.value.length) {
            value = tag.value[Number(key)];
            if (this.chanValues[group.tagArr[tag.name] + key] != value) {
              res.push({ id: group.tagArr[tag.name][key], value });
              this.chanValues[group.tagArr[tag.name] + key] = value;
            }
          }
        })
      }
      //Value Boolean Tag
    } else if (typeof tag.value === 'boolean') {
      value = tag.value == false ? 0 : 1;
      if (this.chanValues[group.tagObj[tag.name]] != value) {
        res.push({ id: group.tagObj[tag.name], value });
        this.chanValues[group.tagObj[tag.name]] = value;
      }
      //Value Tag
    } else {
      value = tag.value;
      if (this.chanValues[group.tagObj[tag.name]] != value) {
        res.push({ id: group.tagObj[tag.name], value });
        this.chanValues[group.tagObj[tag.name]] = value;
      }
    }
    return res;
  }

  async read(group, allowSendNext) {
    let res = [];
    try {
      this.plugin.log('Read taggroup start', 1);
      await this.PLC.readTagGroup(group.taggroup);
      this.plugin.log('Read taggroup end', 1);
      group.taggroup.forEach(tag => {
        res.push(...this.parseTagValue(tag, group));
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
            res.push(...this.parseTagValue(tag, group));
          } catch (e) {
            this.plugin.log('Removed Tag ' + tag.name, 1);
            this.polls.taggroup.remove(tag);
            remarr.push({ id: tag.name });
          }
        }
        if (res.length > 0) this.plugin.sendData(res);
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
    let tag = {};
    for (let i = 0; i < data.length; i++) {
      if (data[i].nodename != undefined) {
        if (data[i].nodetype == "ARRAY") tag = new Tag(data[i].nodename + data[i].chan);
        if (data[i].nodetype == "STRUCT") tag = new Tag(data[i].nodename + '.' + data[i].chan);
      } else {
        tag = new Tag(data[i].chan);
      } 
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
