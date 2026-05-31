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

  // Returns milliseconds until the next 12:00:00 Europe/Athens time.
  msUntilNoonAthens: function () {
    const tz = "Europe/Athens";
    const now = new Date();

    // Build a Date that represents today at 12:00:00 Athens time.
    // We use Intl.DateTimeFormat to find out what "today" looks like in Athens,
    // then construct the target timestamp via a UTC-offset trick.
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    });

    const parts = fmt.formatToParts(now);
    const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);

    // Current Athens wall-clock time
    const athensHour   = get("hour");
    const athensMinute = get("minute");
    const athensSecond = get("second");
    const athensDay    = get("day");
    const athensMonth  = get("month");
    const athensYear   = get("year");

    // Seconds elapsed today in Athens
    const secondsToday = athensHour * 3600 + athensMinute * 60 + athensSecond;
    const noonSeconds  = 12 * 3600; // 12:00:00

    let msUntilNoon;
    if (secondsToday < noonSeconds) {
      // Noon hasn't happened yet today
      msUntilNoon = (noonSeconds - secondsToday) * 1000;
    } else {
      // Noon already passed today — wait until noon tomorrow
      msUntilNoon = (86400 - secondsToday + noonSeconds) * 1000;
    }

    const nextNoon = new Date(now.getTime() + msUntilNoon);
    console.log("MMM-eshopspecials: next fetch scheduled at " + nextNoon.toISOString() + " (12:00 Athens)");
    return msUntilNoon;
  },

  scheduleDailyFetch: function () {
    const self = this;

    // Fetch immediately on startup to show today's deal right away
    this.fetchPage();

    // Then schedule the first noon fetch
    const msToNoon = this.msUntilNoonAthens();
    setTimeout(function noonTick() {
      self.fetchPage();
      // After the first noon fetch, repeat every 24 hours exactly
      setInterval(() => self.fetchPage(), 24 * 60 * 60 * 1000);
    }, msToNoon);
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
