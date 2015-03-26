//#!/usr/bin/env node
/*jslint node: true */
"use strict";

//Required Files
//vm.runInThisContext(fs.readFileSync(__dirname + "/extfile.js")) //look into fo including files from a commands dir
var irc = require( "twitch-irc" );
var mysql = require( "mysql" );
var events = require('events');

//Global Vars & config include
var version = "0.1.0";
var config = require('./config.json');
var channels = [];
var channelData = [];
var commandtimer = 5;
var event = new events.EventEmitter();

//Create Database Connection
var dbConnection = mysql.createConnection( {
  host: config.dbHost,
  user: config.dbUser,
  password: config.dbPass,
  database: config.dbName,
} );

//Get Channels
dbConnection.query( "SELECT channel, mod_only FROM bot_channels", function( err, rows, fields ) {
    for( var x = 0; x < rows.length; x++ ) {
        var channel = rows[x].channel;
        channels.push( channel );
        channelData[ channel ] = {
            settings: {
                mod_only: rows[x].mod_only
            },
            mods: [],
            timer: 0
        };
    }
} );

//Create Twitch connection
var client = new irc.client( {
    options: {
        debug: config.debug,
        debugIgnore: ['ping', 'chat', 'action'],
        logging: false,
        tc: 3
    },
    identity: {
        username: config.nickname,
        password: config.password
    },
    channels: channels
} );

client.connect();

//Client Event Subs
client.addListener( 'chat', function( channel, user, message ) {
    var tmp = message.split( " " );
    var command = tmp.shift();
    var text = tmp.join( " " );
    var commandText = "command#" + command;
    //console.log( { command: commandText } );
    event.emit( commandText, channel, user, text );
} );

client.addListener( 'mods', function( channel, mods ) {
    channelData[ channel ].mods = mods;
    console.log( {
        channel: channel,
        mods: channelData[ channel ].mods
    } );
} );

client.addListener( 'crash', function( message, stack ) {
    process.exit( 0 );
} );

/*client.addListener( 'ping', function() {
    console.log( '-> PING! ');
} );

client.addListener( 'pong', function() {
    console.log( '<- PONG! ');
} );*/

//Commands!
event.on( "command#!test", function( channel, user, message ) {
    console.log( {
        channel: channel,
        user: user,
        message: message,
        channel_data: channelData,
        mydata: channelData[ channel ],
        channel_settings: channelData[ channel ].settings
    } );
} );

event.on( "command#!card", function( channel, user, message ) {
    if( channelData[ channel ].settings.mod_only && ( user.special[0] != 'mod' && user.special[0] != "broadcaster" ) ) {
        console.log( "User is not allowed to access this command" );
        console.log( user );
        return false;
    }
    var tempDate = new Date();
    var dateDiff = ( tempDate - channelData[ channel ].timer ) / 1000;
    console.log( "dateDiff: " + dateDiff );
    if( dateDiff >= commandtimer || channelData[ channel ].settings.timer == 0 ) {
        if( message.length < 4 ) {
            client.say( channel, "Your search must be longer than 4 characters" );
        }
        else {
            cardSearch( message, channel );
            channelData[ channel ].timer = new Date();
        }
    }
} );

event.on( "command#!iwhelp", function( channel, user, message ) {
    client.say( channel, "There is no helping you!" );
} );

event.on( "command#!iwjoin", function( channel, user, message ) {
    dbConnection.query( "SELECT channel FROM bot_channels WHERE channel = '#" +  user.username + "'", function(err, rows, fields) {
        if( rows.length === 0 ) {
            dbConnection.query( "INSERT INTO bot_channels (channel) VALUES ( '#" + user.username + "')" );
        }
    } );
    client.join( "#" + user.username );
} );

event.on( "command#!iwmodonly", function( channel, user, message ) {
    var curerntSetting = channelData[ channel ].settings.mod_only;
    curerntSetting ^= 1;
    if( curerntSetting == 1 ) {
        client.say( channel, "IWBOT Mod only mode is now on " );
    }
    else {
        client.say( channel, "IWBOT Mod only mode is now off" );
    }
    channelData[ channel ].settings.mod_only = curerntSetting;
    dbConnection.query( "UPDATE bot_channels SET mod_only = " + curerntSetting + " WHERE channel = '" + channel + "'" );
} );

//Funcions
function cardSearch( name, channel ) {
 var sql = "SELECT `name`, `card_set`, `rarity`, `faction`, `second_faction`, `third_faction`, `power`, `health`, `cost`, `card_text` FROM cards WHERE name LIKE '%" + name + "%'";
 name = name.replace(/(\r\n|\n|\r)/gm," ").trim();
 dbConnection.query( sql, function( err, rows, fields ) {
    if( rows.length > 1 ) {
        var cardList = [];
        for( var x = 0; x < rows.length; x++ ) {
            cardList[x] = rows[x].name;
        }
        cardList = cardList.join( " | " );
        client.say( channel, "Most than one result found => " + cardList );
    }
    else if( rows.length == 1 ) {
        var message = getCardString( rows[0] );
        client.say( channel, message );
    }
    else {
        client.say( channel, "No card matching [ " + name + " ] was found" );
    }
 } );
}

String.prototype.replaceNewLine = function() {
    return this.replace( /(\r\n|\n|\r)/gm, " " );
};

function getCardString( card ) {
    var factionList = getFaction( card.faction ) + getFaction( card.second_faction ) + getFaction( card.third_faction );
    return card.name +" [Rarity: " + card.rarity + "] [Factions: " + factionList +"] [Cost: " + card.cost + "] [Stats: " + card.power + "/" + card.health + "] [Set: " + card.card_set + "]: " + card.card_text;
}

function getFaction( faction ) {
    //TODO: Find a better way to do this
    var tmp;
    switch( faction ) {
         case "FlameDawn":
            tmp = "F";
        break;
        case "ZombieFaction":
            tmp = "S";
        break;
        case "CultOfVerore":
            tmp = "C";
        break;
        case "DescendentsOfTheDragon":
            tmp = "D";
        break;
        case "GenesisIndustries":
            tmp = "G";
        break;
        case "TheWarpath":
            tmp = "W";
        break;
        case "TheExiles":
            tmp = "E";
        break;
        case "Angels":
            tmp = "A";
        break;
        case "Federation":
            tmp = "Fe";
        break;
        case "Klingon":
            tmp = "K";
        break;
        default:
            tmp = "N";
        break;
    }
    return tmp;
}
