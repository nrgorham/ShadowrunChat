
var bSpeech = true;
var zVoice;
var voices = window.speechSynthesis.getVoices();
var playerAliases = {};
var vm;

function DiceExpression(pool, modifier, limit) {

    this.Pool = pool;
    this.Modifier = modifier;
    this.Limit = limit;

}

DiceExpression.prototype.toString = function DiceExpressionToString() {
    var ret = this.Pool + "d" + ((this.Modifier != 0) ? ("+" + this.Modifier) : "") + ((this.Limit != 0) ? ("[" + this.Limit + "]") : "");
    return ret;
}
/*
DiceExpression.prototype.toJSON = function() {
    return {__class__: "DiceExpression", Pool: this.Pool, Modifier: this.Modifier, Limit: this.Limit};
}
*/

function DiceAlias(name, diceExpo) {

    this.Name = name;
    this.Dice = diceExpo;

}

DiceAlias.prototype.toString = function () {
    var ret = this.Name + " - " + this.Dice.toString();
    return ret;
}

/*
DiceAlias.prototype.toJSON = function() {
    return {__class__: "DiceAlias", Name: this.Name, Dice: this.Dice};
}
*/

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

$(function () {

    voices = window.speechSynthesis.getVoices();

    //require('bootstrap');
    var socket = io();

    if (sessionStorage) {
        if (sessionStorage.nickname != undefined) {
            var msg = sessionStorage.nickname;
            //chatVerbs.nickname.run("/nick " + sessionStorage.nickname);
            socket.emit("nickname change", msg)
        }
    }

    //This didn't work? Weird.'
    //var voices = window.speechSynthesis.getVoices();
    //var bSpeech = true;
    //var zVoice = 0;

    var restoreAliases = function(aliases) {
        
        //Vue.set(playerAliases, aliases);

        var t = {};

        for (k in aliases) {
            //
            t[k] = new DiceAlias(aliases[k].Name, new DiceExpression(aliases[k].Dice.Pool, aliases[k].Dice.Modifier, aliases[k].Dice.Limit));

        }

        vm.aliases = t;
        //playerAliases = aliases;


    };

    var sendAliases = function() {
        //I suspect this is what we want to not get the attached watchers from Vue?
        //socket.emit('aliasesToServer', JSON.parse(JSON.stringify(playerAliases)));
        //socket.emit('aliasesToServer', JSON.parse(JSON.stringify(vm.aliases)));
        socket.emit('aliasesToServer', vm.aliases);
    };


    var commandTestRx = /^\//;
    var chatVerbs = {

        nickname: {
            name: "Nickname",
            test: function (msg) {
                return /^\/nick (.+)$/.test(msg);
            },
            run: function (msg) {

                var newname = /^\/nick (.+)$/.exec(msg);
                newname = newname[1];
                socket.emit("nickname change", newname)
                //sessionStorage.nickname = newname;
            }

        },
        roll: {
            name: "Roll",
            test: function (msg) {
                return /^\/roll (.+)$/.test(msg);
            },
            run: function (msg) {
                //Roll
                //console.log("Roll Function");
                var m = /^\/roll (.+)$/.exec(msg)[1];
                socket.emit("roll", m);
            }
        },
        initiative: {
            name: "Initiative",
            test: function (msg) {
                return /^\/init (\d+)\s*\+\s*(\d+)d$/.test(msg);
            },
            run: function (msg) {
                var m = /^\/init (.+)$/.exec(msg)[1];
                socket.emit("initiative", m);
            }
        },
        speechtoggle: {
            name: "Speech Toggle",
            test: function (msg) {
                return /^\/speech(?:\s+(on|off))?$/.test(msg);
            },
            run: function (msg) {

                var m = /^\/speech(?:\s+(on|off))?$/.exec(msg)[1];
                var speechMsg;
                if (m == "on") {
                    bSpeech = true;
                    speechMsg = "Local text-to-speech enabled.";
                } else if (m == "off") {
                    bSpeech = false;
                    speechMsg = "Local text-to-speech disabled.";
                } else {
                    bSpeech = !bSpeech;
                    speechMsg = "Local text-to-speech toggled " + (bSpeech ? "on." : "off.");
                }
                addMessage(speechMsg, "msgSystem", false);
            }
        },
        alias: {
            name: "Aliases",
            test: function (msg) {
                return /^\/alias(.*)$/.test(msg);
            },
            run: function (msg) {
                try {
                    var aliasCommand = parseAlias(msg);
                    console.log(aliasCommand);

                    if (aliasCommand.status == "success") {
                        if (aliasCommand.command == "listAliases") {
                            //var keys = Object.keys(playerAliases);
                            var keys = Object.keys(vm.aliases);

                            if (keys.length == 0) {
                                addMessage("You don't have any stored aliases.", "msgError", false);

                            } else {
                                var output = "Aliases: ";

                                for (var i = 0; i < keys.length; i++) {
                                    //output += playerAliases[keys[i]].toString() + " ";
                                    output += vm.aliases[keys[i]].toString() + " ";
                                }

                                addMessage(output, "msgSystem", false);
                            }

                            


                        } else if (aliasCommand.command == "addAlias") {

                            //playerAliases[aliasCommand.alias] = new DiceAlias(aliasCommand.alias, aliasCommand.diceExpression);
                            //do to how Vue.js does stuff, we can't do this exactly
                            var newDA = new DiceAlias(aliasCommand.alias, aliasCommand.diceExpression);

                            Vue.set(vm.aliases, aliasCommand.alias, newDA);

                            //Vue.set(playerAliases, aliasCommand.alias, newDA);
                            //playerAliases[aliasCommand.alias] = newDA;
                            //vm.playerAliases
                            //inform the server
                            sendAliases();



                        } else if (aliasCommand.command == "removeAlias") {

                            //delete playerAliases[aliasCommand.alias];
                            Vue.delete(vm.aliases, aliasCommand.alias);
                            //inform the server
                            sendAliases();


                        } else {
                            console.log("Unhandled error running the alias command." + msg);
                        }
                    } else {
                        console.log("Unhandled error running the alias command." + msg);
                    }

                }
                catch (e) {
                    console.log(e);
                    //is it one of my messages?
                    if (typeof e.type !== undefined) {

                        addMessage("Error: " + e.type + " " + e.originalMessage, "msgError", false);

                    } else {
                        console.log(e);
                        throw e;
                    }
                }
            }
        }
    }

    //Say words! Called by addMessage if say=true;
    function sayString(str) {
        if (bSpeech) {
            var speech = new SpeechSynthesisUtterance(str);
            if (typeof zVoice !== undefined) {
                speech.voice = zVoice;
            }
            //speech.voice = window.speechSynthesis.getVoices()[4];
            window.speechSynthesis.speak(speech);
        }
    }

    //Why did I not encapsulate this before?
    function addMessage(msg, classes, say) {
        var element = $('<li>').text(msg);
        if (typeof classes !== undefined || classes != "") {
            element.addClass(classes);
        }

        $('#messages').append(element);

        if (say) {
            sayString(msg);
        }

    }

    //Here's the button pushing thing
    $('form').submit(function () {
        console.log("Submit function");
        var msg = $('#m').val();
        //did they type a command?
        if (commandTestRx.test(msg)) {
            console.log("I think I have a command");
            for (c in chatVerbs) {
                //for blah in thing gives a set of strings corresponding to the keys in the object
                //Not (as I thought), the values associated with those keys

                var command = chatVerbs[c];

                if (command.test(msg)) {
                    console.log("Detected command: " + command.name);
                    command.run(msg);
                }
            }
        }
        else {
            socket.emit('chat message', $('#m').val());
            console.log("Sent (chat message): " + $('#m').val());
        }
        $('#m').val('');

        return false;
    });

    socket.on('aliasesToClient', function(msg) {
        restoreAliases(msg);
    });

    socket.on('chat message', function (msg) {
        addMessage(msg, "msgSelf", false);
    });

    socket.on('nicknameChange', function (msg) {
        sessionStorage.nickname = msg;
        vm.loggedIn = true;
    });

    socket.on('roll', function (msg) {
        console.log(msg);

        var grammar;

        if (msg.successes == 1) {
            grammarSuccess = "success";
        } else {
            grammarSuccess = "successes";
        }

        var aliasString = "";

        if (msg.alias !== undefined) {
            aliasString = msg.alias + " and got ";
        }

        var outputMsg = msg.actor + " rolled " + aliasString + msg.successes + " " + grammarSuccess + " on " + msg.pool + " dice.";


        if (msg.glitchStatus == 2) {
            outputMsg += " It was a critical glitch! Oh no!"
        } else if (msg.glitchStatus == 1) {
            outputMsg += " It was a glitch!"
        }

        addMessage(outputMsg, "msgRoll", true);
        addMessage("Raw rolls: " + msg.histogram.toString(), "msgSystem", false);

    });

    socket.on('initiative', function (msg) {
        console.log(msg);

        var outputMsg = msg.actor + " rolled an initiative of " + msg.initiative + " on " + msg.diceString + ".";

        addMessage(outputMsg, "msgInitiative", true);

    })

    socket.on('errors', function (msg) {
        console.log("Error" + msg);

        addMessage(msg, "msgError", false);

    });

    function goodScroll(target, newChild) {
        var height = target.height();
        target.append(newChild);
        $('body').animate({ scrollTop: $("body").height() }, 500);
    }

    $('#messages').on("change", function (e) {
        $('body').animate({ scrollTop: $("body").height() }, 500);
        return false;
    });
    
    setInterval(function() {
        $('body').animate({ scrollTop: $("body").height() }, 500);
    }, 1000);

    vm = new Vue({
        el: '#alias',
        template: `
            <div v-if="loggedIn" id="alias">
                <p>Aliases</p>
                <ul>
                    <template v-for="(a, key) in aliases">
                        <li>
                            <button v-on:click="test(key)">{{a.toString()}}</button>
                        </li>
                    </template>
                </ul>
                <div>
                    <p>Alias commands</p>
                    <ul>
                    <li>/alias add Name #d[Limit]</li>
                    <li>/alias remove Name</li>
                    <li>/alias <span>List aliases</span></li>
                    </ul>
                </div>
            </div>
            `,
        data: {
            message: "Test?",
            loggedIn: false,
            aliases: playerAliases
        }, 
        methods: {
            test: function(key) {
                //alert("Hooray? " + this.aliases[key].toString())
                var current = this.aliases[key];

                var aliasRollMessage = {

                    type: "aliasRollMessage",
                    name: current.Name,
                    dice: current.Dice

                }

                socket.emit('aliasRollMessage', aliasRollMessage)

            }

        }
    })

});
