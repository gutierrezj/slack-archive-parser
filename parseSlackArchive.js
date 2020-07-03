#!/usr/bin/env node
"use strict";

const yargs = require("yargs");
const fs = require("fs");
const http = require("https");
const json2html = require("node-json2html");
const HTMLParser = require("node-html-parser");

const OUTPUT_DIRECTORY = "output_html\\";
const STATIC_FILES_DIRECTORY = "static_files\\";
const CSS_STYLES_FILE = "styles.css";
const TEMPLATE_FILE = "slack-output-template.html";

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
          text = text.replace(
            match[0],
            "<span class='mention'>@" +
              userProfilesDict[user]["display_name"] +
              "</span>"
          );
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

  console.log(
    "mgs length %d | reply length %d | newMsg length %d",
    initialLength,
    replyMessages.length,
    newMessages.length
  );

  newMessages.sort((a, b) => a.ts - b.ts);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.replies) {
      m.replies.reverse();
      m.replies.forEach((r) => {
        let idx = newMessages.findIndex(
          (nm) => nm.client_msg_id === m.client_msg_id
        );
        let reply = replyMessages.find((rm) => rm.ts === r.ts);
        // remove the reply message from the temp array
        // let reply = replyMessages.splice(replyIdx,1);
        // add the reply message to the new message array, in order
        newMessages.splice(idx + 1, 0, reply);
      });
    }
  }
  console.log(
    "mgs length %d | newMsg length %d",
    initialLength,
    newMessages.length
  );
  return newMessages;
}

/////////////////////////////////////////////
//
// file downloading
//
/////////////////////////////////////////////

var queue = [];
var executing = [];
const maxConcurrent = 4;

function downloadFile(url, fileName) {
  var task = {
    id: Math.random(),
    url: url,
    fileName: fileName,
  };
  queue.push(task);
  processQueue();
}

function processQueue() {
  console.log("queue length ", queue.length);
  console.log("executing length ", executing.length);

  if (queue.length <= 0) {
    return;
  }
  while (queue.length > 0 && executing.length < maxConcurrent) {
    var task = queue.shift();
    executing.push(task);
    processDownloadFile(task.url, task.fileName, function () {
      executing.splice(
        executing.findIndex(function (t) {
          t.id === task.id;
        }),
        1
      );
      processQueue();
    });
  }
}

function processDownloadFile(url, fileName, callback) {
  if (!fs.existsSync(fileName)) {
    console.log("Downloading file:", url);
    const request = http.get(url, function (response) {
      const file = fs.createWriteStream(fileName);
      response.pipe(file);
      console.log("Done downloading file:", fileName);
      callback();
    });
    request.on("error", callback);
  } else {
    console.log("File already downloaded:", fileName);
    callback();
  }
}

/////////////////////////////////////////////
//
// json parsing functions
//
/////////////////////////////////////////////

function downloadImgs(msg) {
  msg.files.forEach((f) => {
    var url = f["url_private_download"];
    var fileName = f.id + "_" + f.created + "_" + f.name;

    // writes the new filename to the JSON file
    f["local_file"] = fileName;

    // download the image in the output folder
    downloadFile(url, OUTPUT_DIRECTORY + "\\" + fileName);
  });
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

var root = getTemplateHtml(STATIC_FILES_DIRECTORY + TEMPLATE_FILE);
var messagesNode = root.querySelector(".messages");

/////////////////////////////////////////////
//
// open the directory and get all filenames
//
/////////////////////////////////////////////

function readChannelAndDownloadImages(dirName, channelName) {
  fs.readdir(dirName, function (err, items) {
    //
    // first: parse files, download images, update jsons with local filename
    //
    let messagesCombined = [];

    for (var i = 0; i < items.length; i++) {
      console.log(items[i]);
      var fileName = dirName + items[i];

      console.log("Opening archive:", fileName);
      let messages = readFileFromDisk(fileName);

      console.log("Parsing archive. Number of messages:", messages.length);

      let msgWithImgs = messages.filter((m) => m.files && m.files.length > 0);
      console.log(msgWithImgs);
      msgWithImgs.forEach((m) => downloadImgs(m));

      // fs.writeFileSync(
      //   TEMP_DIRECTORY + items[i],
      //   JSON.stringify(messages, null, 2)
      // );
      messagesCombined.push(...messages);
    }

    //
    // second: convert to html
    //

    // for (var i = 0; i < items.length; i++) {
    //   console.log(items[i]);
    //   var fileName = TEMP_DIRECTORY + items[i];

    //   console.log("Reading JSON file:", fileName);
    //   messagesCombined.push(...readFileFromDisk(fileName));
    // }
    hydrateAllUsers(messagesCombined);
    messagesCombined = processThreads(messagesCombined);
    let transformedHtml = json2html.transform(messagesCombined, template);
    messagesNode.appendChild(transformedHtml);
    if (!fs.existsSync(OUTPUT_DIRECTORY)) {
      fs.mkdirSync(OUTPUT_DIRECTORY);
    }
    fs.copyFile(
      STATIC_FILES_DIRECTORY + CSS_STYLES_FILE,
      OUTPUT_DIRECTORY + CSS_STYLES_FILE,
      () => console.log("copied CSS file to output folder")
    );

    fs.writeFileSync(
      OUTPUT_DIRECTORY + "\\zrh-materials.html",
      root.toString()
    );
    console.log(
      "Done writing the file:",
      OUTPUT_DIRECTORY + "zrh-materials.html"
    );
  });
}

function processChannelSubdir(dirName) {
  dirName = dirName + "\\";

  let channelName =
    dirName.indexOf("\\") > 0 ? dirName.split("\\").pop() : dirName;

  readChannelAndDownloadImages(dirName, channelName);
}

function processArchiveDir(dir) {
  throw new Error("archive not yet implemented");
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

if (argv.a) {
  processArchiveDir(dirName);
} else {
  processChannelSubdir(dirName);
}
