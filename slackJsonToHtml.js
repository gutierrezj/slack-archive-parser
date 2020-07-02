"use strict";

const fs = require("fs");
const json2html = require("node-json2html");
const HTMLParser = require("node-html-parser");

const INPUT_DIRECTORY = "temp\\zrh-materials\\";
const OUTPUT_DIRECTORY = "output_html\\";
const STATIC_FILES_DIRECTORY = "static_files\\";

const CSS_STYLES_FILE = "styles.css";
const TEMPLATE_FILE = "slack-output-template.html";

/////////////////////////////////////////////
//
// open the template and get the DOM node
//
/////////////////////////////////////////////

function getTemplateHtml(fileName) {
  var rawData = fs.readFileSync(fileName);
  return HTMLParser.parse(rawData);
}

/////////////////////////////////////////////
//
// open the input json and parse
//
/////////////////////////////////////////////

function readFileFromDisk(fileName) {
  let rawdata = fs.readFileSync(fileName);
  let archive = JSON.parse(rawdata);
  return archive;
}

/////////////////////////////////////////////
//
// helper functions for user handling
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
  class: "item",
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

//<div>
//  <img src="https://avatars.slack-edge.com/2018-04-17/348068992100_b89b6cdb4271872321b2_72.jpg" />
//  <div class="message">
//      <div class="username">aulmer</div>
//      <div class="time">2020-03-26 22:22</div>
//      <div class="msg">I guess with a higher sun position the artifacts should be less prominent</div>
//  </div>
// </div>
// <br/>

/////////////////////////////////////////////
//
// execute conversion for input data
//
/////////////////////////////////////////////

var root = getTemplateHtml(STATIC_FILES_DIRECTORY + TEMPLATE_FILE);
var messagesNode = root.querySelector(".messages");

console.log("Opening archive:", INPUT_DIRECTORY);

fs.readdir(INPUT_DIRECTORY, function (err, items) {
  if (err) {
    throw new Error(err);
  }
  console.log(items);

  let jsonFiles = items.filter((i) => i.indexOf(".json") > 0);
  let messages = [];
  for (var i = 0; i < jsonFiles.length; i++) {
    var fileName = INPUT_DIRECTORY + jsonFiles[i];
    console.log("Reading JSON file:", fileName);
    messages.push(...readFileFromDisk(fileName));
  }
  hydrateAllUsers(messages);
  let transformedHtml = json2html.transform(messages, template);
  messagesNode.appendChild(transformedHtml);
  if (!fs.existsSync(OUTPUT_DIRECTORY)) {
    fs.mkdirSync(OUTPUT_DIRECTORY);
  }
  fs.copyFile(
    STATIC_FILES_DIRECTORY + CSS_STYLES_FILE,
    OUTPUT_DIRECTORY + CSS_STYLES_FILE,
    () => console.log("copied CSS file to output folder")
  );

  fs.writeFileSync(OUTPUT_DIRECTORY + "\\zrh-materials.html", root.toString());
  console.log(
    "Done writing the file:",
    OUTPUT_DIRECTORY + "zrh-materials.html"
  );
});

// console.log(root.toString());
