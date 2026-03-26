function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (
    uri.startsWith("/assets/") ||
    /\.[A-Za-z0-9]+$/.test(uri)
  ) {
    return request;
  }

  if (uri === "" || uri === "/") {
    request.uri = "/index.html";
    return request;
  }

  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
    return request;
  }

  request.uri = uri + "/index.html";
  return request;
}
