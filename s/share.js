/* Landing page for spots shared from the Luftrom app: s/?lat=…&lon=…
   Everything happens in the browser: no requests, no cookies, no third-party code. */
(function () {
  "use strict";

  // Plain decimal degrees, as the app writes them; anything else is not a Luftrom link.
  var NUMBER = /^-?\d{1,3}(\.\d{1,10})?$/;

  /** {lat, lon} from a query string, or null if either is missing, malformed or out of range. */
  function parse(search) {
    var params = new URLSearchParams(search);
    var lat = params.get("lat"), lon = params.get("lon");
    if (lat === null || lon === null || !NUMBER.test(lat) || !NUMBER.test(lon)) return null;
    var c = { lat: Number(lat), lon: Number(lon) };
    if (Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) return null;
    return c;
  }

  /** The app's own scheme, which opens the check whether or not the universal link did. */
  function appLink(c) {
    return "luftrom://check?lat=" + c.lat.toFixed(5) + "&lon=" + c.lon.toFixed(5);
  }

  /** "59.9139° N, 10.7522° Ø": four decimals and hemisphere letters in the page language, like the app. */
  function label(c, lang) {
    var east = lang === "nb" ? "Ø" : "E", west = lang === "nb" ? "V" : "W";
    return Math.abs(c.lat).toFixed(4) + "° " + (c.lat >= 0 ? "N" : "S") + ", " +
      Math.abs(c.lon).toFixed(4) + "° " + (c.lon >= 0 ? east : west);
  }

  /** ?lang= first, then the choice remembered on the main site, then the browser: Norwegian for nb, nn and no. */
  function pickLang(search, stored, languages) {
    var asked = new URLSearchParams(search).get("lang");
    if (asked === "nb" || asked === "en") return asked;
    if (stored === "nb" || stored === "en") return stored;
    return /^(nb|nn|no)\b/i.test((languages && languages[0]) || "") ? "nb" : "en";
  }

  var api = { parse: parse, appLink: appLink, label: label, pickLang: pickLang };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }

  var root = document.documentElement;
  var spot = parse(location.search);
  var stored = null;
  try { stored = localStorage.getItem("luftrom-lang"); } catch (e) {}

  function render(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.set === lang));
    });
    document.getElementById("spot").hidden = !spot;
    document.getElementById("invalid").hidden = !!spot;
    if (spot) {
      document.getElementById("coord").textContent = label(spot, lang);
      document.getElementById("open").setAttribute("href", appLink(spot));
    }
  }

  render(pickLang(location.search, stored, navigator.languages || [navigator.language]));
  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () {
      render(b.dataset.set);
      try { localStorage.setItem("luftrom-lang", b.dataset.set); } catch (e) {}
    });
  });
})();
