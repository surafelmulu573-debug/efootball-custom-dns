const http = require("http");

const PORT = process.env.PORT || 3000;
const UPSTREAM = "https://cloudflare-dns.com/dns-query";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    return res.end(JSON.stringify({
      status: "online",
      server: "eFootball Custom DNS"
    }));
  }

  if (url.pathname !== "/dns-query") {
    res.writeHead(404);
    return res.end("Not Found");
  }

  try {
    let dnsQuery;

    if (req.method === "GET") {
      const dns = url.searchParams.get("dns");
      if (!dns) throw new Error("Missing DNS query");

      dnsQuery = Buffer.from(
        dns.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
    } else if (req.method === "POST") {
      const chunks = [];
      let size = 0;

      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65535) {
          res.writeHead(413);
          return res.end("Request too large");
        }
        chunks.push(chunk);
      }

      dnsQuery = Buffer.concat(chunks);
    } else {
      res.writeHead(405);
      return res.end("Method Not Allowed");
    }

    if (!dnsQuery.length) throw new Error("Empty DNS query");

    const response = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        "Accept": "application/dns-message"
      },
      body: dnsQuery,
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) throw new Error("Upstream DNS error");

    const data = Buffer.from(await response.arrayBuffer());

    res.writeHead(200, {
      "Content-Type": "application/dns-message",
      "Cache-Control": "no-store"
    });

    res.end(data);

  } catch (error) {
    console.error(error.message);
    res.writeHead(502);
    res.end("DNS Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("DNS Server running on port " + PORT);
});
