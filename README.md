# MMM-eshopspecials

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that displays the **daily special deal** from [eshopspecials.gr](https://www.eshopspecials.gr/) — including the product image, price, and description.

## What it shows

- Product image
- Product title
- Price (highlighted in orange)
- Short description

## Screenshot

<img width="423" height="527" alt="Screenshot 2026-06-03 002414" src="https://github.com/user-attachments/assets/8e50ea05-062d-4a89-836b-385cd9fb0420" />

Displaying product image ( `showImage` ) AND price ( `showPrice` ) AND description ( `showDescription` ).

## How it works

The module fetches the deal **once on startup**, then automatically refreshes every day at **12:00 Athens time (Europe/Athens)** — exactly when the new daily deal goes live on eshopspecials.gr. This works correctly regardless of the timezone configured in MagicMirror or the host system, because the schedule is calculated against the Athens timezone internally using the Node.js `Intl` API.
`node_helper.js` fetches `https://www.eshopspecials.gr/` server-side (bypassing browser CORS restrictions) and decodes the response using `iconv-lite` to handle the site's Greek ISO-8859-7 encoding. It then extracts the deal information using precise HTML class selectors (`offer-price-v2`, `text-wrapper`, etc.) matched against the page structure.

The daily refresh is scheduled by calculating the milliseconds until the next 12:00:00 in the `Europe/Athens` timezone using the built-in `Intl.DateTimeFormat` API — no extra packages required for this.

No `updateInterval` configuration is needed or available.

## Installation

In your terminal, go to your MagicMirror's module directory:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/mariossgouros/MMM-eshopspecials
npm install
```

Dependencies: the module requires **iconv-lite**, which handles the Greek character encoding (ISO-8859-7) used by eshopspecials.gr. Without it, Greek text will display as `?????`.

## Update

Go to the module’s directory inside your MagicMirror's module directory and pull the latest version:

```bash
cd ~/MagicMirror/modules/MMM-eshopspecials
git pull
```

## Configuration

Add the following block to your `config/config.js`:

```js
{
  module: "MMM-eshopspecials",
  position: "top_right",   // or any valid MagicMirror position
  header: "e-shop Special",
  config: {
    showImage: true,              // Show product image
    showPrice: true,              // Show price
    showDescription: true,        // Show description
    maxDescriptionLength: 150,    // Truncate description after N chars
    imageMaxWidth: "300px",       // Max width of the product image
  }
},
```

## Config Options

| Option | Default | Description |
|---|---|---|
| `showImage` | `true` | Whether to show the product image |
| `showPrice` | `true` | Whether to show the price |
| `showDescription` | `true` | Whether to show the description |
| `maxDescriptionLength` | `150` | Max characters for the description |
| `imageMaxWidth` | `"300px"` | Max CSS width for the image |

## Acknowledgments

With the power of AI Coding.

## License

MIT
