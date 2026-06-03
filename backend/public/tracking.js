/* ============================================================
   tracking.js — Rastreamento centralizado
   Andreia Machado · Escritório de Advocacia
   ------------------------------------------------------------
   COMO USAR:
   1. Substitua os 3 marcadores abaixo pelos seus IDs reais:
        G-XXXXXXXXXX   -> ID de medição do Google Analytics 4
        AW-XXXXXXXXX   -> ID de conversão do Google Ads
        000000000000000 -> ID do Meta Pixel
   2. Suba este arquivo em backend/public/
   3. Ele já é chamado por todas as páginas via <script src="/tracking.js"></script>
   ------------------------------------------------------------
   Enquanto os IDs não forem preenchidos, o script fica inerte
   (não dispara nada e não dá erro). Pode subir assim mesmo.
   ============================================================ */

(function () {
  "use strict";

  // >>> PREENCHA AQUI <<<
  var GA4_ID        = "G-X2768ZFL0X";      // Google Analytics 4
  var GOOGLE_ADS_ID = "AW-XXXXXXXXX";      // Google Ads (conversões)
  var META_PIXEL_ID = "2059743271551815";   // Meta Pixel

  var hasGoogle = GA4_ID !== "G-XXXXXXXXXX";
  var hasAds    = GOOGLE_ADS_ID !== "AW-XXXXXXXXX";
  var hasMeta   = META_PIXEL_ID !== "000000000000000";

  /* ---------- Google (GA4 + Ads) via gtag ---------- */
  if (hasGoogle || hasAds) {
    var gid = hasGoogle ? GA4_ID : GOOGLE_ADS_ID;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + gid;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    if (hasGoogle) gtag("config", GA4_ID);
    if (hasAds)    gtag("config", GOOGLE_ADS_ID);
  }

  /* ---------- Meta Pixel ---------- */
  if (hasMeta) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", META_PIXEL_ID);
    fbq("track", "PageView");
  }

  /* ---------- Eventos de conversão (clique em WhatsApp, telefone, e-mail) ---------- */
  function fire(eventName, label) {
    if (window.gtag) {
      if (hasGoogle) gtag("event", eventName, { event_category: "contato", event_label: label });
      // Para conversão do Google Ads, troque o send_to pelo seu rótulo:
      // if (hasAds) gtag("event", "conversion", { send_to: "AW-XXXXXXXXX/SEU_ROTULO" });
    }
    if (window.fbq) fbq("track", "Lead", { content_name: label });
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("wa.me") !== -1)        fire("clique_whatsapp", "WhatsApp");
    else if (href.indexOf("tel:") === 0)     fire("clique_telefone", "Telefone");
    else if (href.indexOf("mailto:") === 0)  fire("clique_email", "E-mail");
  }, true);

  // Conversão de envio de formulário é disparada na página /obrigado.html
})();
