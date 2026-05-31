Module.register("MMM-eshopspecials", {

  defaults: {
    animationSpeed: 1000,
    showImage: true,
    showPrice: true,
    showDescription: true,
    maxDescriptionLength: 150,
    imageMaxWidth: "300px",
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    this.deal = null;
    this.loaded = false;
    this.error = null;
    // Tell the helper we are ready — it will fetch immediately and
    // then schedule daily refreshes at 12:00 Europe/Athens.
    this.sendSocketNotification("FETCH_DEAL", {});
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "DEAL_RESULT") {
      if (payload.error) {
        this.error = payload.error;
        this.loaded = true;
      } else {
        this.deal = payload;
        this.error = null;
        this.loaded = true;
      }
      this.updateDom(this.config.animationSpeed);
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-eshopspecials";

    if (!this.loaded) {
      wrapper.innerHTML = "Loading e-shop Special...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = "⚠️ " + this.error;
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (!this.deal) {
      wrapper.innerHTML = "No deal available.";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    // Product image
    if (this.config.showImage && this.deal.image) {
      const imgWrapper = document.createElement("div");
      imgWrapper.className = "eshop-image-wrapper";
      const img = document.createElement("img");
      img.src = this.deal.image;
      img.className = "eshop-image";
      img.style.maxWidth = this.config.imageMaxWidth;
      img.alt = this.deal.title || "Product image";
      imgWrapper.appendChild(img);
      wrapper.appendChild(imgWrapper);
    }

    // Title
    if (this.deal.title) {
      const title = document.createElement("div");
      title.className = "eshop-title bright medium";
      title.innerHTML = this.deal.title;
      wrapper.appendChild(title);
    }

    // Price
    if (this.config.showPrice && this.deal.price) {
      const price = document.createElement("div");
      price.className = "eshop-price";
      price.innerHTML = this.deal.price;
      wrapper.appendChild(price);
    }

    // Description
    if (this.config.showDescription && this.deal.description) {
      let desc = this.deal.description;
      if (desc.length > this.config.maxDescriptionLength) {
        desc = desc.substring(0, this.config.maxDescriptionLength) + "…";
      }
      const descEl = document.createElement("div");
      descEl.className = "eshop-description dimmed small";
      descEl.innerHTML = desc;
      wrapper.appendChild(descEl);
    }

    return wrapper;
  },

  getStyles: function () {
    return ["MMM-eshopspecials.css"];
  },

});
