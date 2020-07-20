const log = require("console-log-level")({ level: "info" });
const json2html = require("node-json2html");
const HTMLParser = require("node-html-parser");
const path = require("path");
const fs = require("fs");

const TEMPLATE_FILE = "archive-template.html";
const STATIC_FILES_DIRECTORY = "static_files";
const OUTPUT_DIRECTORY = "output_html";

var root = getTemplateHtml(path.join(STATIC_FILES_DIRECTORY, TEMPLATE_FILE));

/////////////////////////////////////////////
//
// define the converter template
//
/////////////////////////////////////////////

let template = {
  "<>": "li",
  class: "channel-item",
  value: "${url}",
  onclick: function (e) {
    console.log(e);
  },
  html: "${name}",
};

function getTemplateHtml(fileName) {
  var rawData = fs.readFileSync(fileName);
  return HTMLParser.parse(rawData, {
    script: true,
  });
}

module.exports = function (channelNames) {
  let channels = channelNames.map((c) => ({ name: c, url: c + ".html" }));

  let transformedHtml = json2html.transform(channels, template);
  var messagesNode = root.querySelector(".channel-list");
  messagesNode.appendChild(transformedHtml);

  let outputHtmlFile = path.join(OUTPUT_DIRECTORY, "archive.html");
  fs.writeFileSync(outputHtmlFile, root.toString());
  log.info("Done writing the archive file:", outputHtmlFile);
};
