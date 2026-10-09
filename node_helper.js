const NodeHelper = require("node_helper");
const https = require("https");

module.exports = NodeHelper.create({

  start: function () {
    console.log("MMM-eshopspecials helper started.");
    this.checkIconv();
    this.scheduleReady = false;
  },

  checkIconv: function () {
    try {
      require("iconv-lite");
    } catch (e) {
      console.warn("MMM-eshopspecials: iconv-lite not found. Run: npm install inside the MMM-eshopspecials folder.");
    }
  },

  // Returns the current hour, minute and full date string in Europe/Athens
  athensTime: function () {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false
    });
    const parts = fmt.formatToParts(new Date());
    const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
    const pad = (n) => String(n).padStart(2, "0");
    const year  = get("year");
    const month = get("month");
    const day   = get("day");
    // Full date string e.g. "2026-09-08" — unique per calendar day, never repeats
    const dateStr = year + "-" + pad(month) + "-" + pad(day);
    return { hour: get("hour"), minute: get("minute"), dateStr: dateStr };
  },

  scheduleDailyFetch: function () {
    const self = this;

    // Fetch immediately on startup to show today's deal right away
    this.fetchPage();
    this.lastFetchedDate = null;

    // Check every minute whether it is 12:00 Athens time.
    // This approach is immune to long-timeout drift and system sleep/wake cycles.
    setInterval(function () {
      const t = self.athensTime();
      if (t.hour === 12 && t.minute === 5 && t.dateStr !== self.lastFetchedDate) {
        console.log("MMM-eshopspecials: it is 12:05 Athens time (" + t.dateStr + ") — fetching new deal.");
        self.lastFetchedDate = t.dateStr;
        self.fetchPage();
      }
    }, 60 * 1000);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "FETCH_DEAL") {
      if (!this.scheduleReady) {
        // First call from the front-end — start the schedule now
        this.scheduleReady = true;
        this.scheduleDailyFetch();
      } else {
        // Manual re-fetch request
        this.fetchPage();
      }
    }
  },

  fetchPage: function () {
    const self = this;

    const options = {
      hostname: "www.eshopspecials.gr",
      path: "/",
      method: "GET",
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "el-GR,el;q=0.9",
        "Accept-Encoding": "identity",
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        try {
          const rawBuffer = Buffer.concat(chunks);
          let html;
          try {
            const iconv = require("iconv-lite");
            html = iconv.decode(rawBuffer, "iso-8859-7");
          } catch (e) {
            html = rawBuffer.toString("latin1");
          }

          console.log("MMM-eshopspecials: fetched " + html.length + " chars");
          const deal = self.parseDeal(html);
          console.log("MMM-eshopspecials: parsed:", JSON.stringify(deal));
          self.sendSocketNotification("DEAL_RESULT", deal);
        } catch (e) {
          console.error("MMM-eshopspecials parse error:", e);
          self.sendSocketNotification("DEAL_RESULT", { error: "Failed to parse deal." });
        }
      });
    });

    req.on("error", (e) => {
      console.error("MMM-eshopspecials fetch error:", e);
      self.sendSocketNotification("DEAL_RESULT", { error: "Network error: " + e.message });
    });

    req.end();
  },

  parseDeal: function (html) {
    let image = null;
    let title = null;
    let price = null;
    let description = null;
    let m;

    // --- IMAGE ---
    m = html.match(/class="img-responsive"\s*\/>.*?src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/is)
      || html.match(/src=["'](https:\/\/www\.e-shop\.gr\/images\/eshopspecials[^"']+)["']/i)
      || html.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    if (m) image = m[1];

    // --- TITLE ---
    m = html.match(/class="featured-price"[\s\S]*?<h2>([\s\S]*?)<\/h2>/i)
      || html.match(/class="[^"]*featured[^"]*"[\s\S]*?<h2>([\s\S]*?)<\/h2>/i)
      || html.match(/<div class="wrapper">\s*<h2>([\s\S]*?)<\/h2>/i);
    if (m) title = this.clean(m[1]);

    if (!title) {
      m = html.match(/<TITLE>([\s\S]*?)<\/TITLE>/i);
      if (m) {
        let t = this.clean(m[1]);
        t = t.replace(/^E-shop\.gr Specials\s*/i, "");
        t = t.replace(/\s*μόνο\s+[\d.,]+\s*€.*$/i, "");
        title = t.trim();
      }
    }

    // --- PRICE ---
    m = html.match(/class="offer-price-v2">([\s\S]*?)<\/div>/i);
    if (m) price = this.clean(m[1]).replace(/\s+/g, " ").trim();

    if (!price) {
      m = html.match(/μόνο\s+([\d.,]+)\s*(?:&euro;|€)/i);
      if (m) price = m[1] + " €";
    }

    // --- DESCRIPTION ---
    m = html.match(/class="text-wrapper">\s*<p>([\s\S]*?)<\/p>/i);
    if (m) description = this.clean(this.stripTags(m[1]));

    if (price) price = price.replace(/&euro;/g, "€").replace(/\u00a0/g, " ").trim();
    if (description) description = description.replace(/&euro;/g, "€").replace(/\u00a0/g, " ").trim();

    return { image, title, price, description };
  },

  stripTags: function (str) {
    return str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  },

  clean: function (str) {
    if (!str) return str;
    return str
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&euro;/g, "€")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(parseInt(c, 10)))
      .replace(/\s+/g, " ")
      .trim();
  },

});
