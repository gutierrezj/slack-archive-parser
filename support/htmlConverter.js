const log = require("console-log-level")({ level: "info" });
const json2html = require("node-json2html");
const HTMLParser = require("node-html-parser");
const path = require("path");
const fs = require("fs");
const emoji = require('node-emoji')

const TEMPLATE_FILE = "slack-output-template.html";
const STATIC_FILES_DIRECTORY = "static_files";
const OUTPUT_DIRECTORY = "output_html";

const userProfilesDict = {};

var root = getTemplateHtml(path.join(STATIC_FILES_DIRECTORY, TEMPLATE_FILE));
var messagesNode = root.querySelector(".messages");

/////////////////////////////////////////////
//
// html conversion helpers
//
/////////////////////////////////////////////

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

function parseEmojis(data) {
  const onMissing = function (name) {
    log.info("Unknown emoji: ", name);
    return name;
  };

  // const slackEmojiRegexp = new RegExp(":[^:s]*(?:::[^:s]*)*:", "g");
  data
  .forEach(i =>{
    i.text = emoji.emojify(i.text, onMissing);
  })
}

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

module.exports = function (messagesCombined, channelName) {
  hydrateAllUsers(messagesCombined);
  parseEmojis(messagesCombined);
  messagesCombined = processThreads(messagesCombined);
  let transformedHtml = json2html.transform(messagesCombined, template);
  messagesNode.appendChild(transformedHtml);

  let outputHtmlFile = path.join(OUTPUT_DIRECTORY, channelName + ".html");
  fs.writeFileSync(outputHtmlFile, root.toString());
  log.info("Done writing the channel file:", outputHtmlFile);
};
