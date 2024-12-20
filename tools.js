/**
 * Функции разбора и формирования данных
 */
//const plugin = require('ih-plugin-api')();
const util = require('util');
const { Tag, TagGroup, Structure } = require('st-ethernet-ip');

exports.getPolls = getPolls;
exports.getPollArray = getPollArray;

let tagNameArray = [];
let tagSize = {};
let allowStruct = [];
this.plugin = {};

async function getPolls(channels, params, tagList, firstStart, plugin) {
    this.tagList = tagList;
    this.plugin = plugin;
    const grouparr = [];
    let group = {};
    let tagObj = {};
    let tagArr = {};
    let tagAlone = {};
    let upsertarr = [];
    let taggroup = new TagGroup();
    let tagscnt = 0;
    let taggroupsize = 0;
    let taggroupArr = [];
    if (channels.length > params.connections) {
        maxreadtags = Math.ceil(channels.length / params.connections);
    } else {
        maxreadtags = channels.length;
    }
    if (firstStart) {
        plugin.log("Get Taglist from PLC ", 1);
        try {
          scanning(tagList, plugin);
        } catch (e) {
          plugin.log("error " + util.inspect(e), 1);
        }
        
    }
    channels.sort(byorder('nodename'));
    while (channels.length > 0) {
        let chunk = channels.splice(0, maxreadtags);  
        //channels.sort(byorder('chan'));
        const groupchannels = groupBy(chunk, 'nodename', plugin);
        groupchannels.forEach(key => {
            if (key.name == undefined || key.name == '0') {
                key.ref.forEach(item => {
                    let tag = {};
                    if (item.missing == 1 && firstStart) {
                        tagNameArray.forEach(tagname => {
                            if (item.chan.startsWith(tagname)) {
                                upsertarr.push({ id: item.id });
                                if (item.dataType == 'STRING') {
                                    if (item.chan.includes(':')) {
                                      const {program, name} = structProgram(item.chan)
                                      tag = new Structure(String(name), this.tagList, program);
                                    } else {
                                      tag = new Structure(String(item.chan), this.tagList);
                                    }
                                } else {
                                    tag = new Tag(item.chan);
                                }
                                taggroup.add(tag);
                                tagscnt++;
                                if (!tagAlone[item.chan]) tagAlone[item.chan] = [];
                                tagAlone[item.chan].push(item.id);
                            }
                        })
                    }
                    if (item.missing == undefined || item.missing == 0) {
                        if (item.dataType == 'STRING') {
                            if (item.chan.includes(':')) {
                              const {program, name} = structProgram(item.chan)
                              tag = new Structure(String(name), this.tagList, program);
                            } else {
                              tag = new Structure(String(item.chan), this.tagList);
                            }
                        } else {
                            tag = new Tag(item.chan);
                        }
                        taggroup.add(tag);
                        tagscnt++;
                        if (!tagAlone[item.chan]) tagAlone[item.chan] = [];
                        tagAlone[item.chan].push(item.id);
                    }
                    tag.itemid = item.id;
                    if (tagscnt >= 100) {
                      taggroupArr.push(taggroup);
                      tagscnt = 0;
                      taggroup = new TagGroup();
                    }
                })
                  if (taggroup.length > 0) {
                    taggroupArr.push(taggroup);
                    tagscnt = 0;
                    taggroup = new TagGroup(); 
                  }
                 
            } else {
                if (key.type == 'STRUCT') {
                    let tag = {};
                    if (key.name.includes(':')) {
                      const {program, name} = structProgram(key.name)
                      tag = new Structure(String(name), this.tagList, program);
                    } else {
                      tag = new Structure(String(key.name), this.tagList);
                    }
                    
                    tag.parentnodefolder = key.parentnodefolder;
                    tag.ref = key.ref;
                    tag.datatype = key.type;
                    if (taggroupsize + key.size >= 2500 && taggroupsize >0) {
                      taggroupArr.push(taggroup);
                      taggroupsize = 0;
                      taggroup = new TagGroup();
                    } 
                      taggroup.add(tag);
                      if (taggroup.groupName == undefined) taggroup.groupName = [];
                      taggroup.groupName.push(key.name + " " +key.size);
                      taggroupsize += key.size;
                      
                    key.ref.forEach(item => {
                        let memArr = item.chan.split(".");
                        const isBitIndex = (memArr.length > 1) & (memArr[memArr.length - 1] % 1 === 0);
                        if (isBitIndex) {
                            let chan = memArr.slice(0, memArr.length - 1).join('.');
                            let offset = 0;
                            offset = parseInt(memArr[memArr.length - 1]);
                            if (!tagObj[item.nodename + "." + chan]) tagObj[item.nodename + "." + chan] = [];
                            tagObj[item.nodename + "." + chan].push({ id: item.id, offset, title: item.nodename + "." + chan + '.' + offset });
                        } else {
                            if (!tagObj[item.nodename + "." + item.chan]) tagObj[item.nodename + "." + item.chan] = [];
                            tagObj[item.nodename + "." + item.chan].push({ id: item.id, title: item.nodename + "." + item.chan });
                        }
                    })
                }

                if (key.type == 'ARRAY') {
                    let tag = {};
                    if (key.nodeValueType == "STRING") {
                      if (key.name.includes(':')) {
                        const {program, name} = structProgram(key.name)
                        tag = new Structure(name, tagList, program, null, 0, 1, key.size);
                      } else {
                        tag = new Structure(key.name, tagList, null, null, 0, 1, key.size);
                      }
                      
                    } else {
                      tag = new Tag(key.name, null, null, 0, 1, key.size);
                    }
                    tag.parentnodefolder = key.parentnodefolder;
                    tag.ref = key.ref;
                    tag.datatype = key.type;
                    if (taggroup.groupName == undefined) taggroup.groupName = [];
                    taggroup.groupName.push(key.name + " " +key.size);
                    
                    taggroup.add(tag);
                    taggroupArr.push(taggroup);
                    taggroupsize = 0;
                    taggroup = new TagGroup();
                    key.ref.forEach(item => {
                        const index = item.chan.split(/[.[\],]/).filter(segment => segment.length > 0);
                        let memArr = item.chan.split(".");
                        const isBitIndex = (memArr.length > 1) & (memArr[memArr.length - 1] % 1 === 0);
                        if (isBitIndex) {
                            let offset = 0;
                            offset = parseInt(memArr[memArr.length - 1]);
                            if (!tagArr[key.name]) tagArr[key.name] = [];
                            tagArr[key.name].push({ index: Number(index[0]), id: item.id, offset, title: key.name + "[" + index[0] + "]" + "." + offset });
                        } else {
                            if (!tagArr[key.name]) tagArr[key.name] = [];
                            tagArr[key.name].push({ index: Number(index), id: item.id, title: key.name + "[" + index + "]" });
                        }

                    });
                }
                
            }
             
        })
        if (taggroupsize > 0) {
            taggroupArr.push(taggroup);
            taggroup = new TagGroup();
            taggroupsize = 0;
        }
        
        if (upsertarr.length > 0) this.plugin.send({ type: "upsertChannels", data: upsertarr });
        group.taggroupArr = taggroupArr;
        group.tagObj = tagObj;
        group.tagArr = tagArr;
        group.tagAlone = tagAlone;
        grouparr.push(group);
        taggroup = new TagGroup();
        taggroupArr = [];
        tagAlone = {};
        tagArr = {};
        tagObj = {};
        group = {};
    }
    //plugin.log("grouparr " + util.inspect(grouparr, null, 5));
    return grouparr

}

function structProgram(structName) {
  const str = structName.slice(structName.indexOf(":") + 1, structName.length)
  const program = str.slice(0, str.indexOf("."));
  const name = str.slice(str.indexOf(".") + 1, str.length);
  return {program, name}
}

function getPollArray(polls) {
    let arr = [];
    /*polls.forEach(item => {
        if (item.curpoll == item.polltimefctr) arr.push(item);
    })*/
    arr = polls.slice(0);
    return arr
}

function groupBy(objectArray, property, plugin) {
    let acc = {};
    let arr = [];
    objectArray.forEach(obj => {   
        if (obj.nodetype == "STRUCT") checkSize(obj, property, plugin);
        let key = obj[property];  
        if (!acc[key]) {
            acc[key] = {};
            acc[key].name = key;
            acc[key].nodeValueType = obj.nodeValueType;
            acc[key].type = obj.nodetype;
            acc[key].size = obj.nodetype == "STRUCT" ? tagSize[obj.structName] : obj.nodesize;
            acc[key].parentnodefolder = obj.parentnodefolder;
            acc[key].missing = obj.missing;
            acc[key].ref = [];
        }
        acc[key].ref.push(obj);
    })
    Object.keys(acc).forEach(item => {
      arr.push(acc[item]);
    })
    arr.sort(byorder('size'));
    return arr
}

function checkSize(obj, property, plugin) {
  let structName = String(obj[property]);
  if (structName.includes('[')) {
    structName = structName.substring(0, structName.indexOf('['));
  }
  if (structName.includes(':')) {
    const {program, name} = structProgram(structName);
    structName = name;
  }
  //plugin.log("tagSize " + util.inspect(tagSize))
  if (tagSize[structName] > 50000) {
        const index = obj.chan.indexOf('.');  
        obj[property] = obj[property] + '.' + obj.chan.substring(0, index);
        obj.chan = obj.chan.substring(index+1);
        structName = String(obj[property]);
        if (structName.includes('[')) {
          structName = structName.substring(0, structName.indexOf('['));
        }
        obj.structName = structName;
        if (tagSize[structName] > 50000) {
          checkSize(obj, property, plugin);
        }
  } else {
    obj.structName = structName;
  }
}

function byorder(ordernames, direction, parsingInt) {
    var arrForSort = [];
    var dirflag = direction == 'D' ? -1 : 1; // ascending = 1, descending = -1;

    if (ordernames && typeof ordernames == 'string') {
        arrForSort = ordernames.split(',');
    }

    return function (o, p) {
        if (typeof o !== 'object' || typeof p !== 'object' || arrForSort.length === 0) {
            return 0;
        }

        for (let i = 0; i < arrForSort.length; i++) {
            let a;
            let b;
            let name = arrForSort[i];

            a = o[name];
            b = p[name];

            if (a !== b) {
                if (parsingInt) {
                    let astr = String(a);
                    let bstr = String(b);

                    if (!isNaN(parseInt(astr, 10)) && !isNaN(parseInt(bstr, 10))) {
                        return parseInt(astr, 10) < parseInt(bstr, 10) ? -1 * dirflag : 1 * dirflag;
                    }
                }

                // сравним как числа
                if (!isNaN(Number(a)) && !isNaN(Number(b))) {
                    return Number(a) < Number(b) ? -1 * dirflag : 1 * dirflag;
                }

                // одинаковый тип, не числа
                if (typeof a === typeof b) {
                    return a < b ? -1 * dirflag : 1 * dirflag;
                }

                return typeof a < typeof b ? -1 * dirflag : 1 * dirflag;
            }
        }

        return 0;
    };
}

function scanning(tagList, plugin) {
    
    tagList.tags.forEach(tag => {
        if (tag.type.structure && tag.type.typeName != 'STRING' && tag.type.typeName != 'BOOL' ) {
             // plugin.log("Tagname " + tag.name);
              tagSize[tag.name] = tagList.templates[tag.type.code]._attributes.StructureSize;
            fromTemplate(tagList, tag.name, tag.type.code, tag.program);
        } else {
            if (tag.type.typeName) {
                const tagName = getTagName(tag.name, tag.program);
                tagNameArray.push(tagName);
            }
        }
    });
}

function fromTemplate(tagList, parentName, code, program) {
    if (!tagList.templates[code]) return;
    if (!tagList.templates[code]._members) return;
    const members = tagList.templates[code]._members;

    for (let i = 0; i < members.length; i++) {        
        const item = members[i];
        try {
            let name = parentName + '.' + item.name;
            if (item.type) {
                if (item.type.structure && item.type.string !== 'STRING' && item.type.typeName != 'BOOL') {    
                      tagSize[name] = tagList.templates[item.type.code]._attributes.StructureSize; 
                    fromTemplate(tagList, name, String(item.type.code));
                } else {
                    const tagName = getTagName(name, program);
                    tagNameArray.push(tagName);
                }
            }
        } catch (e) {
            this.plugin.log(' item.type.structure ' + util.inspect(item) + util.inspect(e), 1);
        }
    }
}

function getTagName(name, program) {
    return program == null ? name : 'Program:' + program + '.' + name;
}



