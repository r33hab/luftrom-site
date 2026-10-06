(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Language: Norwegian by default, English on request, remembered. ?lang=en works too.
  function setLang(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang === "en" ? "en" : "nb");
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.set === lang)); });
    try { localStorage.setItem("luftrom-lang", lang); } catch (e) {}
  }
  var lang = new URLSearchParams(location.search).get("lang");
  if (lang !== "en" && lang !== "nb") { try { lang = localStorage.getItem("luftrom-lang"); } catch (e) { lang = null; } }
  if (lang !== "en" && lang !== "nb") { lang = /^en/i.test(navigator.language || "") ? "en" : "nb"; }
  setLang(lang);
  document.querySelectorAll(".lang button").forEach(function (b) { b.addEventListener("click", function () { setLang(b.dataset.set); }); });

  // Header turns to glass after the first scroll.
  var top = document.querySelector(".top");
  function onScrollTop() { top.classList.toggle("scrolled", scrollY > 8); }
  addEventListener("scroll", onScrollTop, { passive: true }); onScrollTop();

  // Hero: play the check once on load; replay on demand.
  var hero = document.querySelector(".hero"), stage = document.querySelector(".stage");
  function playStage() { stage.classList.remove("play"); void stage.offsetWidth; stage.classList.add("play"); }
  function play() {
    if (!hero) return;
    hero.classList.remove("play"); void hero.offsetWidth; hero.classList.add("play");
    playStage();
  }
  if (hero && !reduce) {
    requestAnimationFrame(function () { hero.classList.add("play"); });
    // On phones the stage sits below the copy, so the check plays when it comes into view, not before.
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { playStage(); seen.disconnect(); } });
    }, { threshold: 0.45 });
    seen.observe(stage);
  }
  var replay = document.querySelector(".replay");
  if (replay) replay.addEventListener("click", play);

  // The contour band draws once on view. Everything else is simply there.
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
  document.querySelectorAll(".contours").forEach(function (el) { io.observe(el); });

  // How it works: the visible step picks the phone state; the gauge climbs 0 to 120 m while it is stuck on screen.
  var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  var stepsBox = document.querySelector(".steps"), gauge = document.querySelector(".gauge");
  var shots = document.querySelectorAll(".sticky .phone img");
  function setState(name) {
    shots.forEach(function (img) { img.classList.toggle("on", img.dataset.state === name); });
    steps.forEach(function (s) { s.classList.toggle("active", s.dataset.state === name); });
  }
  if (steps.length) {
    setState(steps[0].dataset.state);
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { stepsBox.classList.add("tracking"); setState(e.target.dataset.state); } });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    steps.forEach(function (s) { so.observe(s); });
    function onScrollGauge() {
      var r = stepsBox.getBoundingClientRect();
      var stick = parseFloat(getComputedStyle(gauge).top) || 0, travel = r.height - gauge.offsetHeight;
      var p = travel > 0 ? Math.min(1, Math.max(0, (stick - r.top) / travel)) : 0;
      var pct = (p * 100).toFixed(1) + "%";
      gauge.style.setProperty("--p", pct);
      var m = gauge.querySelector(".marker"); if (m) m.textContent = Math.round(p * 120) + " m";
    }
    addEventListener("scroll", onScrollGauge, { passive: true }); addEventListener("resize", onScrollGauge); onScrollGauge();
  }

  // FAQ: animate the body height on open and close.
  document.querySelectorAll("details").forEach(function (d) {
    var body = d.querySelector(".faq-body"), summary = d.querySelector("summary");
    if (!body || reduce) return;
    summary.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (d.open) {
        var h = body.offsetHeight;
        var a = body.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 280, easing: "cubic-bezier(.4,0,.2,1)" });
        a.onfinish = function () { d.open = false; body.style.height = ""; };
      } else {
        d.open = true;
        var target = body.offsetHeight;
        body.animate([{ height: "0px", opacity: 0 }, { height: target + "px", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    });
  });
})();
