/*globals define*/
/*jshint node: true, browser: true*/

/**
 * @author kecso / https://github.com/kecso
 */

define(['common/util/assert'], function (ASSERT) {
    'use strict';

    var SETS_ID = '_sets';
    var REL_ID = 'member';

    function SetCore(innerCore, options) {
        ASSERT(typeof options === 'object');
        ASSERT(typeof options.globConf === 'object');
        ASSERT(typeof options.logger !== 'undefined');

        var logger = options.logger.fork('setcore'),
            setCore = {};
        for (var i in innerCore) {
            setCore[i] = innerCore[i];
        }
        logger.debug('initialized');

        //help functions
        function setModified(node) {
            innerCore.setRegistry(node, '_sets_', (innerCore.getRegistry(node, '_sets_') || 0) + 1);
        }

        function relIdSelector(key) {
            if (key.indexOf('_') !== 0 && key !== 'reg' && key !== 'atr') {
                return true;
            }
            return false;
        }

        function getMemberPath(node, setElementNode) {
            var ownPath = innerCore.getPath(node),
                memberPath = innerCore.getPointerPath(setElementNode, REL_ID);

            //TODO this is a hack and should be solved some other way if possible
            ownPath = ownPath.substring(0, ownPath.indexOf('/_'));

            if (ownPath !== memberPath) {
                return memberPath;
            }

            //now we should check who really set this member as its own
            while (innerCore.getBase(node) !== null && innerCore.getBase(setElementNode) !== null &&
            innerCore.getRegistry(innerCore.getBase(setElementNode), '_') === '_') {

                node = innerCore.getBase(node);
                setElementNode = innerCore.getBase(setElementNode);
                ownPath = innerCore.getPath(node);

                //TODO this is a hack and should be solved some other way if possible
                ownPath = ownPath.substring(0, ownPath.indexOf('/_'));
            }
            memberPath = innerCore.getPointerPath(setElementNode, REL_ID);


            return memberPath;

        }

        //function getMemberRelId(node, setName, memberPath) {
        //    ASSERT(typeof setName === 'string');
        //    var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName);
        //    var elements = innerCore.getChildrenRelids(setNode);
        //
        //    for (var i = 0; i < elements.length; i++) {
        //        if (getMemberPath(node, innerCore.getChild(setNode, elements[i])) === memberPath) {
        //            return elements[i];
        //        }
        //    }
        //    return null;
        //}

        function getMemberRelId(node, setName, memberPath) {
            var setInfo,
                keys, i;

            do {
                setInfo = setCore.getProperty(node, SETS_ID);
                if (setInfo && setInfo[setName]) {
                    keys = setCore.getRawKeys(setInfo[setName], relIdSelector);
                    for (i = 0; i < keys.length; i += 1) {
                        if (innerCore
                                .getPointerPathFrom(node, '/' + SETS_ID + '/' + setName + '/' + keys[i], REL_ID) ===
                            memberPath) {
                            return keys[i];
                        }
                    }
                }
                node = setCore.getBase(node);
            } while (node);

            return null;
        }

        function createNewMemberRelid(setNode) {
            var MAX_RELID = Math.pow(2, 31);
            var existingRelIds = innerCore.getChildrenRelids(setNode);
            var relid;
            do {
                relid = Math.floor(Math.random() * MAX_RELID);
            } while (existingRelIds.indexOf(relid) !== -1);
            return '' + relid;
        }

        function harmonizeMemberData(node, setName) {
            var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName),
                base = innerCore.getBase(setNode),
                allMembers = innerCore.getChildrenRelids(setNode),
                ownMembers, inheritedMembers, i, j, path, names, ownMember, inheritedMember, k;
            if (base) {
                harmonizeMemberData(base, setName); //recursively harmonize base members first
                inheritedMembers = innerCore.getChildrenRelids(base);
                ownMembers = [];
                for (i = 0; i < allMembers.length; i++) {
                    if (inheritedMembers.indexOf(allMembers[i]) === -1) {
                        ownMembers.push(allMembers[i]);
                    }
                }

                for (i = 0; i < ownMembers.length; i++) {
                    ownMember = innerCore.getChild(setNode, ownMembers[i]);
                    path = innerCore.getPointerPath(ownMember, 'member');
                    if (path === undefined) {
                        innerCore.deleteNode(innerCore.getChild(setNode, ownMembers[i]), true);
                    } else {
                        for (j = 0; j < inheritedMembers.length; j++) {
                            inheritedMember = innerCore.getChild(setNode, inheritedMembers[j]);
                            if (getMemberPath(node, inheritedMember) === path) {
                                //redundancy...
                                names = innerCore.getAttributeNames(ownMember);
                                for (k = 0; k < names.length; k++) {
                                    if (innerCore.getAttribute(ownMember, names[k]) !==
                                        innerCore.getAttribute(inheritedMember, names[k])) {

                                        innerCore.setAttribute(inheritedMember, names[k],
                                            innerCore.getAttribute(ownMember, names[k]));
                                    }
                                }
                                names = innerCore.getRegistryNames(ownMember);
                                for (k = 0; k < names.length; k++) {
                                    if (innerCore.getRegistry(ownMember, names[k]) !==
                                        innerCore.getRegistry(inheritedMember, names[k])) {

                                        innerCore.setRegistry(inheritedMember, names[k],
                                            innerCore.getRegistry(ownMember, names[k]));
                                    }
                                }
                                innerCore.deleteNode(innerCore.getChild(setNode, ownMembers[i]), true);
                            }
                        }
                    }
                }
            }
        }


        //adding new functions
        setCore.getSetNumbers = function (node) {
            return this.getSetNames(node).length;
        };

        function collectSetNames(node) {
            var sets = [],
                setsInfo,
                keys, i;
            do {
                setsInfo = setCore.getProperty(node, SETS_ID);
                if (setsInfo && setsInfo['ovr'] && setsInfo['ovr']['']) {
                    keys = Object.keys(setsInfo['ovr']['']);
                    for (i = 0; i < keys.length; i += 1) {
                        if (keys[i] !== '_mutable' && sets.indexOf(keys[i]) === -1) {
                            sets.push(keys[i]);
                        }
                    }
                }
                node = setCore.getBase(node);
            } while (node);

            return sets;
        }

        setCore.getSetNames = function (node) {
            //return innerCore.getPointerNames(innerCore.getChild(node, SETS_ID)) || [];
            return collectSetNames(node);
        };

        setCore.getPointerNames = function (node) {
            var sorted = [],
                raw = innerCore.getPointerNames(node);
            for (var i = 0; i < raw.length; i++) {
                if (raw[i].indexOf(REL_ID) === -1) {
                    sorted.push(raw[i]);
                }
            }
            return sorted;
        };

        setCore.getCollectionNames = function (node) {
            var sorted = [],
                raw = innerCore.getCollectionNames(node);
            for (var i = 0; i < raw.length; i++) {
                if (raw[i].indexOf(REL_ID) === -1) {
                    sorted.push(raw[i]);
                }
            }
            return sorted;
        };

        function collectInternalMemberRelids(node, setName) {
            var setInfo,
                relids = [],
                keys, i;

            do {
                setInfo = setCore.getProperty(node, SETS_ID);
                if (setInfo && setInfo[setName]) {
                    keys = setCore.getRawKeys(setInfo[setName], relIdSelector);
                    for (i = 0; i < keys.length; i += 1) {
                        if (relids.indexOf(keys[i]) === -1) {
                            relids.push(keys[i]);
                        }
                    }
                }
                node = setCore.getBase(node);
            } while (node);

            return relids;
        }

        function getContainerNodePath(node) {
            var ownPath = setCore.getPath(node);
            return ownPath.substring(0, ownPath.indexOf('/_'));
        }

        function collectMemberPath(node, setName, innerRelid) {
            var source = '/' + SETS_ID + '/' + setName + '/' + innerRelid,
                path = undefined,
                tempPath;

            do {
                tempPath = innerCore.getPointerPathFrom(node, source, 'member');
                if (tempPath !== undefined) {
                    path = tempPath;
                    if (path !== getContainerNodePath(node)) {
                        break;
                    }
                }
                node = setCore.getBase(node);
            } while (node);

            return path;
        }

        setCore.getMemberPaths = function (node, setName) {
            //harmonizeMemberData(node, setName);
            var memberRelids = collectInternalMemberRelids(node, setName),
                pathPrefix = '/' + SETS_ID + '/' + setName + '/',
                i, path,
                memberPaths = [];
            for (i = 0; i < memberRelids.length; i += 1) {
                path = collectMemberPath(node, setName, memberRelids[i]);
                if (path !== undefined && memberPaths.indexOf(path) === -1) { //null and '' are valid targets
                    memberPaths.push(path);
                }
            }
            return memberPaths;
        };

        //setCore.getMemberPaths = function (node, setName) {
        //    harmonizeMemberData(node, setName);
        //    ASSERT(typeof setName === 'string');
        //    var setNode = innerCore.getChild(innerCore.getChild(node, SETS_ID), setName);
        //    var members = [];
        //    var elements = innerCore.getChildrenRelids(setNode);
        //    elements = elements.sort(); //TODO this should be removed at some point
        //    for (var i = 0; i < elements.length; i++) {
        //        var path = getMemberPath(node, innerCore.getChild(setNode, elements[i]));
        //        if (path) {
        //            members.push(path);
        //        }
        //    }
        //    return members;
        //};

        setCore.delMember = function (node, setName, memberPath) {
            ASSERT(typeof setName === 'string');
            //we only need the path of the member so we allow to enter only it
            if (typeof memberPath !== 'string') {
                memberPath = innerCore.getPath(memberPath);
            }

            var setMemberRelId = getMemberRelId(node, setName, memberPath);
            if (setMemberRelId) {
                var setMemberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), setMemberRelId);

                innerCore.deleteNode(setMemberNode, true);
                setModified(node);
            }
        };

        setCore.addMember = function (node, setName, member) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID),
                setNode = innerCore.getChild(setsNode, setName),
                setMemberRelId = getMemberRelId(node, setName, setCore.getPath(member));
            if (setMemberRelId === null) {
                createSetOnDemand(node, setName);
                var setMember = innerCore.getChild(setNode, createNewMemberRelid(setNode));
                innerCore.setPointer(setMember, 'member', member);

                //TODO hack, somehow the empty children have been removed during persist
                innerCore.setRegistry(setMember, '_', '_');
                setModified(node);
            }
        };

        //TODO: Refactor out getMemberNode:
        //TODO: var memberNode = innerCore.getChild(
        //TODO: innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

        setCore.getMemberAttributeNames = function (node, setName, memberPath) {
            //ASSERT(typeof setName === 'string');
            //harmonizeMemberData(node, setName);
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getAttributeNames(memberNode);
            //}
            //return [];
            return collectPropertyNames(node, setName, memberPath, 'atr');
        };

        setCore.getMemberOwnAttributeNames = function (node, setName, memberPath) {
            //ASSERT(typeof setName === 'string');
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getOwnAttributeNames(memberNode);
            //}
            //return [];
            return collectOwnPropertyNames(node, setName, memberPath, 'atr');
        };

        setCore.getMemberAttribute = function (node, setName, memberPath, attrName) {
            //harmonizeMemberData(node, setName);
            //ASSERT(typeof setName === 'string' && typeof attrName === 'string');
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getAttribute(memberNode, attrName);
            //}
            return getPropertyValue(node, setName, memberPath, 'atr', attrName);
        };

        setCore.setMemberAttribute = function (node, setName, memberPath, attrName, attrValue) {
            ASSERT(typeof setName === 'string' && typeof attrName === 'string' && attrValue !== undefined);
            harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.setAttribute(memberNode, attrName, attrValue);
                setModified(node);
            }
        };

        setCore.delMemberAttribute = function (node, setName, memberPath, attrName) {
            ASSERT(typeof setName === 'string' && typeof attrName === 'string');
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.delAttribute(memberNode, attrName);
                setModified(node);
            }
        };

        function collectPropertyNames(node, setName, memberPath, propertyName) {
            var relId,
                names = [],
                memberInfo,
                keys, i;

            do {
                relId = getMemberRelId(node, setName, memberPath);
                if (relId) {
                    memberInfo = setCore.getProperty(node, SETS_ID) || {};
                    memberInfo = memberInfo[setName] || {};
                    memberInfo = memberInfo[relId] || {};
                    memberInfo = memberInfo[propertyName] || {};
                    keys = innerCore.getRawKeys(memberInfo, relIdSelector);
                    for (i = 0; i < keys.length; i += 1) {
                        if (names.indexOf(keys[i]) === -1) {
                            names.push(keys[i]);
                        }
                    }
                } else {
                    return names; //because there is no more relation towards the given path
                }
                node = setCore.getBase(node);
            } while (node);

            return names;
        }

        function collectOwnPropertyNames(node, setName, memberPath, propertyName) {
            var relId,
                names = [],
                memberInfo,
                keys, i;

            relId = getMemberRelId(node, setName, memberPath);
            if (relId) {
                memberInfo = setCore.getProperty(node, SETS_ID) || {};
                memberInfo = memberInfo[setName] || {};
                memberInfo = memberInfo[relId] || {};
                memberInfo = memberInfo[propertyName] || {};
                keys = innerCore.getRawKeys(memberInfo, relIdSelector);
                for (i = 0; i < keys.length; i += 1) {
                    if (names.indexOf(keys[i]) === -1) {
                        names.push(keys[i]);
                    }
                }
            }

            return names;
        }

        function getPropertyValue(node, setName, memberPath, propertyCollectionName, propertyName) {
            var relId,
                memberInfo,
                value;

            do {
                relId = getMemberRelId(node, setName, memberPath);
                if (relId) {
                    memberInfo = setCore.getProperty(node, SETS_ID) || {};
                    memberInfo = memberInfo[setName] || {};
                    memberInfo = memberInfo[relId] || {};
                    memberInfo = memberInfo[propertyCollectionName] || {};
                    value = memberInfo[propertyName];
                    if (value !== undefined) {
                        return value;
                    }
                } else {
                    return undefined; //because there is no more relation towards the given path
                }
                node = setCore.getBase(node);
            } while (node);

            return undefined;
        }

        function getOwnPropertyValue(node, setName, memberPath, propertyCollectionName, propertyName) {
            var relId,
                memberInfo;

            relId = getMemberRelId(node, setName, memberPath);
            if (relId) {
                memberInfo = setCore.getProperty(node, SETS_ID) || {};
                memberInfo = memberInfo[setName] || {};
                memberInfo = memberInfo[relId] || {};
                memberInfo = memberInfo[propertyCollectionName] || {};
                return memberInfo[propertyName];
            }

            return undefined;
        }

        setCore.getMemberRegistryNames = function (node, setName, memberPath) {
            //ASSERT(typeof setName === 'string');
            //harmonizeMemberData(node, setName);
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getRegistryNames(memberNode);
            //}
            //return [];
            return collectPropertyNames(node, setName, memberPath, 'reg');
        };
        setCore.getMemberOwnRegistryNames = function (node, setName, memberPath) {
            //ASSERT(typeof setName === 'string');
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getOwnRegistryNames(memberNode);
            //}
            //return [];
            return collectOwnPropertyNames(node, setName, memberPath, 'reg');
        };
        setCore.getMemberRegistry = function (node, setName, memberPath, regName) {
            //ASSERT(typeof setName === 'string' && typeof regName === 'string');
            //harmonizeMemberData(node, setName);
            //var memberRelId = getMemberRelId(node, setName, memberPath);
            //if (memberRelId) {
            //    var memberNode = innerCore.getChild(
            //        innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);
            //
            //    return innerCore.getRegistry(memberNode, regName);
            //}
            return getPropertyValue(node, setName, memberPath, 'reg', regName);
        };
        setCore.setMemberRegistry = function (node, setName, memberPath, regName, regValue) {
            ASSERT(typeof setName === 'string' && typeof regName === 'string' && regValue !== undefined);
            //harmonizeMemberData(node, setName);
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.setRegistry(memberNode, regName, regValue);
                setModified(node);
            }
        };
        setCore.delMemberRegistry = function (node, setName, memberPath, regName) {
            ASSERT(typeof setName === 'string' && typeof regName === 'string');
            var memberRelId = getMemberRelId(node, setName, memberPath);
            if (memberRelId) {
                var memberNode = innerCore.getChild(
                    innerCore.getChild(innerCore.getChild(node, SETS_ID), setName), memberRelId);

                innerCore.delRegistry(memberNode, regName);
                setModified(node);
            }
        };

        function createSetOnDemand(node, setName) {
            //the function checks if there is no set defined on the node's level and create it
            var setsNode = innerCore.getChild(node, SETS_ID);
            if (innerCore.getOwnPointerPath(setsNode, setName) === undefined) {
                setCore.createSet(node, setName);
            }
        }


        setCore.createSet = function (node, setName) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID),
                setNode = innerCore.getChild(setsNode, setName);

            //FIXME: hack, somehow the empty children have been removed during persist
            innerCore.setRegistry(setNode, '_', '_');

            innerCore.setPointer(innerCore.getChild(node, SETS_ID), setName, null);
            setModified(node);
        };
        setCore.deleteSet = function (node, setName) {
            ASSERT(typeof setName === 'string');
            var setsNode = innerCore.getChild(node, SETS_ID),
                setNode = innerCore.getChild(setsNode, setName);
            innerCore.deletePointer(setsNode, setName);
            innerCore.deleteNode(setNode, true);
            setModified(node);
        };

        setCore.isMemberOf = function (node) {
            //TODO we should find a proper way to do this - or at least some support from lower layers would be fine
            var coll = setCore.getCollectionPaths(node, REL_ID);
            var sets = {};
            for (var i = 0; i < coll.length; i++) {
                var pathArray = coll[i].split('/');
                if (pathArray.indexOf('_meta') === -1) {
                    //now we simply skip META sets...
                    var index = pathArray.indexOf(SETS_ID);
                    if (index > 0 && pathArray.length > index + 1) {
                        //otherwise it is not a real set
                        var ownerPath = pathArray.slice(0, index).join('/');
                        if (sets[ownerPath] === undefined) {
                            sets[ownerPath] = [];
                        }
                        sets[ownerPath].push(pathArray[index + 1]);
                    }
                }
            }
            return sets;
        };

        /*setcore.getDataForSingleHash = function(node){
         ASSERT(setcore.isValidNode(node));
         var datas = innerCore.getDataForSingleHash(node);

         //now we should stir all the sets hashes into the node's hash to get changes deep inside
         var names = setcore.getSetNames(node);
         for(var i=0;i<names.length;i++){
         var setNode = setcore.getChild(setcore.getChild(node,SETS_ID),names[i]);
         var memberRelids = setcore.getChildrenRelids(setNode);
         for(var j=0;j<memberRelids.length;j++){
         datas = datas.concat(innerCore.getDataForSingleHash(setcore.getChild(setNode,memberRelids[j])));
         }
         }

         return datas;
         };*/

        return setCore;

    }

    return SetCore;
});


