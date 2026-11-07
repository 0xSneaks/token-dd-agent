import server from "../src/server.js";

// Vercel routes /report here directly; keep the query string
// (demo=1 / address / live flags) and pin the path for the handler.
export default (req, res) => {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  req.url = "/report" + q;
  server.emit("request", req, res);
};
