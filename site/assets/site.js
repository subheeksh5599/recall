(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Logo marquee: continuous drift, 45 px/s ---- */
  var marquee = document.querySelector("section.select-none .overflow-hidden > .flex");
  if (marquee) {
    var slides = Array.prototype.slice.call(marquee.children);
    slides.forEach(function (s) { s.style.transform = ""; });
    var half = slides.length / 2;
    var loopW = 0;
    var measure = function () {
      loopW = slides[half] ? slides[half].offsetLeft - slides[0].offsetLeft : marquee.scrollWidth / 2;
    };
    measure();
    window.addEventListener("resize", measure);
    var x = 0, last = performance.now();
    var tick = function (now) {
      var dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (!reduce && loopW > 0) {
        x -= 45 * dt;
        if (-x >= loopW) x += loopW;
      }
      marquee.style.transform = "translate3d(" + x + "px,0,0)";
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---- Testimonial carousel: 6 s autoplay, 1 s cross-fade ---- */
  var stack = document.querySelectorAll(".col-start-1.row-start-1.transition-opacity");
  var dots = document.querySelectorAll('button[aria-label^="Go to testimonial"]');
  if (stack.length && dots.length) {
    var cur = 0, timer = null;
    var ON = "bg-gray-300", OFF = ["border", "border-gray-300", "bg-white", "hover:bg-gray-100"];
    var show = function (i) {
      cur = i;
      stack.forEach(function (el, k) {
        el.classList.toggle("opacity-100", k === i);
        el.classList.toggle("opacity-0", k !== i);
        el.classList.toggle("pointer-events-none", k !== i);
      });
      dots.forEach(function (d, k) {
        d.classList.toggle(ON, k === i);
        OFF.forEach(function (c) { d.classList.toggle(c, k !== i); });
      });
    };
    var start = function () {
      clearInterval(timer);
      timer = setInterval(function () { show((cur + 1) % stack.length); }, 6000);
    };
    stack.forEach(function (el, k) { if (el.classList.contains("opacity-100")) cur = k; });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { show(k); start(); }); });
    show(cur);
    start();
  }

  /* ---- Industry accordion (desktop columns + mobile tabs) ---- */
  fetch("/assets/acc.json").then(function (r) { return r.json(); }).then(function (acc) {
    var wire = function (sel, states, btnSel, byPanel) {
      var host = document.querySelector(sel);
      if (!host || !states || !states.length) return;
      var swap = function (i) {
        var tmp = document.createElement("div");
        tmp.innerHTML = states[i];
        var next = tmp.firstElementChild;
        host.replaceWith(next);
        host = next;
        bind();
      };
      var bind = function () {
        var btns = host.querySelectorAll(btnSel);
        btns.forEach(function (b) {
          b.addEventListener("click", function () {
            var idx = byPanel
              ? (function () { var n = b; while (n && n.parentElement !== host) n = n.parentElement; return Array.prototype.indexOf.call(host.children, n); })()
              : Array.prototype.indexOf.call(host.querySelectorAll(btnSel), b);
            if (idx >= 0 && idx < states.length) swap(idx);
          });
        });
      };
      bind();
    };
    wire(".min-h-175.lg\\:flex-row", acc.desk, "button[aria-label]", true);
    wire("section .flex.flex-col.gap-1.lg\\:hidden", acc.mob, ".grid button[aria-label]", false);
  }).catch(function () {});

  /* ---- Desktop nav dropdowns: open on hover ---- */
  document.querySelectorAll(".font-gothic.relative.z-10").forEach(function (item) {
    var menu = item.querySelector("[data-state]");
    if (!menu) return;
    var open = function (v) {
      menu.setAttribute("data-state", v ? "open" : "closed");
      item.setAttribute("data-state", v ? "open" : "closed");
    };
    open(false);
    item.addEventListener("mouseenter", function () { open(true); });
    item.addEventListener("mouseleave", function () { open(false); });
  });

  /* ---- Mobile menu ---- */
  var toggle = document.querySelector('[aria-label="Toggle mobile menu"]');
  var tpl = document.getElementById("mobile-menu-tpl");
  if (toggle && tpl) {
    var bar = toggle.closest(".sticky");
    var nodes = null;
    toggle.addEventListener("click", function () {
      if (nodes) { nodes.forEach(function (n) { n.remove(); }); nodes = null; return; }
      var frag = tpl.content.cloneNode(true);
      nodes = Array.prototype.slice.call(frag.children);
      bar.appendChild(frag);
      var close = bar.querySelector('[aria-label="Close mobile menu"]');
      if (close) close.addEventListener("click", function () { toggle.click(); });
    });
  }
})();
