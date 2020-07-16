#!/usr/bin/env node
"use strict";
const log = require("console-log-level")({ level: "info" });

const yargs = require("yargs");
const fs = require("fs");
const path = require("path");

const downloadQueue = require("./support/downloadQueue");
const htmlConverter = require("./support/htmlConverter");
const htmlConverterSidebar = require("./support/htmlConverterSidebar");

const OUTPUT_DIRECTORY = "output_html";
const STATIC_FILES_DIRECTORY = "static_files";
const CSS_STYLES_FILE = "styles.css";

/////////////////////////////////////////////
//
// file downloading
//
/////////////////////////////////////////////

function downloadFiles(messages, channelName) {
  const filesToDownload = [];

  // parse json to get the url and to append the new local file name
  messages.forEach((m) => {
    m.files.forEach((f) => {
      const url = f["url_private_download"];
      const fileName = f.id + "_" + f.created + "_" + f.name;
      

      // writes the new filename and relative path to the JSON file, 
      f["local_file"] = path.posix.join(channelName, fileName);

      createDirIfItDoesntExist(path.join(OUTPUT_DIRECTORY, channelName));

      const downloadDetails = {
        url: url,
        outputPath: path.join(OUTPUT_DIRECTORY, channelName, fileName),
      };
      if (fs.existsSync(downloadDetails.outputPath)) {
        log.info("file already exists, skipping download: ", fileName);
      } else {
        filesToDownload.push(downloadDetails);
      }
    });
  });

  return downloadQueue(filesToDownload);
}

/////////////////////////////////////////////
//
// file utils
//
/////////////////////////////////////////////

function readFileFromDisk(fileName) {
  let rawdata = fs.readFileSync(fileName);
  let archive = JSON.parse(rawdata);
  return archive;
}

function createDirIfItDoesntExist(path){
  if(!fs.existsSync(path)){
    fs.mkdirSync(path);
  }
}

/////////////////////////////////////////////
//
// open the directory and get all filenames
//
/////////////////////////////////////////////

function readChannelAndDownloadImages(baseDir, channelName) {
  let dirName = path.join(baseDir, channelName);

  fs.readdir(dirName, function (err, items) {
    //
    // first: parse archive files
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

    //
    // second: update jsons with local filename & download attachment files
    //
    downloadFiles(msgWithImgs, channelName).then(() => {

      //
      // third: convert to html
      //
      log.info(`Converting ${messagesCombined.length} JSON messages to HTML.`);
      htmlConverter(messagesCombined, channelName);
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

    htmlConverterSidebar(channelDirs);
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



createDirIfItDoesntExist(OUTPUT_DIRECTORY);

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
