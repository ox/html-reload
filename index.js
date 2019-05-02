const express = require('express');
const fs = require('fs');
const path = require('path');

// gar is for argument parsing
const gar = require('gar');

const watch = require('./watcher');

// Create a web server to serve dir, while injecting a hot-reload WS script into
// the index.html
function serve(fullPath, dir) {
  const app = express();

  // Fetch the modified index.html
  app.get('/', (req, res) => {
    res.write(fs.readFileSync(fullPath));
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

  // Start watching the directory the index file is in
  const fullPath = path.resolve(index);
  const dir = path.dirname(fullPath);
  const watcher = watch(dir);

  const app = serve(fullPath, dir);
  const server = app.listen(8080, () => {
    console.log('Server listening on', 8080);
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
