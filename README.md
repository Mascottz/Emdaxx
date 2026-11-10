# Emdax

A static multipage website for Emdax. Serve the repository root using a static web server.

## Search and social previews

The canonical URLs, sitemap, robots file and Open Graph and X metadata use `https://www.emdax.online/`. WhatsApp and Facebook use the Open Graph tags. The share image is `assets/social-share.jpg`; keep it publicly accessible at that URL. Confirm that HTTPS and the `www` host are configured when deploying, and redirect other host variants to the canonical host. Social platforms may cache older previews.

Each page contains a static snapshot of its main content for search engines and visitors before JavaScript runs. The interactive version is rendered from `script.js`; whenever page copy or layout changes there, update the corresponding static `<main>` snapshot too, so both versions remain consistent.
