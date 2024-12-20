
const util = require("util");
const { Controller, Tag, Structure, TagGroup, EthernetIP } = require('st-ethernet-ip');

const tools = require('./tools');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Client {
  constructor(plugin, params, idx, tagList, writeTagObj) {
    this.plugin = plugin;
    this.params = params;
    this.idx = idx;
    this.polls = [];
    this.queue = [];
    this.chanValues = {};
    this.toWrite = [];
    this.objArray = [];
    this.tagList = tagList;
    this.writeTagObj = writeTagObj;

    this.PLC = new Controller(this.idx > 0);
  }
  isObject = obj => {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
  }
  //Преобразует объект в массив объектов
  obj2arr(obj, parentname) {
    let name = '';
    if (this.isObject(obj)) {
      Object.keys(obj).forEach(key => {
        if (this.isObject(obj[key])) {
          name = parentname == '' || parentname == undefined ? key : parentname + '.' + key;
          this.obj2arr(obj[key], name);
        } else if (Array.isArray(obj[key])) {
          obj[key].forEach((item, index) => {
            name = parentname == '' || parentname == undefined ? key : parentname + '.' + key + '[' + index + ']';
            this.obj2arr(item, name);
          })
        } else {
          this.objArray.push({ chan: parentname + '.' + key, value: obj[key] })
        }
      })
    } else {
      this.objArray.push({ chan: parentname, value: obj })
    }

  }

  connect() {

    return new Promise((resolve, reject) => {
      const { address, slot } = this.params;
      this.PLC.connect(address, slot)
        .then(() => {
          this.plugin.log('Client ' + this.idx + ' connected to ' + util.inspect(this.params.address), 1);
          resolve("connected");
        })
        .catch(err => {
          this.plugin.log('Client ' + this.idx + ' An error has occured : ' + util.inspect(err), 1);
          this.plugin.exit();
          reject(err);
        });
    });
  }

  setPolls(polls) {
    this.polls = polls;
    this.chanValues = {};
  }

  setWrite(polls) {
    this.toWrite.push(...polls);
  }

  async sendNext(single) {
    let isOnce = false;
    if (typeof single !== undefined && single === true) {
      isOnce = true;
    }

    if (this.toWrite.length > 0) {
      await this.writeGroup();
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
    //this.plugin.log("Read " + util.inspect(tag.value, null, 4))
    let value;
    let res = [];
    //Value Object
    if (this.isObject(tag.value)) {
      this.writeTagObj[tag.state.tag.name] = tag;
      this.objArray = [];
      this.obj2arr(tag.value, tag.name);
      this.objArray.forEach(item => {
        if (group.tagObj[item.chan] != undefined) {
          group.tagObj[item.chan].forEach(ref => {
            if (ref.offset == undefined) {
              if (typeof item.value === 'boolean') {
                value = item.value == false ? 0 : 1;
              } else if (typeof item.value === 'bigint'){
                value = Number(item.value);
              } else {
                value = item.value;
              }
            } else {
              value = item.value & (1 << ref.offset) ? 1 : 0;
            }
            if (this.chanValues[ref.id] != value) {
              res.push({ id: ref.id, value, title: ref.title, chstatus: 0 });
              this.chanValues[ref.id] = value;
            }
          })
        }
      })
      //Value Array
    } else if (Array.isArray(tag.value)) {
      if (group.tagArr[tag.name] != undefined) {
        group.tagArr[tag.name].forEach(ref => {
          if (ref.offset == undefined) {
            if (ref.index < tag.value.length) {
              if (typeof tag.value[ref.index] === 'boolean') {
                value = tag.value[ref.index] == false ? 0 : 1;
              } else if (typeof tag.value[ref.index] === 'bigint') {
                value = Number(tag.value[ref.index]);
              } else {
                value = tag.value[ref.index];
              }
            }
          } else {
            value = tag.value[ref.index] & (1 << ref.offset) ? 1 : 0;
          }
          if (this.chanValues[ref.id] != value) {
            res.push({ id: ref.id, value, title: ref.title, chstatus: 0 });
            this.chanValues[ref.id] = value;
          }
        })
      }
    } else {
      if (typeof tag.value === 'boolean') {
        value = tag.value == false ? 0 : 1;
      } else if (typeof tag.value === 'bigint') {
        value = Number(tag.value);
      } else {
        value = tag.value;
      }
      if (this.chanValues[group.tagAlone[tag.name]] != value) {
          group.tagAlone[tag.name].forEach(item => {
            res.push({ id: item, value, title: tag.name, chstatus: 0 });
            this.chanValues[group.tagAlone[tag.name]] = value;
          })
          
      }
    }
    
    return res;
  }

  async read(group, allowSendNext) {
    let res = [];
    let j;
    try {
      for (j = 0; j < group.taggroupArr.length; j++) {
        //this.plugin.log("Start read " + j + " length " + group.taggroupArr[j].length + " idx " + this.idx, 2);
        await this.PLC.readTagGroup(group.taggroupArr[j]);
        group.taggroupArr[j].forEach(tag => {
          res.push(...this.parseTagValue(tag, group));
        });
        //this.plugin.log("Stop read " + j + " idx " + this.idx, 2);
      }

      if (res.length > 0) this.plugin.sendData(res);
    } catch (e) {
      let remarr = [];
      let tagarr = [];
      this.plugin.log('Read group error: ' + util.inspect(e), 1);
      this.plugin.sendLog('Read group error: ' + util.inspect(e));
      if (e.toString().includes('TIMEOUT')) {
        await this.connect();
      } else {
        group.taggroupArr.forEach(group => {
          group.forEach(item => {
            tagarr.push(item);
          })
        })
        for (let i = 0; i < tagarr.length; i++) {
          const tag = tagarr[i];
          try {
            await this.PLC.readTag(tag);
            res.push(...this.parseTagValue(tag, group));
          } catch (err) {
            this.plugin.log('Removed Tag ' + tag.name, 1);
            this.plugin.sendLog('Read tag error: ' + util.inspect(err));
            this.plugin.sendLog('Removed Tag ' + tag.name);
            this.polls.taggroupArr[j].remove(tag);
            if (this.polls.taggroupArr[j].length == 0) this.polls.taggroupArr.splice(j, 1);
            if (tag.itemid) {
              remarr.push({ id: tag.itemid });
              res.push({ id: tag.itemid, chstatus: 1 });
            } else {
              remarr.push({ parentnodefolder: tag.parentnodefolder });
              tag.ref.forEach(item => {
                res.push({ id: item.id, chstatus: 1 });
              })
            }

          }
        }
        if (res.length > 0) this.plugin.sendData(res);
        if (this.polls.taggroupArr.length == 0) this.plugin.exit();
        //this.plugin.send({ type: 'removeChannels', data: remarr });
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
    //this.plugin.log('Data ' + util.inspect(data), 2);
    this.chanValues[data.chan].tag.value = data.value;
    try {
      await this.PLC.writeTag(this.chanValues[data.chan].tag);
      this.plugin.sendData({ id: data.id, value: data.value, chan: data.chan });
    } catch (e) {
      this.plugin.log('Write error: ' + util.inspect(e), 1);
    }
  }
  structProgram(structName) {
    const str = structName.slice(structName.indexOf(":") + 1, structName.length)
    const program = str.slice(0, str.indexOf("."));
    const name = str.slice(str.indexOf(".") + 1, str.length);
    return {program, name}
  }
  async writeGroup() {
    
    let group = new TagGroup();
    let tag = {};
    let taggroupArr = [];
    let arrCnt = 0;
    for (let i = 0; i < this.toWrite.length; i++) {
      if (this.toWrite[i].nodename != undefined && this.toWrite[i].nodename != 0) {
        if (this.toWrite[i].nodetype == "ARRAY") {
          const fullname = this.toWrite[i].nodename + this.toWrite[i].chan;
          if (this.toWrite[i].dataType == 'STRING') {
            if (fullname.includes(':')) {
              const {program, name} = this.structProgram(fullname);
              tag = new Structure(String(name), this.tagList, program);
            } else {
              tag = new Structure(String(fullname), this.tagList);
            }
          } else {
            tag = new Tag(this.toWrite[i].nodename + this.toWrite[i].chan, null, EthernetIP.CIP.DataTypes.Types[this.toWrite[i].dataType]);
          }
        }
        if (this.toWrite[i].nodetype == "STRUCT") {
          const fullname = this.toWrite[i].nodename + "." + this.toWrite[i].chan;
          if (this.toWrite[i].dataType == 'STRING') {
            if (fullname.includes(':')) {
                const {program, name} = this.structProgram(fullname);
                tag = new Structure(String(name), this.tagList, program);
            } else {
                tag = new Structure(String(fullname), this.tagList);
            }
          } else {
            tag = new Tag(fullname, null, EthernetIP.CIP.DataTypes.Types[this.toWrite[i].dataType]);
          }
        }
      } else if (this.toWrite[i].dataType == 'STRING') {
          if (this.toWrite[i].chan.includes(':')) {
              const {program, name} = this.structProgram(this.toWrite[i].chan)
              tag = new Structure(String(name), this.tagList, program);
          } else {
              tag = new Structure(this.toWrite[i].chan, this.tagList);
          }
      } else {
        tag = new Tag(this.toWrite[i].chan, null, EthernetIP.CIP.DataTypes.Types[this.toWrite[i].dataType]);
      }
      if (this.toWrite[i].dataType == 'STRING') {
        tag.value = String(this.toWrite[i].value);
      } else if (this.toWrite[i].dataType == 'LINT' || this.toWrite[i].dataType == 'LWORD'){
        tag.value = BigInt(this.toWrite[i].value);
      } else {
        tag.value = this.toWrite[i].value;
      }
      group.add(tag);
    }
    
    try {
      await this.PLC.writeTagGroup(group);
      this.toWrite = [];
    } catch (e) {
      this.plugin.sendLog('Write error: ' + util.inspect(e));
      this.plugin.log('Write error: ' + util.inspect(e), 1);
      this.toWrite = [];
    }

  }
}

module.exports = Client;
