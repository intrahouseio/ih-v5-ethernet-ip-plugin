/**
 * Функции разбора и формирования данных
 */
//const plugin = require('ih-plugin-api')();
const util = require('util');
const { Tag, TagGroup, Structure } = require('st-ethernet-ip');

exports.getPolls = getPolls;
exports.getPollArray = getPollArray;

let tagNameArray = [];
this.plugin = {};

async function getPolls(channels, params, tagList, firstStart, plugin) {
    this.plugin = plugin;
    const grouparr = [];
    let group = {};
    let tagObj = {};
    let tagArr = {};
    let tagAlone = {};
    let upsertarr = [];
    let taggroup = new TagGroup();
    let tagscnt = 0;
    let taggroupArr = [];
    if (channels.length > params.connections) {
        maxreadtags = Math.ceil(channels.length / params.connections);
    } else {
        maxreadtags = channels.length;
    }
    if (firstStart) {
        this.plugin.log("Get Taglist from PLC", 1);
        scanning(tagList);
    }

    channels.sort(byorder('nodename'));
    while (channels.length > 0) {
        let chunk = channels.splice(0, maxreadtags);
        const groupchannels = groupBy(chunk, 'nodename');

        //channels.sort(byorder('chan'));
        Object.keys(groupchannels).forEach(key => {
            if (key == 'undefined') {
                groupchannels[key].ref.forEach(item => {
                    let tag = {};
                    if (item.missing == 1 && firstStart) {
                        tagNameArray.forEach(tagname => {
                            if (item.chan.startsWith(tagname)) {
                                upsertarr.push({ id: item.id });
                                if (item.dataType == 'STRING') {
                                    tag = new Structure(item.chan, tagList);
                                    taggroup.add(tag);
                                    tagscnt++;
                                    tagAlone[item.chan] = item.id;
                                } else {
                                    tag = new Tag(item.chan);
                                    taggroup.add(tag);
                                    tagscnt++;
                                    tagAlone[item.chan] = item.id;
                                }
                            }
                        })
                    }
                    if (item.missing == undefined || item.missing == 0) {
                        if (item.dataType == 'STRING') {
                            tag = new Structure(item.chan, tagList);
                            taggroup.add(tag);
                            tagscnt++;
                            tagAlone[item.chan] = item.id;
                        } else {
                            tag = new Tag(item.chan);
                            taggroup.add(tag);
                            tagscnt++;
                            tagAlone[item.chan] = item.id;
                        }
                    }
                    tag.itemid = item.id;
                    if (tagscnt > params.structNum) {
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
                if (groupchannels[key].type == 'STRUCT') {
                    let tag = {};
                    tag = new Structure(key, tagList);
                    tag.parentnodefolder = groupchannels[key].parentnodefolder;
                    taggroup.add(tag);
                    tagscnt++;
                    groupchannels[key].ref.forEach(item => {
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

                if (groupchannels[key].type == 'ARRAY') {
                    let tag = {};
                    tag = new Tag(key, null, null, 0, 1, groupchannels[key].size);
                    tag.parentnodefolder = groupchannels[key].parentnodefolder;
                    taggroup.add(tag);
                    tagscnt++;
                    groupchannels[key].ref.forEach(item => {
                        const index = item.chan.split(/[.[\],]/).filter(segment => segment.length > 0);
                        let memArr = item.chan.split(".");
                        const isBitIndex = (memArr.length > 1) & (memArr[memArr.length - 1] % 1 === 0);
                        if (isBitIndex) {
                            let offset = 0;
                            offset = parseInt(memArr[memArr.length - 1]);
                            if (!tagArr[key]) tagArr[key] = [];
                            tagArr[key].push({ index: Number(index[0]), id: item.id, offset, title: key + "[" + index[0] + "]" + "." + offset });
                        } else {
                            if (!tagArr[key]) tagArr[key] = [];
                            tagArr[key].push({ index: Number(index), id: item.id, title: key + "[" + index + "]" });
                        }

                    });
                }
                if (taggroup.length > 0) {
                    taggroupArr.push(taggroup);
                    tagscnt = 0;
                    taggroup = new TagGroup();
                }
            }
             
        })
        
        if (upsertarr.length > 0) this.plugin.send({ type: "upsertChannels", data: upsertarr });
        group.taggroupArr = taggroupArr;
        group.tagObj = tagObj;
        group.tagArr = tagArr;
        group.tagAlone = tagAlone;
        grouparr.push(group);
        taggroup = new TagGroup();
        tagAlone = {};
        tagArr = {};
        tagObj = {};
        group = {};
    }
    return grouparr

}


function getPollArray(polls) {
    let arr = [];
    /*polls.forEach(item => {
        if (item.curpoll == item.polltimefctr) arr.push(item);
    })*/
    arr = polls.slice(0);
    return arr
}

function groupBy(objectArray, property) {
    return objectArray.reduce(function (acc, obj) {
        let key = obj[property];
        if (!acc[key]) {
            acc[key] = {};
            acc[key].type = obj.nodetype;
            acc[key].size = obj.nodesize;
            acc[key].parentnodefolder = obj.parentnodefolder;
            acc[key].missing = obj.missing;
            acc[key].ref = [];
        }
        acc[key].ref.push(obj);
        return acc;
    }, {});
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

function scanning(tagList) {
    tagList.tags.forEach(tag => {
        if (tag.type && tag.type.structure && tag.type.typeName !== 'STRING') {
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
                if (item.type.structure && item.type.string !== 'STRING') {
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



