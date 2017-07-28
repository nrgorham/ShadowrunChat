'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

//node-persist storage
var storage = require('node-persist');

storage.initSync();

app.get('/', function (req, res) {
    //res.send('<h1>Hello world</h1>');
    res.sendFile(__dirname + "/index.html");
});

var chatLog = storage.getItemSync('chatLog');
var chatIndex = storage.getItemSync('chatIndex');

console.log(chatLog);

if (chatLog === undefined) {
    //we have no stored chat
    chatLog = [];
    chatIndex = 0;
    storage.setItem('chatLog', chatLog);
    storage.setItem('chatIndex', chatIndex);
}

function storeChat(msg) {
    chatLog[chatIndex] = msg;
    chatIndex = (chatIndex + 1) % 100
    saveChat();
}

function getRecentChat(offset) {
    if (offset > 0) {
        throw "Unsupported offset for getRecentChat. We can only see the past, so you can only pass negative numbers";
    }

    var oldIndex = (chatIndex + offset) % 100;
    var oldMsg = chatLog[oldIndex];

    return oldMsg;
}

//This makes anything in the /public folder servable
app.use(express.static('public'));

function saveChat() {
    //I am going to fuck up typing in the key name somewhere, so I'm making a function that literally just does that
    storage.setItem('chatLog', chatLog);
    storage.setItem('chatIndex', chatIndex);
}



var UserStorage = function (store) {


    this.ActiveUserNames = [];

    //node-persist based storage
    this.Storage = store;

    //retrieve our stored users from the storage method
    this.Users = this.Storage.getItemSync("Users");

    if (this.Users === undefined) {
        //Initialize
        this.Users = {};

    }

    this.anonCount = 1;
    this.NewAnonymousUsername = function () {

        //make a name
        var name = "DefaultUser" + this.anonCount++;

        //push it to the current users list
        //this.ActiveUserNames.push(name);
        this.ActiveUserNames[name] = name;

        //send it back
        return name;
    }

    this.UserDisconnected = function (name) {

        //when they disconnect

        //remove them from the ActiveUserNames list

        delete this.ActiveUserNames[name]


        //if they're a real user, save their data (which is everyone's data because our storage method is a poorly scaling toy

        if (this.hasUser(name)) {

            this.Storage.setItem('Users', this.Users);

        }

        //if they're an anonymous one, we can delete it

        //oh wait, we don't store anything on anons? we can skip then

    }

    this.UserConnected = function (name) {

        //add them to the activeusernames list
        this.ActiveUserNames[name] = name;
        //this.ActiveUserNames.push(name);

        //the other logic will come from when they change username to a new thing.

    }

    this.getUser = function (name) {

        if (this.Users[name]) {
            return this.Users[name];
        }

        return undefined;
    }

    this.hasUser = function (name) {

        if (this.Users[name]) {
            return true;
        }

        return false;

    }

    this.addUser = function (name) {

        var newGuy = new Player(name);

        this.Users[name] = newGuy;

        this.Storage.setItem('Users', this.Users);

        //return a ref to the guy
        return newGuy;

    }

    this.SaveUsers = function () {

        this.Storage.setItem('Users', this.Users);

    }

}

var Users = new UserStorage(storage);
Users.ActiveUserNames = {};

io.on('connection', function (socket) {
    console.log('a user connected');

    //These are per-connection data fields

    var nickname = Users.NewAnonymousUsername();

    Users.UserConnected(nickname);

    var edge = 0;

    //set this to the active user once we've saved them
    var me;

    /*
    on client connection, send the last 10 chat messages so they don't feel lonely
    */

    for (var i = -10; i < 0; i++) {
        var oldMessage = getRecentChat(i);
        if (oldMessage !== undefined) {
            socket.emit('chat message', oldMessage);
        }
    }

    socket.on('disconnect', function (socket) {
        console.log(nickname + ' disconnected');
        Users.UserDisconnected(nickname);

    });
    socket.on('chat message', function (msg) {
        console.log('message: ' + msg);
        var mString = nickname + ': ' + msg;
        storeChat(mString);
        io.emit('chat message', mString);

    });
    socket.on('nickname change', function (msg) {

        try {
            //Are they changing to a name not currently connected?

            if (Users.ActiveUserNames[msg]) {
                var eMessage = "Proposed nickname (" + msg + ") is in already in use. Please choose a different name."
                socket.emit('errors', eMessage);
                throw (eMessage);
            }

            //Is the name they're trying to become valid (i.e. is it not DefaultUser\d+?) 
            var invalidUsernameRx = /(^DefaultUsers?\d+$)|(^\d+(.+)$)|(^.{30,})|(^Server$)/i
            if (invalidUsernameRx.test(msg)) {
                var eMessage = "Proposed nickname (" + msg + ") is invalid. Real names can't be 'DefaultUser', begin with numbers, or be overly long."
                socket.emit('errors', eMessage);
                throw (eMessage);
            }

            //Does the name exist already or are they making a brand new one?

            if (Users.hasUser(msg)) {

                me = Users.getUser(msg);

            } else {

                me = Users.addUser(msg);

            }

            console.log('Nickname change: ' + nickname + ' is now known as ' + msg);
            var mString = 'Nickname change: ' + nickname + ' is now known as ' + msg;
            socket.emit("nicknameChange", msg);
            io.emit('chat message', mString);
            storeChat(mString);
            Users.UserDisconnected(nickname);
            nickname = msg;
            Users.UserConnected(nickname);
        }

        catch (error) {
            console.log("Error when " + nickname + " tried to change name to (" + msg + ").\nMessage was:" + error);
            socket.emit('errors', "Error while trying to change nickname: " + error);
        }
    });
    socket.on('roll', function (msg) {
        console.log(nickname + " is rolling dice. Msg = " + msg);

        try {
            var rollRx = /^(\d+)d(?:\[(\d+)\])?(\!)?$/
            if (rollRx.test(msg)) {
                var rawRequest = rollRx.exec(msg);
                var pool;
                var limit = 0;
                var explode = false;
                //group 1 is the pool size
                var pool = parseInt(rawRequest[1]);

                if (pool > 200) {
                    console.log("Some dickhead tried to roll " + pool + " dice.");
                    throw ("Hey asshole, that's too many dice.");
                }

                //group 2 (if present) is the limit
                if (rawRequest[2] != undefined) {
                    var limit = parseInt(rawRequest[2]);
                }
                if (rawRequest[3] == "!") {
                    explode = true;
                    //add the edge value to the pool size
                    pool += edge;
                }
                var rollRequest = {
                    zPool: pool,
                    zLimit: limit,
                    bPushTheLimit: explode,
                    zEdge: 0
                }

                var histo = Roller.RollDice(rollRequest);

                var successes = histo[4] + histo[5];
                var ones = histo[0];

                var count = 0;
                for (var i = 0; i < histo.length; i++) {
                    count += histo[i];
                }

                var glitchThreshold = Math.ceil(count / 2);
                var glitch = ones >= glitchThreshold ? true : false;

                var glitchStatus = 0;

                if (glitch && successes == 0) {
                    //Crit Glitch
                    glitchStatus = 2;
                } else if (glitch) {
                    //Glitch
                    glitchStatus = 1;
                } else {
                    //Fine
                    glitchStatus = 0;
                }

                var outMessage = {
                    actor: nickname,
                    successes: successes,
                    ones: ones,
                    glitchStatus: glitchStatus,
                    histogram: histo,
                    pool: pool
                };

                console.log("Trying to emit" + outMessage);

                io.emit("roll", outMessage);
                io.emit("chat message", nickname + " rolled some dice.");
                var mString = nickname + " rolled some dice.";
                storeChat(mString);

            } else {
                //invalid request
                throw ("Invalid roll request. " + msg + " is not a valid format.");
            }
        } catch (e) {

            socket.emit('errors', "Error rolling dice:" + e);
            console.log(nickname + " had an error: " + e);
        }

    });
    socket.on('initiative', function (msg) {
        try {
            var initRx = /^(\d+)\+(\d+)d6?$/
            if (initRx.test(msg)) {
                var rawRequest = initRx.exec(msg);

                var base = parseInt(rawRequest[1]);

                if (base >= 30) {
                    throw ("Hey asshole, that's way too much base initiative.");
                }

                var initDice = parseInt(rawRequest[2]);

                if (initDice >= 10) {
                    throw ("Hey asshole, that's way too many initiative dice.");
                }

                if (initDice < 0) {
                    throw ("I'm pretty sure I can't throw negative initiative dice. How did that even happen?");
                }

                var initiative = base;

                for (var i = 0; i < initDice; i++) {
                    initiative += Math.floor(Math.random() * 6) + 1;
                }

                //All done

                var initiativeMessage = {
                    actor: nickname,
                    initiative: initiative,
                    diceString: (base + " + " + initDice + "d6")
                }

                if (me) {
                    me.Initiative = msg;
                }
                io.emit('initiative', initiativeMessage);
                storeChat(initiativeMessage);
            }
            else {
                throw ("Invalid initiative roll.");
            }
        }
        catch (e) {
            socket.emit('errors', "Error rolling initiative: " + e);
            console.log(nickname + " had an error: " + e);
        }
    });
});

http.listen(3000, function () {
    console.log('listening on *:3000');
});



var Roller = {

    RollDice: function (request) {
        /*
        request object {
            zPool (how many to roll)
            zLimit (max # of successes)
            bPushTheLimit (using push the limit rules)
            zEdge (edge)
        }
        */

        var rolls = [];

        var totalRolls = request.bPushTheLimit ? request.zPool : (request.zPool + request.zEdge);

        var ones = 0;
        var successes = 0;
        var sixes = 0;

        for (var i = 0; i < totalRolls; i++) {
            var singleroll = Roller.Roll(request.bPushTheLimit);
            rolls = rolls.concat(singleroll);

        }

        rolls = rolls.sort(function (a, b) { return a - b });

        var histo = [0, 0, 0, 0, 0, 0];

        for (var i = 0; i < rolls.length; i++) {
            histo[rolls[i] - 1]++;
        }

        return histo;

    },

    debugRolls: function (size, push, edge) {

        return Roller.RollDice({ zPool: size, zLimit: 10, bPushTheLimit: push, zEdge: edge });

    },

    Roll: function (explode) {
        var roll = Math.floor(Math.random() * 6) + 1;
        var rolls = [roll];
        if (explode && roll == 6) {
            var Exploders = Roller.Roll(explode);
            for (var i = 0; i < Exploders.length; i++) {
                rolls.push(Exploders[i]);
            }
        }
        return rolls;
    }
}

//Define a Player object for storing our data

function Player(Name) {
    this.Name = Name;

    this.Aliases = {};
    this.hasAlias = function (aliasName) {
        return this.Aliases.hasOwnProperty(aliasName);
    }

    this.RollAlias = function (aliasName, modifiers) {

        //TODO
        if (this.Aliases.hasOwnProperty(aliasName)) {
            console.log("Rolling alias");

        } else {
            throw "Error trying to roll alias " + aliasName + ". Not found in player " + this.Name;
        }
    }

    this.Edge = 0;

    this.Initiative = "1";
}

/*
    Aliases

    Valid aliases start with an upper/lowercase letter followed by up to 30 total letters/digits

    RX for command names:
    /[A-Za-z][A-Za-z0-9_]{1,30}/
    
    Dice Expressions
    /^([1-9]\d{0,2})d6?(?:+([1-9]\d{0,2}))?(?:\[([1-9]\d{0,2})\])?$/

    $1 (dice), $2 (static mod), $3 (limit)

    User commands:
    /alias
    /alias add [A-Za-z][A-Za-z0-9]{1,30}
    /alias remove [A-Za-z][A-Za-z0-9]{1,30}
    /alias help

    alias command Rx

    /^\/alias(\s\S+)?(\s\S+)?(\s\S+)?$/
    
    

*/

function DiceExpression(pool, modifier, limit) {

    this.Pool = pool;
    this.Modifier = modifier;
    this.Limit = limit;

}

DiceExpression.prototype.toString = function DiceExpressionToString() {
    var ret = this.Pool + "d" + ((this.Modifier != 0) ? ("+" + this.Modifier) : "") + ((this.Limit != 0) ? ("[" + this.Limit + "]") : "");
    return ret;
}


function parseAlias(input) {

    //super broad test
    var aliasCommandRX = /^\/alias(?:\s(\S+))?(?:\s(\S+))?(?:\s(\S+))?$/
    var aliasSubCommandRX = /^(add|remove|help)$/
    var aliasNameRX = /^([A-Za-z][A-Za-z0-9_]{1,30})$/
    var aliasDiceExpressionRX = /^([1-9]\d{0,2})d6?(?:\+([1-9]\d{0,2}))?(?:\[([1-9]\d{0,2})\])?$/
    try {
        if (aliasCommandRX.test(input)) {
            //okay well it might actually be a command!
            var matches = aliasCommandRX.exec(input);

            /*
                matches[1] = possible command
                matches[2] = possible alias
                matches[3] = possible dice expression if needed
            */

            if (matches[1] == undefined) {
                //basic alias command
                //list out the available aliases 
                return {
                    status: "success",
                    command: "listAliases"
                }
            } else {
                //we might have an actual command
                if (aliasSubCommandRX.test(matches[1])) {
                    //We have kind of a command
                    var submatches = aliasSubCommandRX.exec(matches[1]);

                    if (submatches[1] == "add" || submatches[1] == "remove") {
                        //We want to try to add/remove a command

                        //Do we have a valid potential command name?
                        if (aliasNameRX.test(matches[2])) {
                            var targetAlias = aliasNameRX.exec(matches[2])[1];

                            var out = {
                                status: "success",
                                command: submatches[1] + "Alias",
                                alias: targetAlias
                            }

                            if (submatches[1] == "remove") {
                                //remove is done at this point
                                return out;
                            } else {
                                //Not done yet. If we're adding an alias we need to see if we've got a valid dice expression
                                if (aliasDiceExpressionRX.test(matches[3])) {
                                    //Hooray!
                                    var diceExpressionParts = aliasDiceExpressionRX.exec(matches[3]);

                                    //$1 pool, $2 static mod, $3 limit
                                    var pool = parseInt(diceExpressionParts[1]);
                                    var modifier = (typeof diceExpressionParts[2] !== 'undefined') ? parseInt(diceExpressionParts[2]) : 0;
                                    var limit = (typeof diceExpressionParts[3] !== 'undefined') ? parseInt(diceExpressionParts[3]) : 0;

                                    out.diceExpression = new DiceExpression(pool, modifier, limit);

                                    return out;

                                } else {
                                    throw {
                                        type: "Invalid dice expression when trying to add an alias.",
                                        originalMessage: input
                                    }
                                }
                            }

                            throw {
                                type: "Unknown error somewhere in the subcommand matching part. We went down neither the add, remove or help branches.",
                                originalMessage: input
                            }
                            
                        } else {
                            throw {
                                type: "Invalid alias name when trying to " + submatches[1] + " an alias.",
                                originalMessage: input
                            }
                        }
                    } else if (submatches[1] == "help") {

                        return {
                            status: "success",
                            command: "help"
                        }

                    } else {
                        throw {
                            type: "Invalid subcommand. Which is weird, because we passed the RX",
                            originalMessage: input
                        }
                    }


                } else {
                    throw {
                        type: "Invalid subcommand",
                        originalMessage: input
                    }
                }
            }
        } else {
            //Well that command's all wrong then
            throw {
                type: "Invalid command",
                originalMessage: input
            }
        }
    }
    catch (e) {
        //for now, no handling
        throw e;
    }

}