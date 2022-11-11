/**
 * Функции разбора и формирования данных
 */
const plugin = require('ih-plugin-api')();
const util = require('util');
const { Tag, TagGroup, Structure } = require('st-ethernet-ip');

exports.getPolls = getPolls;
exports.getPollArray = getPollArray;


function getPolls(channels, params, taglist) {
    let group = {};
    const grouparr = [];
    let taggroup = new TagGroup();
    let tagarr = [];
    const grooupArr = groupBy(channels, 'polltimefctr');
    Object.keys(grooupArr).forEach(key => {
        while (grooupArr[key].length > 0) {
            let chunk = grooupArr[key].splice(0, params.maxreadtags);    
            chunk.forEach(item => {    
                if (item.dataType == 'STRING') {
                    taggroup.add(new Structure(item.chan, taglist));
                    tagarr.push({ id: item.id, chan: item.chan });
                } else {
                    taggroup.add(new Tag(item.chan));
                    tagarr.push({ id: item.id, chan: item.chan });
                }    
            })
            group.taggroup = taggroup;
            group.tagarr = tagarr;
            group.polltimefctr = Number(key),
            group.curpoll = 1,
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





