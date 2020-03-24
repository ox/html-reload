#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');

const injectedReloader = `
<style id="reload-indicator-style">
#reload-indicator {
    display: none;
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: green;
    top: 10px;
    right: 10px;
}

#reload-indicator.connected {
    display: block;
    animation: pulse 5s infinite;
}

@keyframes pulse {
    0% {
        display: block;
        opacity: 0;
    }

    50% {
        display: block;
        opacity: 1;
    }

    100% {
        display: block;
        opacity: 0;
    }
}
</style>

<script type="application/javascript" class="loader">
    const styleText = document.getElementById('reload-indicator-style').textContent;

    // Reloader is loaded on the first fetch to /. It injects itself into the page vm,
    // then "disappears" from the code on the next reload. It recreates the indicator,
    // and it's style, on each reload.
    function Reloader() {
        this.websocket = null;

        // Create an indicator
        this.indicator = null;
        this.lastPing = false;

        this.createIndicator = () => {
            this.indicator = document.createElement('div');
            this.indicator.id = "reload-indicator";
            document.body.appendChild(this.indicator);
        }

        this.addIndicatorStyle = () => {
            const style = document.createElement('style');
            style.textContent = styleText;
            document.body.appendChild(style);
        }

        this.startHeartbeat = () => {
            this.heartbeatInterval = setInterval(() => {
                if (!this.websocket || this.websocket.readyState > 1) {
                    clearInterval(this.heartbeatInterval);
                    this.connect();
                    return;
                }

                if (this.lastPing === false) {
                    this.indicator.classList.remove('connected');
                }

                this.websocket.send(JSON.stringify({action: 'ping'}));
            }, 1000);
        }

        this.connect = () => {
            // Close the existing socket
            if (this.websocket) {
                this.websocket.close();
            }

            this.websocket = new WebSocket('ws://localhost:' + window.port + '/ws');
            this.websocket.onopen = () => {
                console.log('Websocket open');
                this.createIndicator();
                this.startHeartbeat();
            };

            this.websocket.onclose = () => {
                console.log('Websocket closed');
                this.indicator.classList.remove('connected');
            }

            this.websocket.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                switch (msg.action) {
                case 'reload':
                    return fetch(window.index)
                        .then((response) => response.text())
                        .then((html) => {
                            console.log('Replacing document');
                            document.open();
                            document.write(html);
                            document.close();

                            this.createIndicator();
                            this.addIndicatorStyle();
                        });
                    break;
                case 'pong':
                    this.indicator.classList.add('connected');
                    break;
                }
            }
        }
    }

    if (!window.reloader) {
        window.reloader = new Reloader();
        window.reloader.connect();
    }
</script>
`;

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
