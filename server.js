const WebSocket = require('ws');

const STREAM_REFRESH_MS = Math.round(1000 / 60); // 60 FPS

const wss = new WebSocket.Server({ port: 3333 });

var serverState = {
  toGame: {},
  toPad: {},
}; // [gameId]=[messageObject, messageObject, ...]

function initGameState(gameId) {
  if (serverState.toGame[gameId] === undefined) {
    serverState.toGame[gameId] = [];
  }
  if (serverState.toPad[gameId] === undefined) {
    serverState.toPad[gameId] = [];
  }
}

wss.on('connection', function connection(ws, req) {
  var clientState = {
      didHello: false,
      role: undefined, // Either: PAD or GAME
      gameId: undefined, // Any string, used to route the game inputs to the game
      playerId: undefined, // Any string, can be shown on the gamepad with a color, is sent with the other packets to the game
      handler: globalInitHandler // message handler. Dynamically during initialization. After init, it is either "stackPadInputs" or "streamInputsToGame"
  };

  /*
    Protocol:
    - client HELLO
    - client PAD / GAME
        - PAD:
            - client gameId: eg "platformer"
            - (client streams inputs)
        - GAME:
            - client gameId: eg "platformer"
            - server stacks inputs from pad client, streams them to the appropriate game clients, format depends on the game
  */

  function logSend(msg) {
    console.log(`< ${msg}`);
    ws.send(msg);
  }

  function globalInitHandler(message) {
    if (!clientState.didHello) {
        if (message === "HELLO") {
            clientState.didHello = true;
        } else {
            ws.close(1002, "who dis?");
        }
    } else if (clientState.role === undefined) {
        if (message === "PAD") {
            clientState.role = 'PAD';
            clientState.handler = padInitHandler;
        } else if (message == "GAME") {
            clientState.role = 'GAME';
            clientState.handler = gameInitHandler;
        } else {
            ws.close(1002, "Are you a PAD or a GAME?");
        }
    } else {
        ws.close(1001, "Server error: init is already done");
    }
  }

  function padInitHandler(message) {
    if (clientState.gameId === undefined) {
      clientState.gameId = message;
      initGameState(clientState.gameId);
      clientState.handler = padStreamHandler;

      function streamToPad() {
        while (serverState.toPad[clientState.gameId].length > 0) {
          logSend(serverState.toPad[clientState.gameId].shift());
        }
        setTimeout(streamToPad, STREAM_REFRESH_MS);
      }

      function padStreamHandler(message) {
        serverState.toGame[clientState.gameId].push(message);
      }

      streamToPad();
    }
  }

  function gameInitHandler(message) {
    if (clientState.gameId === undefined) {
      clientState.gameId = message;
      initGameState(clientState.gameId);
      clientState.handler = gameStreamHandler;

      function streamToGame() {
        while (serverState.toGame[clientState.gameId].length > 0) {
          logSend(serverState.toGame[clientState.gameId].shift());
        }
        setTimeout(streamToGame, STREAM_REFRESH_MS);
      }

      function gameStreamHandler(message) {
        serverState.toPad[clientState.gameId].push(message);
      }

      streamToGame();
    }
  }

  console.log(`client connected: ${req.socket.remoteAddress}`);

  ws.on('message', function incoming(message) {
    console.log('> %s', message);
    clientState.handler(message);
  });

  ws.on('close', function disconnect(code, reason) {
    console.log(`CLOSE ${code} ${reason}`)
  });
});