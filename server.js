const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
};

function serve(req, res) {
  let pathname = decodeURIComponent(req.url.split("?")[0]);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(root, pathname));

  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Type": type,
    };
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
        res.end();
        return;
      }

      let start;
      let end;
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        start = Math.max(stats.size - suffixLength, 0);
        end = stats.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : stats.size - 1;
        end = Math.min(end, stats.size - 1);
      }

      if (start > end || start >= stats.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stats.size}` });
        res.end();
        return;
      }

      headers["Content-Length"] = end - start + 1;
      headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
      res.writeHead(206, headers);
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    headers["Content-Length"] = stats.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

module.exports = serve;

if (require.main === module) {
  http.createServer(serve).listen(port, "127.0.0.1", () => {
    console.log(`Preview running at http://127.0.0.1:${port}`);
  });
}
