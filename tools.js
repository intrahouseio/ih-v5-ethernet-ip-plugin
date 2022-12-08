/**
 * Функции разбора и формирования данных
 */
const plugin = require('ih-plugin-api')();
const util = require('util');
const { Tag, TagGroup, Structure } = require('st-ethernet-ip');

exports.getPolls = getPolls;
exports.getPollArray = getPollArray;

let tagNameArray = [];

async function getPolls(channels, params, tagList, firstStart) {
    let group = {};
    const grouparr = [];
    let tagarr = [];
    let taggroup = new TagGroup();

    if (firstStart) {
        plugin.log("Get Taglist from PLC", 1);
        scanning(tagList);
    }
    channels.sort(byorder('chan,polltimefctr'));
    const grooupArr = groupBy(channels, 'polltimefctr');
    Object.keys(grooupArr).forEach(key => {
        while (grooupArr[key].length > 0) {
            let chunk = grooupArr[key].splice(0, params.maxreadtags);
            chunk.forEach(item => {
                 if (item.missing == 1 && firstStart) {
                     tagNameArray.forEach(tagname => {
                         if (item.chan.startsWith(tagname)) {
                             plugin.send({ type: "upsertChannels", data: [{ id: item.id }] });
                             if (item.dataType == 'STRING') {
                                 taggroup.add(new Structure(item.chan, tagList));
                                 tagarr.push({ id: item.id, chan: item.chan });
                             } else {
                                 taggroup.add(new Tag(item.chan));
                                 tagarr.push({ id: item.id, chan: item.chan });
                             }
                         }
                     })
                 }
                if (item.missing == undefined || item.missing == 0) {
                    if (item.dataType == 'STRING') {
                        taggroup.add(new Structure(item.chan, tagList));
                        tagarr.push({ id: item.id, chan: item.chan });
                    } else {
                        taggroup.add(new Tag(item.chan));
                        tagarr.push({ id: item.id, chan: item.chan });
                    }
                }
            })
            group.taggroup = taggroup;
            group.tagarr = tagarr;
            group.polltimefctr = Number(key);
            group.curpoll = 1;
            grouparr.push(group);
            taggroup = new TagGroup();
            tagarr = [];
            group = {};
        }
    })

    return grouparr
}


function getPollArray(polls) {
    let arr = [];
    polls.forEach(item => {
        if (item.curpoll == item.polltimefctr) arr.push(item);
    })
    return arr
}

const groupBy = (items, key) => items.reduce(
    (result, item) => ({
        ...result,
        [item[key]]: [
            ...(result[item[key]] || []),
            item,
        ],
    }),
    {},
);


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
            plugin.log(' item.type.structure ' + util.inspect(item) + util.inspect(e), 1);
        }
    }
}

function getTagName(name, program) {
    return program == null ? name : 'Program:' + program + '.' + name;
}



