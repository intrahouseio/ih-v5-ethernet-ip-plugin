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
    this.idSet = new Set();
  }

  async request(session, uuid) {
    await session.getControllerTagList(this.tagList);
    this.idSet = new Set();
    //this.tagList = taglist;
    const root = session.properties.name + ' slot ' + session.properties.slot;
    this.scanArray = [{ id: root, title: root, parentId: '' }];
    this.scanning();
    this.sendTree(uuid);
  }

  scanning() {
    let id;
    let parentId = this.scanArray[0].id;
    this.tagList.tags.forEach(tag => {
      if (tag.name.startsWith('__')) return;
      if (tag.name.includes('Program') && tag.type.reserved) {
        id = tag.id + tag.name + tag.program ;
        const branch = { parentId, id: id, title: tag.name };
        this.scanArray.push(branch);
        const {program, name} = this.structProgram(tag.name);
        this.fromTags(id, name);
        return;
      } 
      if (tag.program == null && tag.type.structure && tag.type.typeName !== 'STRING') {
          id = tag.id + tag.name + tag.program ;
          const branch = { parentId, id: id, title: tag.name };
          this.scanArray.push(branch);
          this.fromTemplate(id, tag.name, tag.type.code, tag.program);
          return;
      } 
        
        if (tag.type.typeName && tag.program == null) {
          id = tag.id + tag.name + tag.program ;
          if (!this.idSet.has(id)) {
            this.idSet.add(id);
            const leaf = this.getLeaf(parentId, id, tag.name, tag.program, tag.type.typeName, tag.type.arrayDims);
            this.scanArray.push(leaf);
          }
          return;
        }
      
    });
  }

  structProgram(structName) {
  const str = structName.slice(structName.indexOf(":") + 1, structName.length)
  const program = str.slice(0, str.indexOf("."));
  const name = str.slice(str.indexOf(".") + 1, str.length);
  return {program, name}
  }

  fromTags(parentId, program) {
    let id = '';
    this.tagList.tags.forEach(tag => {
      if (tag.program == program) {
          if (tag.name.startsWith('__')) return;
          if (tag.name.includes('Program') && tag.type.reserved) {
          /*id = tag.id + tag.name + tag.program;
          const branch = { parentId, id: id, title: tag.name };
          this.scanArray.push(branch);
          const {program, name} = this.structProgram(tag.name);
          this.fromTags(id, name);*/
          return;
        } 
        if (tag.type.structure && tag.type.typeName !== 'STRING') {
          id = tag.id  + tag.name + tag.program;
          const branch = { parentId, id: id, title: tag.name };
          this.scanArray.push(branch);
          this.fromTemplate(id, tag.name, String(tag.type.code), tag.program);
          return;
        } 
          if (tag.type.typeName) {
            id = tag.id + tag.name + tag.program;
            if (!this.idSet.has(id)) {
             this.idSet.add(id);
             const leaf = this.getLeaf(parentId, id, tag.name, tag.program, tag.type.typeName, tag.type.arrayDims);
             this.scanArray.push(leaf);
             return;
          }
        }
      
      }
    })
    if (id == '') this.scanArray.pop();
  }

  fromTemplate(parentId, parentName, code, program) {
    if (!this.tagList.templates[code] || !this.tagList.templates[code]._members) {
      //this.scanArray.pop();
      return;
    }

    const members = this.tagList.templates[code]._members;
    for (let i = 0; i < members.length; i++) {
      const item = members[i];
      if (item.name.startsWith('__')) continue;
      try {
        let id = parentId +"||"+ parentName + '.' + item.name;
        
        if (this.idSet.has(id)) continue;
          this.idSet.add(id);
        let name = parentName + '.' + item.name;
        if (item.type) {
          if (item.type.structure && item.type.string !== 'STRING') {
            const branch = { parentId, id, title: name };
            this.scanArray.push(branch);
            this.fromTemplate(id, name, String(item.type.code), program);
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
    let chan = program == null ? name : 'Program:' + program + '.' + name;
    if (dataType == 'BIT_STRING') chan += "[0]";
    return {
      parentId,
      id,
      title: name,
      channel: {
        topic: name,
        title: name,
        chan,
        dataType: arrayDims == 0 || dataType == "BIT_STRING" ? dataType : 'ARRAY_OF_' + dataType +"("+arrayDims+")",
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
    this.scanArray.sort(this.byorder('title'));
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
  
  byorder(ordernames, direction, parsingInt) {
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

}

module.exports = Scanner;
