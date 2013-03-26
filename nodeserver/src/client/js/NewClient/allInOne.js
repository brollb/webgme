define([
    'util/assert',
    'commonUtil',
    'eventDispatcher',
    'core/core',
    'core/setcore',
    'storage/cache',
    'storage/failsafe',
    'storage/socketioclient',
    'js/NewClient/commit',
],
    function (
        ASSERT,
        commonUtil,
        EventDispatcher,
        Core,
        SetCore,
        Cache,
        Failsafe,
        SocketIOClient,
        Commit
        ) {

        var GUID = commonUtil.guid;
        var COPY = function(object){
            if(object){
                return JSON.parse(JSON.stringify(object));
            }
            return null;
        };

        var ClientMaster = function(){

            var self = this,
                _database = new Failsafe(
                    new Cache(
                        new SocketIOClient({
                        }),
                        {}
                    ),
                    {}
                ),
                _projectName = null,
                _project = null,
                _commit = null,
                _inTransaction = false,
                _core = null,
                _nodes = {},
                _commitObject = null,
                _patterns = {},
                _branch = null,
                _status = null,
                _clipboard = [],
                _msg = null,
                _recentRoots = [],
                _users = {}; //uid:{type:not used, UI:ui, PATTERNS:{}, PATHS:[], ONEEVENT:true/false, SENDEVENTS:true/false};

            //serializer for the functions they need it
            var serializedCalls = [],
                serializedRunning = false;
            var serializedStart = function(func) {
                if(serializedRunning) {
                    serializedCalls.push(func);
                }
                else {
                    serializedRunning = true;
                    func();
                }
            };
            var serializedDone = function() {
                ASSERT(serializedRunning === true);

                if(serializedCalls.length !== 0) {
                    var func = serializedCalls.shift();
                    func();
                } else {
                    serializedRunning = false;
                }
            };


            var initialize = function(){
                _database.openDatabase(function(){
                    _database.openProject('storage',function(err,p){
                        _project = p;
                        _projectName = 'storage';
                        _commit = new Commit(_project);
                        _inTransaction = false;
                        _nodes={};
                        _commit.setStatusFunc(statusUpdated);
                        _commit.selectBranch('master',branchUpdated);
                    });
                });
            };

            //internal functions
            var cleanUsers = function(){
                for(var i in _users){
                    _users[i].PATTERNS = {};
                    _users[i].PATHS = {};
                    _users[i].SENDEVENTS = true;
                }
            };
            var closeOpenedProject = function(callback){
                callback = callback || function(){};
                var returning = function(e){
                    _projectName = null;
                    _project = null;
                    _commit = null;
                    _inTransaction = false;
                    _core = null;
                    _nodes = {};
                    _commitObject = null;
                    _patterns = {};
                    _branch = null;
                    _status = null;
                    _clipboard = [];
                    _msg = null;
                    _recentRoots = [];
                    callback(e);
                };
                if(_project){
                    _project.closeProject(function(err){
                        //TODO what if for some reason we are in transaction???
                        returning(err);
                    });
                } else {
                    returning(e);
                }
            };
            var createEmptyProject = function(project,callback){
                var core = new SetCore(new Core(project,{}));
                var commit = new Commit(project);
                var root = core.createNode();
                core.setRegistry(root,"isConnection",false);
                core.setRegistry(root,"position",{ "x": 0, "y": 0});
                core.setAttribute(root,"name","ROOT");
                core.setRegistry(root,"isMeta",false);
                var rootHash = core.persist(function(err){
                    if(!err){
                        commit.makeCommit(rootHash,'master',[],'project creation',function(err,commitHash){
                            //TODO this should be in some proper way
                            if(!err && commitHash){
                                project.setBranchHash('*master',"",commitHash,function(err){
                                    if(!err){
                                        callback(null,commitHash);
                                    } else {
                                        callback(err);
                                    }
                                });
                            } else {
                                callback(err);
                            }
                        });
                    } else {
                        callback(err);
                    }
                });
            };

            //serializer for the saveRoot function
            var serializedSaveRootCalls = [],
                serializedSaveRootRunning = false;
            var serializedSaveRootStart = function(func) {
                if(serializedSaveRootRunning) {
                    serializedSaveRootCalls.push(func);
                }
                else {
                    serializedSaveRootRunning = true;
                    func();
                }
            };
            var serializedSaveRootDone = function() {
                ASSERT(serializedSaveRootRunning === true);

                if(serializedSaveRootCalls.length !== 0) {
                    var func = serializedSaveRootCalls.shift();
                    func();
                } else {
                    serializedSaveRootRunning = false;
                }
            };
            var saveRoot = function(msg,callback){
                callback = callback || function(){};
                if(!_inTransaction){
                    serializedSaveRootStart(function() {
                        saveRootWork(msg, function(err) {
                            callback(err);
                            serializedSaveRootDone();
                        });
                    });
                } else {
                    if(msg){
                        _msg = _msg+'\n'+msg;
                    }
                }

            };
            var saveRootWork = function(msg,callback){
                callback = callback || function(){};
                msg = msg || "- automated commit message -";
                if(_msg){
                    msg = _msg+'\n'+msg;
                    _msg = null;
                }

                if(_project && _commit && _core){
                    var error = null,
                        missing = 2,
                        commitHash = null;

                    var allDone = function(){
                        if(!error){
                            loadRoot(newRootHash,function(err){
                                _commit.updateBranch(commitHash,function(err){
                                    callback(err);
                                });
                            });
                        } else {
                            callback(error);
                        }
                    };

                    var oldRootHash = _core.getKey(_core.getRoot());
                    var newRootHash = _core.persist(function(err){
                        error = error || err;
                        if(--missing === 0){
                            allDone();
                        }
                    });

                    _commit.makeCommit(newRootHash,_branch,null,msg,function(err,cHash){
                        error = error || err;
                        commitHash = cHash;
                        if(--missing === 0){
                            allDone();
                        }
                    });
                } else {
                    callback('no active project');
                }
            };

            //serializer for the branchUpdated function
            var serializedBranchUpdatedCalls = [],
                serializedBranchUpdatedRunning = false;
            var serializedBranchUpdatedStart = function(func) {
                if(serializedBranchUpdatedRunning) {
                    serializedBranchUpdatedCalls.push(func);
                }
                else {
                    serializedBranchUpdatedRunning = true;
                    func();
                }
            };
            var serializedBranchUpdatedDone = function() {
                ASSERT(serializedBranchUpdatedRunning === true);

                if(serializedBranchUpdatedCalls.length !== 0) {
                    var func = serializedBranchUpdatedCalls.shift();
                    func();
                } else {
                    serializedBranchUpdatedRunning = false;
                }
            };
            var branchUpdated = function(newhash,callback) {
                serializedBranchUpdatedStart(function() {
                    branchUpdatedWork(newhash, function() {
                        callback();
                        serializedBranchUpdatedDone();
                    });
                });
            };
            var branchUpdatedWork = function(newhash,callback){
                _project.loadObject(newhash,function(err,cObj){
                    if(!err && cObj){
                        loadRoot(cObj.root,function(err){
                            callback();
                        });
                    } else {
                        callback();
                    }
                });
            };

            var getModifiedNodes = function(newerNodes){
                var modifiedNodes = [];
                for(var i in _nodes){
                    if(newerNodes[i]){
                        if(newerNodes[i].hash !== _nodes[i].hash && _nodes[i].hash !== ""){
                            modifiedNodes.push(i);
                        }
                    }
                }
                return modifiedNodes;
            };

            //this is just a first brute implementation it needs serious optimization!!!
            var patternToPaths = function(patternId,pattern,pathsSoFar){
                if(_nodes[patternId]){
                    pathsSoFar[patternId] = true;
                    if(pattern.children && pattern.children > 0){
                        var children = _core.getChildrenPaths(_nodes[patternId].node);
                        var subPattern = COPY(pattern);
                        subPattern.children--;
                        for(var i=0;i<children.length;i++){
                            patternToPaths(children[i],subPattern,pathsSoFar);
                        }
                    }
                }
            };
            var userEvents = function(userId,modifiedNodes){
                var newPaths = {};
                for(var i in _users[userId].PATTERNS){
                    patternToPaths(i,_users[userId].PATTERNS[i],newPaths);
                }

                var events = [];
                //deleted items
                for(i in _users[userId].PATHS){
                    if(!newPaths[i]){
                        events.push({etype:'unload',eid:i});
                    }
                }

                //added items
                for(i in newPaths){
                    if(!_users[userId].PATHS[i]){
                        events.push({etype:'load',eid:i});
                    }
                }

                //updated items
                for(i=0;i<modifiedNodes.length;i++){
                    if(newPaths[modifiedNodes[i]]){
                        events.push({etype:'update',eid:modifiedNodes[i]});
                    }
                }

                _users[userId].PATHS = newPaths;

                if(events.length>0){
                    if(_users[userId].ONEEVENT){
                        _users[userId].UI.onOneEvent(events);
                    } else {
                        for(i=0;i<events.length;i++){
                            _users[userId].UI.onEvent(events[i].etype,events[i].eid);
                        }
                    }
                }
            };

            var storeNode = function(node){
                _nodes[_core.getStringPath(node)] = {node:node,hash:""};
            };
            var addNode = function(core,nodesSoFar,node,callback){
                var path = core.getStringPath(node);
                nodesSoFar[path] = {node:node,hash:core.getSingleNodeHash(node)};
                core.loadSets(node,function(err,sets){
                    if(!err && sets && sets.length>0){
                        var  missing = 0;
                        var error = null;
                        var alldone = function(){
                            callback(error);
                        };

                        var loadset = function(node,callback){
                            core.loadChildren(node,function(err,children){
                                error = error || err;
                                if(!err && children && children.length>0){
                                    for(var i=0;i<children.length;i++){
                                        nodesSoFar[core.getStringPath(children[i])] = {node:children[i],hash:core.getSingleNodeHash(children[i])};
                                        core.loadPointer(children[i],'member',function(err,member){
                                            error = error || err;
                                            if(!err && member){
                                                nodesSoFar[core.getStringPath(member)] = {node:member,hash:core.getSingleNodeHash(member)};
                                                if(--missing === 0){
                                                    alldone();
                                                }
                                            } else {
                                                if(--missing === 0){
                                                    alldone();
                                                }
                                            }
                                        });
                                    }
                                } else {
                                    missing -= core.getChildrenNumber(node);
                                    if(missing === 0){
                                        alldone();
                                    }
                                }
                            });
                        };

                        for(var i=0;i<sets.length;i++){
                            missing += core.getChildrenNumber(sets[i]);
                        }
                        for(i=0;i<sets.length;i++){
                            nodesSoFar[core.getStringPath(sets[i])] = {node:sets[i],hash:core.getSingleNodeHash(sets[i])};
                            loadset(sets[i]);
                        }
                    } else {
                        callback(err);
                    }
                });
            };

            //this is just a first brute implementation it needs serious optimization!!!
            var loadPattern = function(core,id,pattern,nodesSoFar,callback){
                callback = callback || function(){};
                ASSERT(typeof core === 'object' && typeof pattern === 'object' && typeof nodesSoFar === 'object');

                core.loadByPath(id,function(err,node){
                    if(!err && node){
                        addNode(core,nodesSoFar,node,function(err){
                            if(!err){
                                //currently we only have children type pattern, so we try to simplify the function
                                if(!pattern.children || pattern.children === 0){
                                    //we are done with this pattern
                                    callback(null);
                                } else {
                                    var childrenIds = core.getChildrenPaths(node);
                                    var subPattern = COPY(pattern);
                                    subPattern.children--;
                                    var missing = childrenIds.length;
                                    var error = null;
                                    var subLoadComplete = function(err){
                                        error = error || err;
                                        if(--missing === 0){
                                            callback(error);
                                        }
                                    };
                                    for(var i=0;i<childrenIds.length;i++){
                                        loadPattern(core,childrenIds[i],subPattern,nodesSoFar,subLoadComplete);
                                    }
                                    if(missing === 0){
                                        missing = 1;
                                        subLoadComplete(null);
                                    }
                                }
                            } else {
                                callback(err);
                            }
                        });
                    } else {
                        callback(err);
                    }
                });
            };

            //serializer for the loadRoot function
            var serializedLoadRootCalls = [],
                serializedLoadRootRunning = false;
            var serializedLoadRootStart = function(func) {
                if(serializedLoadRootRunning) {
                    serializedLoadRootCalls.push(func);
                }
                else {
                    serializedLoadRootRunning = true;
                    func();
                }
            };
            var serializedLoadRootDone = function() {
                ASSERT(serializedLoadRootRunning === true);

                if(serializedLoadRootCalls.length !== 0) {
                    var func = serializedLoadRootCalls.shift();
                    func();
                } else {
                    serializedLoadRootRunning = false;
                }
            };
            var loadRoot = function(rootHash,callback){
                callback = callback || function(){};
                serializedLoadRootStart(function() {
                    loadRootWork(rootHash, function() {
                        callback();
                        serializedLoadRootDone();
                    });
                });
            };
            var loadRootWork = function(rootHash,callback){
                ASSERT(_project && _commit);
                if(_recentRoots.indexOf(rootHash) === -1){
                    if(_recentRoots.unshift(rootHash) > 10){
                        _recentRoots.pop();
                    }
                    var core = new SetCore(new Core(_project));
                    var nodes = {};
                    core.loadRoot(rootHash,function(err,root){
                        if(!err){
                            var missing = 0,
                                error = null;
                            var allLoaded = function(){
                                if(!error){
                                    _core = core;
                                    var modifiedPaths = getModifiedNodes(nodes);
                                    _nodes = nodes;
                                    for(var i in _users){
                                        userEvents(i,modifiedPaths);
                                    }
                                    callback(null);
                                } else {
                                    callback(error);
                                }
                            };

                            for(var i in _users){
                                for(var j in _users[i].PATTERNS){
                                    missing++;
                                }
                            }
                            if(missing > 0){
                                addNode(core,nodes,root,function(err){
                                    error == error || err;
                                    if(!err){
                                        for(i in _users){
                                            for(j in _users[i].PATTERNS){
                                                loadPattern(core,j,_users[i].PATTERNS[j],nodes,function(err){
                                                    error = error || err;
                                                    if(--missing === 0){
                                                        allLoaded();
                                                    }
                                                });
                                            }
                                        }
                                    } else {
                                        allLoaded();
                                    }
                                });
                            } else {
                                allLoaded();
                            }
                        } else {
                            callback(err);
                        }
                    });
                } else {
                    callback(null);
                }
            };

            var statusUpdated = function(newstatus){
                if(_status !== newstatus){
                    _status = newstatus;
                    self.dispatchEvent(self.events.NETWORKSTATUS_CHANGED,newstatus);
                }
            };


            //event functions to relay information between users
            var _selectedObjectId = null;
            $.extend(self, new EventDispatcher());
            self.events = {
                "SELECTEDOBJECT_CHANGED": "SELECTEDOBJECT_CHANGED",
                "NETWORKSTATUS_CHANGED" : "NETWORKSTATUS_CHANGED",
                "ACTOR_CHANGED"         : "ACTOR_CHANGED",
                "PROJECT_CLOSED"        : "PROJECT_CLOSED",
                "PROJECT_OPENED"        : "PROJECT_OPENED"
            };
            self.setSelectedObjectId = function (objectId) {
                if (objectId !== _selectedObjectId) {
                    _selectedObjectId = objectId;
                    self.dispatchEvent(self.events.SELECTEDOBJECT_CHANGED, _selectedObjectId);
                }
            };
            self.clearSelectedObjectId = function () {
                self.setSelectedObjectId(null);
            };


            //project and commit selection functions
            //branch manipulating commit and merge
            self.getActiveProject = function () {
                return _projectName;
            };
            self.getAvailableProjectsAsync = function (callback) {
                _database.getProjectNames(callback);
            };
            self.selectProjectAsync = function (projectname,callback) {
                //we assume that every project has a master branch and we
                //open that...
                if(projectname === _projectName){
                    callback(null);
                } else {
                    closeOpenedProject(function(err){
                        //TODO what can we do with the error??
                        _database.openProject(projectname,function(err,p){
                            if(!err && p){
                                _project = p;
                                _projectName = projectname;
                                _commit = new Commit(_project);
                                _inTransaction = false;
                                _nodes={};
                                _commit.setStatusFunc(statusUpdated);
                                _commit.selectBranch('master',branchUpdated);
                                callback(null);
                            } else {
                                callback(err);
                            }
                        });
                    });
                }
            };
            self.createProjectAsync = function(projectname,callback){
                self.getAvailableProjectsAsync(function(err,names){
                    if(!err && names){
                        if(names.indexOf(projectname) === -1){
                            _database.openProject(projectname,function(err,p){
                                if(!err && p){
                                    createEmptyProject(p,function(err,commit){
                                        if(!err && commit){
                                            callback(null);
                                        } else {
                                            callback(err);
                                        }
                                    });
                                } else {
                                    callback(err);
                                }
                            });
                        } else {
                            //TODO maybe the selectProjectAsync could be called :)
                            callback('the project already exists!');
                        }
                    } else {
                        callback(err);
                    }
                });
            };
            self.deleteProjectAsync = function(projectname,callback){
                if(projectname === _projectName){
                    closeOpenedProject();
                }
                _database.deleteProject(projectname,callback);
            };
            self.selectCommitAsync = function (commitid, callback) {
                callback('NIE');
            };

            self.getCommitsAsync = function (callback) {
                callback('NIE');
            };
            self.getCommitObj = function (commitid) {
                callback('NIE');
            };
            self.getActualCommit = function () {
                return _commitObject;
            };
            self.getActualBranch = function () {
                return _branch;
            };
            self.getBranchesAsync = function (callback) {
                if(_project){
                    _project.getBranchNames(callback);
                } else {
                    callback('no selected project');
                }
            };
            self.getRootKey = function () {
                if(_core){
                    _core.getKey(_core.getRoot());
                } else {
                    return null;
                }
            };
            self.commitAsync = function (parameters, callback) {
                callback('NIE');
            };
            self.deleteBranchAsync = function (branchname, callback) {
                if(_commit){
                    _commit.deleteBranch(branchname,callback);
                } else {
                    callback('there is no active project');
                }
            };

            //relayed project functions
            //kind of a MGA
            var copyNodes = function(nodePaths,parentPath,callback){
                var checkPaths = function(){
                    var result = true;
                    for(var i=0;i<nodePaths.length;i++){
                        result = result && (_nodes[nodePaths[i]] && typeof _nodes[nodePaths[i]].node === 'object');
                    }
                    return result;
                };

                if(_nodes[parentPath] && typeof _nodes[parentPath].node === 'object' && checkPaths()){
                    var helpArray = {},
                        subPathArray = {},
                        parent = _nodes[parentPath].node,
                        returnArray = {};

                    //creating the 'from' object
                    var tempFrom = _core.createNode(parent);
                    //and moving every node under it
                    for(var i=0;i<nodePaths.length;i++){
                        helpArray[nodePaths[i]] = {};
                        helpArray[nodePaths[i]].origparent = _core.getParent(_nodes[nodePaths[i]].node);
                        helpArray[nodePaths[i]].tempnode = _core.moveNode(_nodes[nodePaths[i]].node,tempFrom);
                        subPathArray[_core.getRelid(helpArray[nodePaths[i]].tempnode)] = nodePaths[i];
                        delete _nodes[nodePaths[i]];
                    }

                    //do the copy
                    var tempTo = _core.copyNode(tempFrom,parent);

                    //moving back the temporary source
                    for(var i=0;i<nodePaths.length;i++){
                        helpArray[nodePaths[i]].node = _core.moveNode(helpArray[nodePaths[i]].tempnode,helpArray[nodePaths[i]].origparent);
                        storeNode(helpArray[nodePaths[i]].node);
                    }

                    //gathering the destination nodes
                    _core.loadChildren(tempTo,function(err,children){
                        if(!err && children && children.length>0){
                            for(i=0;i<children.length;i++){
                                if(subPathArray[_core.getRelid(children[i])]){
                                    var newNode = _core.moveNode(children[i],parent);
                                    storeNode(newNode);
                                    returnArray[subPathArray[_core.getRelid(children[i])]] = newNode;
                                } else {
                                    console.log('635 - should never happen!!!');
                                }
                            }
                            _core.deleteNode(tempFrom);
                            _core.deleteNode(tempTo);
                            callback(null,returnArray);
                        } else {
                            //clean up the mess and return
                            _core.deleteNode(tempFrom);
                            _core.deleteNode(tempTo);
                            callback(err,{});
                        }
                    });
                }
            };

            self.startTransaction = function () {
                if (_core) {
                    _inTransaction = true;
                }
            };
            self.completeTransaction = function () {
                _inTransaction = false;
                if (_core) {
                    saveRoot('completeTransaction()');
                }
            };
            self.setAttributes = function (path, name, value) {
                if (_core && _nodes[path] && typeof _nodes[path].node === 'object') {
                    _core.setAttribute(_nodes[path].node, name, value);
                    saveRoot('setAttribute('+path+','+'name'+','+value+')');
                }
            };
            self.setRegistry = function (path, name, value) {
                if (_core && _nodes[path] && typeof _nodes[path].node === 'object') {
                    _core.setRegistry(_nodes[path].node, name, value);
                    saveRoot('setRegistry('+path+','+','+name+','+value+')');
                }
            };
            self.copyNodes = function (ids) {
                if (_core) {
                    _clipboard = ids;
                }
            };
            self.pasteNodes = function (parentpath) {
                var checkClipboard = function(){
                    var result = true;
                    for(var i=0;i<_clipboard.length;i++){
                        result = result && (typeof _nodes[_clipboard[i]].node === 'object');
                    }
                    return result;
                };

                if(_core && checkClipboard()){
                    var paths = COPY(_clipboard);
                    copyNodes(paths,parentpath,function(err,copyarray){
                        if(!err){
                            saveRoot('pasteNodes('+parentpath+','+paths+')');
                        }
                    });
                }
            };
            self.deleteNode = function (path) {
                if(_core && _nodes[path] && typeof _nodes[path].node === 'object'){
                    _core.deleteNode(_nodes[path].node);
                    saveRoot('deleteNode('+path+')');
                }
            };
            self.delMoreNodes = function (paths) {
                if(_core){
                    for(var i=0;i<paths.length;i++){
                        if(_nodes[paths[i]] && typeof _nodes[paths[i]].node === 'object'){
                            _core.deleteNode(_nodes[paths[i]].node);
                        }
                    }
                    saveRoot('delMoreNodes('+paths+')');
                }
            };
            self.createChild = function (parameters) {
                if(_core){
                    if(parameters.parentId && _nodes[parameters.parentId] && typeof _nodes[parameters.parentId].node === 'object'){
                        var baseId = parameters.baseId || "object";
                        var child = _core.createNode(_nodes[parameters.parentId].node);
                        if(baseId === "connection"){
                            _core.setRegistry(child,"isConnection",true);
                            _core.setAttribute(child,"name","defaultConn");
                        } else {
                            _core.setRegistry(child,"isConnection",false);
                            _core.setAttribute(child,"name", parameters.name || "defaultObj");

                            if (parameters.position) {
                                _core.setRegistry(child,"position", { "x": parameters.position.x || 100, "y": parameters.position.y || 100});
                            } else {
                                _core.setRegistry(child,"position", { "x": 100, "y": 100});
                            }
                        }
                        _core.setAttribute(child,"isPort",true);

                        storeNode(child);
                        saveRoot('createChild('+parameters.parentId+','+baseId+','+_core.getStringPath(child)+')');
                    }
                }
            };
            self.createSubType = function (parent, base) {
                console.log('NIE');
            };
            self.makePointer = function (id, name, to) {
                if(_core && _nodes[id] && _nodes[to] && typeof _nodes[id].node === 'object' && typeof _nodes[to].node === 'object' ){
                    _core.setPointer(_nodes[id].node,name,_nodes[to].node);
                    saveRoot('makePointer('+id+','+name+','+to+')');
                }
            };
            self.delPointer = function (path, name) {
                if(_core && _nodes[path] && typeof _nodes[path].node === 'object'){
                    _core.setPointer(_nodes[path].node,name);
                    saveRoot('delPointer('+path+','+name+')');
                }
            };
            self.makeConnection = function (parameters) {
                if(parameters.parentId && parameters.sourceId && parameters.targetId){
                    if(_core &&
                        _nodes[parameters.parentId] &&
                        _nodes[parameters.sourceId] &&
                        _nodes[parameters.parentId] &&
                        typeof _nodes[parameters.parentId].node === 'object' &&
                        typeof _nodes[parameters.sourceId].node === 'object' &&
                        typeof _nodes[parameters.targetId].node === 'object'){
                        var connection = _core.createNode(_nodes[parameters.parentId].node);
                        _core.setPointer(connection,"source",_nodes[parameters.sourceId].node);
                        _core.setPointer(connection,"target",_nodes[parameters.targetId].node);
                        _core.setAttribute(connection,"name",_core.getAttribute(_nodes[parameters.sourceId].node,'name')+"->"+_core.getAttribute(_nodes[parameters.targetId].node,'name'));
                        _core.setRegistry(connection,"isConnection",true);
                        storeNode(connection);
                        saveRoot('makeConnection('+parameters.targetId+','+parameters.sourceId+','+parameters.targetId+')');
                    }
                }
            };
            self.intellyPaste = function (parameters) {
                var pathestocopy = [],
                    simplepaste = true;
                if(parameters.parentId && _nodes[parameters.parentId] && typeof _nodes[parameters.parentId].node === 'object'){
                    for(var i in parameters){
                        if(i !== "parentId"){
                            pathestocopy.push(i);
                            simplepaste = false;
                        }
                    }
                    if(simplepaste){
                        pathestocopy = clipboard || [];
                    }

                    if(pathestocopy.length < 1){
                    } else if(pathestocopy.length === 1){
                        var newNode = _core.copyNode(_nodes[pathestocopy[0]].node,_nodes[parameters.parentId].node);
                        storeNode(newNode);
                        if(parameters[pathestocopy[0]]){
                            for(var j in parameters[pathestocopy[0]].attributes){
                                _core.setAttribute(newNode,j,parameters[pathestocopy[0]].attributes[j]);
                            }
                            for(j in parameters[pathestocopy[0]].registry){
                                _core.setRegistry(newNode,j,parameters[pathestocopy[0]].registry[j]);
                            }
                        }
                        saveRoot('intellyPaste('+pathestocopy+','+parameters.parentId+')');
                    } else {
                        copyNodes(pathestocopy,parameters.parentId,function(err,copyarr){
                            if(err){
                                //rollBackModification();
                            }
                            else{
                                for(var i in copyarr){
                                    if(parameters[i]){
                                        for(var j in parameters[i].attributes){
                                            _core.setAttribute(copyarr[i],j,parameters[i].attributes[j]);
                                        }
                                        for(j in parameters[i].registry){
                                            _core.setRegistry(copyarr[i],j,parameters[i].registry[j]);
                                        }
                                    }
                                }
                                saveRoot('intellyPaste('+pathestocopy+','+parameters.parentId+')');
                            }
                        });
                    }
                } else {
                    console.log('wrong parameters in intelligent paste operation - denied -');
                }
            };

            //MGAlike - set functions
            self.addMember = function (path, memberpath, setid) {
                if(_nodes[path] &&
                    _nodes[memberpath] &&
                    typeof _nodes[path].node === 'object' &&
                    typeof _nodes[memberpath].node === 'object'){
                    var setPath = _core.getSetPath(_nodes[path].node,setid);
                    if(setPath === null){
                        //we need to create the set first
                        var id = _core.getSetRelid(setid);
                        var setNode = _core.createNode(_nodes[path].node,id);
                        storeNode(setNode);
                        setPath = _core.getStringPath(setNode);
                    }

                    if(_nodes[setPath] && typeof _nodes[setPath].node === 'object'){
                        //let's check if the path already in the set
                        var members = _core.getChildrenPaths(_nodes[setPath].node);
                        var memberPaths =[];
                        for(var i=0;i<members.length;i++){
                            if(_nodes[members[i]] && typeof _nodes[memebrs[i]].node === 'object'){
                                memberPaths.push(_core.getPointerPath(_nodes[members[i]].node,'member'));
                            }
                        }
                        if(memberPaths.indexOf(memberpath) === -1){
                            var newMember = _core.createNode(_nodes[setPath].node);
                            storeNode(newMember);
                            _core.setPointer(newMember,'member',_nodes[memberpath].node);
                            saveRoot('addMember('+path+','+memberpath+','+setid+')');
                        }
                    }
                }
            };
            self.removeMember = function (path, memberpath, setid) {

            };

            //territory functions
            self.addUI = function (ui, oneevent, guid) {
                guid = guid || GUID();
                _users[guid] = {type:'notused', UI:ui, PATTERNS:{}, PATHS:[], ONEEVENT:oneevent ? true : false, SENDEVENTS:true};
                return guid;
            };
            self.removeUI = function (guid) {
                delete _users[guid];
            };
            self.disableEventToUI = function (guid) {
                console.log('NIE');
            };
            self.enableEventToUI = function (guid) {
                console.log('NIE');
            };
            self.updateTerritory = function (guid, patterns) {
                if(_project && _commit){

                    //this has to be optimized
                    var missing = 0;
                    var error = null;
                    var allDone = function(){
                        _users[guid].PATTERNS = patterns;
                        if(!error){
                            userEvents(guid,[]);
                        }
                    };
                    for(var i in patterns){
                        missing++;
                    }
                    if(missing>0){
                        for(var i in patterns){
                            loadPattern(_core,i,patterns[i],_nodes,function(err){
                                error = error || err;
                                if(--missing === 0){
                                    allDone();
                                }
                            });
                        }
                    } else {
                        allDone();
                    }
                } else {
                    //we should update the patterns, but that is all
                    _users[guid].PATTERNS = patterns;
                }
            };

            self.fullRefresh = function () {
                console.log('NIE');
            };

            //getNode
            self.getNode = function(_id){

                var getParentId = function(){
                    return _core.getStringPath(_core.getParent(_nodes[_id].node));
                };

                var getId = function(){
                    return _id;
                };

                var getChildrenIds = function(){
                    return _core.getChildrenPaths(_nodes[_id].node);
                };

                var getBaseId = function(){
                    return _core.getRegistry(_nodes[_id].node,"isConnection") === true ? 'connection' : 'object';
                };

                var getInheritorIds = function(){
                    return [];
                };

                var getAttribute = function(name){
                    return _core.getAttribute(_nodes[_id].node,name);
                };

                var getRegistry = function(name){
                    return _core.getRegistry(_nodes[_id].node,name);
                };

                var getPointer = function(name){
                    //return _core.getPointerPath(_nodes[_id].node,name);
                    return {to:_core.getPointerPath(_nodes[_id].node,name),from:[]};
                };

                var getPointerNames = function(){
                    return _core.getPointerNames(_nodes[_id].node);
                };

                var getAttributeNames = function(){
                    return _core.getAttributeNames(_nodes[_id].node);
                };

                var getRegistryNames = function(){
                    return _core.getRegistryNames(_nodes[_id].node);
                };

                //SET
                var getMemberIds = function(setid){
                    var setPath = _core.getSetPath(_nodes[_id].node,setid);
                    if(setPath && _nodes[setPath] && typeof _nodes[setPath].node === 'object'){
                        var members = _core.getChildrenPaths(_nodes[setPath].node);
                        var memberIds = [];
                        for(var i=0;i<members.length;i++){
                            if(_nodes[members[i]] && typeof _nodes[members[i]].node === 'object'){
                                memberIds.push(_core.getPointer(_nodes[members[i]].node,'member'));
                            }
                        }
                        return memberIds;
                    } else {
                        return [];
                    }
                };
                var getSetNames = function(){
                    var setids = _core.getSetRelids(_nodes[_id].node);
                    for(var i=0;i<setids.length;i++){
                        setids[i] = commonUtil.relidtosetid(setids[i])
                    }
                    return setids;
                };
                var getSetIds = function(){
                    return _core.getSetPaths(_nodes[_id].node);
                };
                //META
                var getValidChildrenTypes = function(){
                    return getMemberIds('ValidChildren');
                };

                ASSERT(_nodes[_id]);

                return {
                    getParentId : getParentId,
                    getId       : getId,
                    getChildrenIds : getChildrenIds,
                    getBaseId : getBaseId,
                    getInheritorIds : getInheritorIds,
                    getAttribute : getAttribute,
                    getRegistry : getRegistry,
                    getPointer : getPointer,
                    getPointerNames : getPointerNames,
                    getAttributeNames : getAttributeNames,
                    getRegistryNames : getRegistryNames,

                    //META functions
                    getValidChildrenTypes : getValidChildrenTypes,
                    getMemberIds          : getMemberIds,
                    getSetIds             : getSetIds,
                    getSetNames           : getSetNames
                }
            };


            //START
            initialize();
        };

        return ClientMaster;
    });
