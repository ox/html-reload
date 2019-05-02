const os = require('os');

// chokidar is for file watching
const chokidar = require('chokidar');

function watch(dir, cb) {
  const watcher = chokidar.watch(dir, {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true,
  });

  // Start listening for fs events
  const events = ['add', 'addDir', 'unlink', 'unlinkDir', 'change'];
  events.forEach((event) => {
    watcher.on(event, (modifiedPath) => {
      console.log(modifiedPath, event);
      cb(event, modifiedPath);
    });
  });

  return watcher;
}

module.exports = watch;
