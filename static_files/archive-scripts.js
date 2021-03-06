const channelsItems = document.getElementsByClassName("channel-item");

function setSelected(node) {
  node.className = node.className + " selected";
}

function setUnselected(node) {
  if (typeof node["className"] === "undefined") {
    return;
  }
  if (node.className.indexOf("selected") < 0) {
    return;
  }

  if (node.className === "selected") {
    node.className = "";
  } else {
    let classes = node.className.split(" ");
    if (classes.length > 0) {
      classes.splice(classes.indexOf("selected"), 1);
      node.className = classes.join(" ");
    } else {
      console.log("can't find selected class", node.className);
    }
  }
}

function doSelectChannel(node, timestamp) {
  let iframe = document.getElementById("content-iframe");
  iframe.src = node.textContent + ".html" + (timestamp ? "#"+timestamp : "");
  node.parentNode.childNodes.forEach((n) => setUnselected(n));
  setSelected(node);
  document.getElementsByClassName("channel-title")[0].textContent = node.textContent;
}

function selectChannelByUrl(channelName) {
    location.hash = "#" + channelName;
}

function selectChannelFromUrl() {
  if (location.hash) {
    const hashStr = location.hash.substring(1,location.hash.length);
    let channelName;
    let msgTimestamp;

    if ( hashStr.indexOf(";") >=0) {
      channelName = hashStr.split(";")[0];
      msgTimestamp = hashStr.split(";")[1];
      console.log(msgTimestamp)
    }else{
      channelName = hashStr;
    }
    for (let i = 0; i < channelsItems.length; i++) {
      if ( channelName === channelsItems[i].textContent) {
        doSelectChannel(channelsItems[i], msgTimestamp);
      }
    }
  }else{
    doSelectChannel(channelsItems[0]);
  }
}

function initializeChannelList() {
  for (let i = 0; i < channelsItems.length; i++) {
    channelsItems[i].onclick = function (e) {
      selectChannelByUrl(e.target.textContent);
    };
  }
}


// initialize app

window.addEventListener("hashchange", selectChannelFromUrl, false);
initializeChannelList();
selectChannelFromUrl();

