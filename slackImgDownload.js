"use strict";

const fs = require("fs");
const http = require("https");
const { exec } = require("child_process");

const INPUT_DIRECTORY = "input_data\\zrh-materials\\";
const OUTPUT_DIRECTORY = "temp\\zrh-materials\\";
const FILES_SUBDIR = "files\\";

/////////////////////////////////////////////
//
// file downloading
//
/////////////////////////////////////////////

var queue = [];
var executing = [];
const maxConcurrent = 4;

function downloadFile(url, fileName){
  var task = {
    id: Math.random(),
    url: url,
    fileName: fileName
  };
  queue.push(task);
  processQueue();
}

function processQueue(){
  console.log("queue length ", queue.length);
  console.log("executing length ", executing.length);
  
  if(queue.length <= 0){
    return;
  }
  while (queue.length > 0 && executing.length < maxConcurrent){
    var task = queue.shift();
    executing.push(task);
    processDownloadFile(task.url, task.fileName, function(){
      executing.splice(executing.findIndex(function(t){t.id === task.id}),1);
      processQueue();
    })
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

function parseFile(f) {
  var url = f["url_private_download"];
  var fileName = f.id + "_" + f.created + "_" + f.name;

  // writes the new filename to the JSON file
  f["local_file"] = fileName;

  // download the image in the output folder
  downloadFile(url, OUTPUT_DIRECTORY + FILES_SUBDIR + fileName);
}

function parseMessage(m) {
  if (m.files && m.files.length > 0) {
    console.log("Parsing archive. Number of files:", m.files.length);
    m.files.forEach(parseFile);
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

/////////////////////////////////////////////
//
// open the directory and get all filenames
//
/////////////////////////////////////////////

if (!fs.existsSync(OUTPUT_DIRECTORY)) {
  fs.mkdirSync(OUTPUT_DIRECTORY);
}
if (!fs.existsSync(OUTPUT_DIRECTORY + FILES_SUBDIR)) {
  fs.mkdirSync(OUTPUT_DIRECTORY + FILES_SUBDIR);
}

fs.readdir(INPUT_DIRECTORY, function (err, items) {
  // console.log(items);

  for (var i = 0; i < items.length; i++) {
    console.log(items[i]);
    var fileName = INPUT_DIRECTORY + items[i];

    console.log("Opening archive:", fileName);
    var jsonFile = readFileFromDisk(fileName);

    console.log("Parsing archive. Number of messages:", jsonFile.length);
    jsonFile.forEach(parseMessage);

    fs.writeFileSync(
      OUTPUT_DIRECTORY + items[i],
      JSON.stringify(jsonFile, null, 2)
    );
  }
});
