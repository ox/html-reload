#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');

// ws is for websockets
const WebSocketServer = require('ws').Server;

// gar is for argument parsing
const gar = require('gar');

const watch = require('./watcher');

// Create a web server to serve dir, while injecting a hot-reload WS script into
// the index.html
function serve(fullPath, dir) {
  const app = express();

  // Fetch the modified index.html
  app.get('/', (req, res) => {
    const index = fs.readFileSync(fullPath).toString();
    const injectedReloader = fs.readFileSync('./injected-reloader.html').toString();
    const env = `
      <script>
        window.port = '${8080}';
        window.index = '${path.basename(fullPath)}';
      </script>
    `
    const injected = index.replace('</body>', `${env}${injectedReloader}</body>`);
    res.write(injected);
    res.end();
  });

  // Serve the dir
  app.use(express.static(dir));

  return app;
}

// Called from the command line. Supported usage: hot-code-reload <dir>
if (require.main === module) {
  const args = gar(process.argv.slice(2));
  if (args._.length < 1) {
    console.error('Usage: hot-code-reload <path to index.html>');
    process.exit(1);
  }

  const index = args._[0];
  if (!index.endsWith('.html')) {
    console.error('Expecting index file to end in .html');
    process.exit(1);
  }

  // Full paths to index file and the dir it's in
  const fullPath = path.resolve(index);
  const dir = path.dirname(fullPath);

  const app = serve(fullPath, dir);
  const server = app.listen(8080, () => {
    console.log('Server listening on', 8080);
  });

  const wss = new WebSocketServer({server, path: '/ws'});
  const listeners = new Set();
  wss.on("connection", (ws) => {
    console.log("Client connected to server");
    listeners.add(ws);

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        switch (msg.action) {
          case 'ping':
          ws.send(JSON.stringify({action: 'pong'}));
          break;
        }
      } catch (e) {
        console.error('Error parsing message from client:', e)
        ws.close();
        return;
      }
    })
  });

  // Start watching the directory the index file is in
  console.log('Watching', fullPath, 'at', dir);
  const watcher = watch(dir, () => {
    console.log('Reloading clients');
    listeners.forEach((ws) => {
      ws.send(JSON.stringify({action: 'reload'}));
    });
  });

  // Trap SIGINT and shutdown the watcher when it's captured
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, () => {
      console.log(`Received ${signal}, shutting down watcher`);
      watcher.close();

      console.log('Closing server');
      server.close();
    });
  });
}
