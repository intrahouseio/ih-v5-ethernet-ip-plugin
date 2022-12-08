/**
 * scanner.js
 *  Сканирование узлов для показа их в виде дерева
 */

const util = require('util');
const { TagList } = require('st-ethernet-ip');
/**
 * scanner.js
 *  Сканирование узлов для показа их в виде дерева
 */

class Scanner {
  constructor(plugin) {
    this.plugin = plugin;
    this.tagList = new TagList();
  }

  async request(session, uuid) {
    await session.getControllerTagList(this.tagList);
    //this.tagList = taglist;
    const root = session.properties.name + ' slot ' + session.properties.slot;
    this.scanArray = [{ id: root, title: root, parentId: '' }];
    this.scanning();
    this.sendTree(uuid);
  }

  scanning() {

    let parentId = this.scanArray[0].id;
    this.tagList.tags.forEach(tag => {
      if (tag.type && tag.type.structure && tag.type.typeName !== 'STRING') {
        const branch = { parentId, id: tag.id + tag.program, title: tag.name };
        this.scanArray.push(branch);
        this.fromTemplate(tag.id + tag.program, tag.name, tag.type.code, tag.program);
      } else {
        if (tag.type.typeName) {
          const leaf = this.getLeaf(parentId, tag.id + tag.program, tag.name, tag.program, tag.type.typeName, tag.type.arrayDims);
          this.scanArray.push(leaf);
        }
      }
    });
  }

  fromTemplate(parentId, parentName, code, program) {
    if (!this.tagList.templates[code]) return;
    if (!this.tagList.templates[code]._members) return;
    const members = this.tagList.templates[code]._members;

    for (let i = 0; i < members.length; i++) {
      const item = members[i];
      try {
        let id = parentName + '.' + item.name;
        let name = parentName + '.' + item.name;
        if (item.type) {
          if (item.type.structure && item.type.string !== 'STRING') {
            const branch = { parentId, id, title: name };
            this.scanArray.push(branch);
            this.fromTemplate(id, name, String(item.type.code));
          } else {
            const leaf = this.getLeaf(parentId, id, name, program, item.type.string, item.type.arrayDims);
            this.scanArray.push(leaf);
          }
        }
      } catch (e) {
        this.plugin.log(' item.type.structure ' + util.inspect(item) + util.inspect(e), 1);
      }
    }
  }

  getLeaf(parentId, id, name, program, dataType, arrayDims) {
    return {
      parentId,
      id,
      title: name,
      channel: {
        topic: name,
        title: name,
        chan: program == null ? name : 'Program:' + program + '.' + name,
        dataType: arrayDims == 0 ? dataType : 'ARRAY_OF_' + dataType,
        polltimefctr: 1
      }
    };
  }

  // Отправка дерева клиенту uuid
  sendTree(uuid, data) {
    if (!data) data = [this.makeTree()];
    // console.log('SEND SCAN TREE for ' + uuid + ': ' + util.inspect(data, null, 7));
    this.plugin.send({ type: 'scan', op: 'list', data, uuid });
  }

  // Из массива this.scanArray формирует дерево
  makeTree() {
    const ids = this.scanArray.reduce((acc, el, i) => {
      acc[el.id] = i;
      return acc;
    }, {});
    let root;
    this.scanArray.forEach(el => {
      if (!el.parentId) {
        root = el;
        return;
      }
      const parentEl = this.scanArray[ids[el.parentId]];
      parentEl.children = [...(parentEl.children || []), el];
    });
    return root;
  }
}

module.exports = Scanner;
