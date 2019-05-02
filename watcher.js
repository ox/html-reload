// chokidar is for file watching
const chokidar = require('chokidar');

function watch(dir) {
  console.log('Watching', dir);
  const watcher = chokidar.watch(dir, {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true,
  });

  // Get watched paths
  const watchedPaths = watcher.getWatched();
  console.dir(watchedPaths);

  // Start listening for fs events
  const events = ['add', 'addDir', 'unlink', 'unlinkDir', 'change'];
  events.forEach((event) => {
    watcher.on(event, (modifiedPath) => {
      console.log(modifiedPath, event);
    });
  });

  return watcher;
}

module.exports = watch;
