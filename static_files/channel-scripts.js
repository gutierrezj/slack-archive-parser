function isInsideIframe() {
  return window !== parent.window;
}

if (!isInsideIframe()) {
  console.log("not in iframe, redirecting");

  let channelName = window.location.pathname.split("/").pop().split(".")[0];
  let url = new URL("archive.html", window.location.href);
  if (window.location.hash) {
    url.hash = "#" + channelName + ";" + window.location.hash.substring(1, window.location.hash.length);
  } else {
    url.hash = "#" + channelName;
  }
  window.location = url.href;
}
