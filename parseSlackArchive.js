#!/usr/bin/env node
"use strict";

const yargs = require("yargs");
const fs = require("fs");
const { parse } = require("url");
const path = require("path");

const axios = require("axios");

const json2html = require("node-json2html");
const HTMLParser = require("node-html-parser");
const log = require("console-log-level")({ level: "info" });

const OUTPUT_DIRECTORY = "output_html";
const STATIC_FILES_DIRECTORY = "static_files";
const CSS_STYLES_FILE = "styles.css";
const TEMPLATE_FILE = "slack-output-template.html";

const MAX_CONCURRENT_DOWNLOADS = 3;

/////////////////////////////////////////////
//
// html conversion helpers
//
/////////////////////////////////////////////

var userProfilesDict = {};

function hydrateAllUsers(data) {
  data.forEach(function (item) {
    if (item["user_profile"]) {
      userProfilesDict[item.user] = item["user_profile"];
    }
  });

  // add user_profile section to all messages
  data.forEach(function (item) {
    if (!item["user_profile"]) {
      item["user_profile"] = userProfilesDict[item.user];
    }
  });

  //replace references with usernames
  data
    .filter((i) => i.text.indexOf("<@") > -1)
    .forEach(function (item) {
      let text = item.text;
      var regex = RegExp(/<@([A-Z0-9]+)>/g);
      let match = regex.exec(text);
      while (match != null) {
        let user = match[1];
        if (userProfilesDict[user]) {
          text = text.replace(match[0], "<span class='mention'>@" + userProfilesDict[user]["display_name"] + "</span>");
        }
        match = regex.exec(text);
      }
      item.text = text;
    });

  return data;
}

/////////////////////////////////////////////
//
// helper function for timestamp converter
//
/////////////////////////////////////////////

function convertTimestamp(epochTime) {
  var d = new Date(0); // The 0 there sets the date to the epoch
  d.setUTCSeconds(epochTime);
  return d.toISOString().slice(0, 19).replace(/T/g, " ");
}

/////////////////////////////////////////////
//
// define the converter template
//
/////////////////////////////////////////////

let template = {
  "<>": "div",
  class: function (obj) {
    return obj["parent_user_id"] ? "item response" : "item";
  },
  html: [
    {
      "<>": "img",
      class: "avatar",
      src: "${user_profile.image_72}",
    },
    {
      "<>": "div",
      class: "message",
      html: [
        {
          "<>": "div",
          class: "username",
          html: "${user_profile.display_name}",
        },
        {
          "<>": "div",
          class: "time",
          html: function (obj) {
            return convertTimestamp(obj.ts);
          },
        },
        {
          "<>": "div",
          class: "msg",
          html: [
            {
              "<>": "span",
              html: "${text}",
            },
            {
              "<>": "img",
              class: "imgFile",
              src: "${files.0.local_file}",
            },
          ],
        },
      ],
    },
  ],
};

function getTemplateHtml(fileName) {
  var rawData = fs.readFileSync(fileName);
  return HTMLParser.parse(rawData);
}

function isReply(m) {
  return m.thread_ts && !m.replies;
}
function isNotReply(m) {
  return !isReply(m);
}

function processThreads(messages) {
  let initialLength = messages.length;
  let replyMessages = messages.filter(isReply);
  let newMessages = messages.filter(isNotReply);

  // log.debug(
  //   "mgs length %d | reply length %d | newMsg length %d",
  //   initialLength,
  //   replyMessages.length,
  //   newMessages.length
  // );

  newMessages.sort((a, b) => a.ts - b.ts);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.replies) {
      m.replies.reverse();
      m.replies.forEach((r) => {
        let idx = newMessages.findIndex((nm) => nm.client_msg_id === m.client_msg_id);
        let reply = replyMessages.find((rm) => rm.ts === r.ts);

        // add the reply message to the new message array, in order
        newMessages.splice(idx + 1, 0, reply);
      });
    }
  }
  return newMessages;
}

/////////////////////////////////////////////
//
// file downloading
//
/////////////////////////////////////////////

var queue = [];
var executing = [];

function downloadFiles(messages) {
  const filesToDownload = [];

  // parse json to get the url and to append the new local file name
  messages.forEach((m) => {
    m.files.forEach((f) => {
      const url = f["url_private_download"];
      const fileName = f.id + "_" + f.created + "_" + f.name;

      // writes the new filename to the JSON file
      f["local_file"] = fileName;

      const downloadDetails = {
        url: url,
        outputPath: path.join(OUTPUT_DIRECTORY, fileName),
      };
      filesToDownload.push(downloadDetails);
    });
  });

  let count = 0;
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
}

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

/////////////////////////////////////////////
//
// open the file
//
/////////////////////////////////////////////

function readFileFromDisk(fileName) {
  let rawdata = fs.readFileSync(fileName);
  let archive = JSON.parse(rawdata);
  return archive;
}

var root = getTemplateHtml(path.join(STATIC_FILES_DIRECTORY, TEMPLATE_FILE));
var messagesNode = root.querySelector(".messages");

/////////////////////////////////////////////
//
// open the directory and get all filenames
//
/////////////////////////////////////////////

function readChannelAndDownloadImages(baseDir, channelName) {
  let dirName = path.join(baseDir, channelName);

  fs.readdir(dirName, function (err, items) {
    //
    // first: parse files, download images, update jsons with local filename
    //
    let messagesCombined = [];
    for (var i = 0; i < items.length; i++) {
      // log.debug(items[i]);
      var fileName = path.join(dirName, items[i]);

      let messages = readFileFromDisk(fileName);
      log.debug("Reading messages file '%s', it contains %d messages.", fileName, messages.length);

      messagesCombined.push(...messages);
    }
    let msgWithImgs = messagesCombined.filter((m) => m.files && m.files.length > 0);
    let imgCount = msgWithImgs.reduce((p, m) => p + m.files.length, 0);

    downloadFiles(msgWithImgs).then(() => {
      //
      // second: convert to html
      //

      log.info(`Converting ${messagesCombined.length} JSON messages to HTML.`);

      hydrateAllUsers(messagesCombined);
      messagesCombined = processThreads(messagesCombined);
      let transformedHtml = json2html.transform(messagesCombined, template);
      messagesNode.appendChild(transformedHtml);

      let outputHtmlFile = path.join(OUTPUT_DIRECTORY, channelName + ".html");
      fs.writeFileSync(outputHtmlFile, root.toString());
      log.info("Done writing the channel file:", outputHtmlFile);
    });
  });
}

function processChannelSubdir(baseDir, channelName) {
  log.info(`Processing slack channel '${channelName}'.\n`);
  readChannelAndDownloadImages(baseDir, channelName);
}

function processArchiveDir(archiveDir) {
  log.debug(`Processing slack archive directory '${archiveDir}'.`);

  fs.readdir(archiveDir, function (err, items) {
    let channelDirs = items.filter((i) => fs.statSync(path.join(archiveDir, i)).isDirectory());
    log.debug(`Processing slack archive, ${channelDirs.length} channel(s) found.\n`);

    channelDirs.forEach((c) => processChannelSubdir(archiveDir, c));
  });
}

////////////////////////////////////////////////
//
// main
//
////////////////////////////////////////////////

const argv = yargs
  .usage("$0 <directory> [options]")
  .demandCommand(1)
  .option("c", {
    alias: "channel",
    describe: "Treat the directory as a single channel [default]",
    type: "string",
  })
  .option("a", {
    alias: "archive",
    describe: "The directory contains many channel subdirectories",
  })
  .help("h")
  .alias("h", "help")
  .example("$0 ux-design-team", "Parse the channel 'ux-design-team' subdir")
  .example("$0 ux-design-team -c", "Parse the channel 'ux-design-team' subdir")
  .example("$0 slackExport -a", "Parse all subdirs under 'slackExport\\'")
  .version(false)
  .wrap(100).argv;

let dirName = argv._[0];

log.debug("");
dirName = path.normalize(dirName);

if (!fs.existsSync(OUTPUT_DIRECTORY)) {
  fs.mkdirSync(OUTPUT_DIRECTORY);
}
fs.copyFile(path.join(STATIC_FILES_DIRECTORY, CSS_STYLES_FILE), path.join(OUTPUT_DIRECTORY, CSS_STYLES_FILE), () =>
  log.debug("Copied CSS file to output folder")
);

if (argv.a) {
  processArchiveDir(dirName);
} else {
  let channelName = path.basename(dirName);
  let baseDir = path.dirname(dirName);
  processChannelSubdir(baseDir, channelName);
}
