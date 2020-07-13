const log = require("console-log-level")({ level: "info" });
const fs = require("fs");
const axios = require("axios");
const { parse } = require("url");

const MAX_CONCURRENT_DOWNLOADS = 3;

var queue = [];
var executing = [];

function downloadFile(url, fileName) {
  return new Promise((res, rej) => {
    var task = {
      id: Math.random(),
      url: url,
      fileName: fileName,
      promise: {
        resolve: res,
        reject: rej,
      },
    };
    queue.push(task);
    processQueue();
  });
}

function processQueue() {
  // log.debug("queue length %d, executing length %d", queue.length, executing.length);

  if (queue.length <= 0) {
    return;
  }
  while (queue.length > 0 && executing.length < MAX_CONCURRENT_DOWNLOADS) {
    var task = queue.shift();
    executing.push(task);
    doDownloadFile(task.url, task.fileName)
      .then(() => {
        let idx = executing.findIndex((t) => t.id === task.id);
        task.promise.resolve();
        executing.splice(idx, 1);
        processQueue();
      })
      .catch((e) => {
        task.promise.reject(e);
      });
  }
}

async function doDownloadFile(url, path) {
  log.debug(`'${path}' - download started.`);
  try {
    const uri = parse(url);
    if (!path) {
      path = basename(uri.path);
    }
    await axios({
      method: "get",
      url: uri.href,
      responseType: "stream",
    }).then((res) => {
      res.data.pipe(fs.createWriteStream(path));
    });
    log.debug(`'${path}' - download done.`);
  } catch (e) {
    log.error(`'${path}' - download failed.`, e.message);
    log.trace(e.message);
  }
}

module.exports = function (filesToDownload) {
  let count = 0;
  if (filesToDownload.length > 0) {
    process.stdout.write(`Downloading files: ${count++}/${filesToDownload.length} done.`);
    const promises = filesToDownload.map((f) => {
      return downloadFile(f.url, f.outputPath).then(() => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`Downloading files: ${count++}/${filesToDownload.length} done.`);
        if (count > filesToDownload.length) {
          process.stdout.write(`\n`);
        }
      });
    });

    return Promise.all(promises);
  } else {
    return Promise.resolve();
  }
};
