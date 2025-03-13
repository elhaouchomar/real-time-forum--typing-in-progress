let isLoggedIn = false;

self.onconnect = function (event) {
  let port = event.ports[0];

  port.onmessage = function (event) {
    let { type } = event.data;

    if (type === "login") {
      isLoggedIn = true;
      port.postMessage({ type: "status", message: "✅ User logged in!" });
    } 
    else if (type === "logout") {
      isLoggedIn = false;
      port.postMessage({ type: "status", message: "❌ User logged out!" });
    } 
    else if (type === "checkLogin") {
      port.postMessage({ type: "loginStatus", loggedIn: isLoggedIn });
    }
  };

  port.start();
};
