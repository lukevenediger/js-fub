/**
 * Firebase UDP Bridge client
 * Created by lukevenediger on 2016/03/08.
 */

/* jshint -W097 */
/* globals WebSocket, print, console, setTimeout, require, module */
'use strict';

var PLite = require('plite');

// Capture the log function for this platform
var debugLog;
if (print) {
    debugLog = print;
} else if (console && console.log) {
    debugLog = console.log;
} else {
    debugLog = function() { /* noop */ };
}

/**
 * Create a new Firebase UDP Bridge client
 * @param {String} fubServer the WebSocket address
 * @param {String} deviceID the device ID
 * @param {Boolean} enableDebugLogs flag to enable or disable debug logging
 * @constructor
 * @class
 */
function FUB(fubServer, deviceID, enableDebugLogs) {
    var ws,
        sessionID,
        serverTime,
        attempts = 1,
        isSocketReady = false;

    var AUTH_TIMEOUT = 10000;

    var MessageType = {
        PING: 'ping',
        GET: 'get',
        VALUE: 'value',
        SET: 'set',
        SET_ONCE: 'set_once',
        INCREMENT: 'increment',
        PUSH: 'push',
        SUBSCRIBE: 'subscribe',
        SUBSCRIBE_CHANNEL: 'subscribe_channel',
        UNSUBSCRIBE: 'unsubscribe',
        ERROR: 'error',
        AUTHENTICATE: 'authenticate',
        SESSION_START: 'session_start',
        LOG: 'log'
    };

    var LogLevel = {
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error'
    };

    if (!enableDebugLogs) {
        debugLog = function() { /* noop */ };
    }

    /**
     * Initialise the client library and connect immediately
     */
    function initialise() {
        attempts = 1;
        isSocketReady = false;

        createWebSocket();
    }

    /**
     * Create the websocket and proceed with authentication
     */
    function createWebSocket () {
        debugLog('Connection attempt ' + attempts);
        ws = new WebSocket(fubServer);

        ws.onopen = function () {
            // reset the tries back to 1 since we have a new connection opened.
            attempts = 1;

            // Proceed with auth
            authenticate()
                .then(function success(sID, sTime) {
                    debugLog('Authenticated. SessionID: ' + sID);
                    sessionID = sID;
                    serverTime = sTime;
                    ws.onmessage = onIncomingMessage;
                    isSocketReady = true;
                })
                .catch(function failed(error) {
                    debugLog('Authentication failed: ' + error);
                    reconnect();
                });
        };

        ws.onerror = function(error) {
            debugLog('Error: ' + error);
        };

        ws.onclose = function () {
            debugLog('Closed.');
            isSocketReady = false;
            reconnect();
        };

        function reconnect() {
            debugLog('Reconnecting...');
            var time = generateInterval(attempts);
            debugLog('Waiting ' + time + 'ms to reconnect...');
            setTimeout(function () {
                // We've tried to reconnect so increment the attempts by 1
                attempts++;

                // Connection has closed so try to reconnect every 10 seconds.
                createWebSocket();
            }, time);
        }

        function generateInterval (k) {
            return Math.min(30000, k * 1000);
        }
    }

    function authenticate() {
        return PLite(function (resolve, reject) {

            var authSuccessful = false;
            // Set up a timeout that will fire if we don't
            // get an auth response in time
            setTimeout(function expired() {
                if (!authSuccessful) {
                    reject('Auth request timed out.');
                }
            }, AUTH_TIMEOUT);

            ws.onmessage = function(raw) {
                debugLog(raw);
                debugLog('Got auth response: ' + raw.data);
                authSuccessful = true;
                var message = JSON.parse(raw.data);
                if (message.type === MessageType.SESSION_START) {
                    resolve(message.sessionID, message.serverTime);
                } else {
                    reject('Unexpected response: ' + raw);
                }
            };

            debugLog('Sending auth packet');
            send({
                type: MessageType.AUTHENTICATE,
                id: deviceID
            }, true);
        });
    }

    function onIncomingMessage(raw) {
        debugLog('Got: ' + raw.data);
    }

    function send(message, override) {
        if (isSocketReady || override) {
            debugLog('Socket is ready. ');
            debugLog('Stringifying ' + message);
            var raw = JSON.stringify(message);
            debugLog('Sending ' + raw);
            ws.send(raw);
        } else {
            debugLog('Ignoring send - socket is not ready.');
        }
    }

    function log(level, module, message) {
        send({
            type: MessageType.LOG,
            version: 1,
            sessionID: sessionID,
            level: level,
            module: module,
            message: message
        });
    }

    this.connect = function() {
        createWebSocket();
    };

    this.getSessionID = function() {
        return sessionID;
    };

    this.set = function(path, value) {
        send({
            type: MessageType.SET,
            path: path,
            value: value
        });
    };

    this.setOnce = function(path, value) {
        send({
            type: MessageType.SET_ONCE,
            path: path,
            value: value
        });
    };

    this.increment = function(path, value) {
        send({
            type: MessageType.INCREMENT,
            path: path,
            value: value
        });
    };

    this.logInfo = function(module, message) {
        log(LogLevel.INFO, module, message);
    };

    this.logWarn = function(module, message) {
        log(LogLevel.WARN, module, message);
    };

    this.logError = function(module, message) {
        log(LogLevel.ERROR, module, message);
    };

    initialise();
}

FUB.FUBConstants = {
    TIMESTAMP: 'fub:timestamp'
};

module.exports = FUB;
