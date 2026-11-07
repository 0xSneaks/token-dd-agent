import server from "../src/server.js";

// Vercel routes /examples here directly; pin the path the shared
// node:http handler expects, then hand the request to it.
export default (req, res) => {
  req.url = "/examples";
  server.emit("request", req, res);
};
