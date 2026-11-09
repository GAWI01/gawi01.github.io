# gawi01.github.io

Personal portfolio for Gabriel Witzøe at [gawi.no](https://gawi.no): a simple single page with About, Projects and Contact.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview  # serve the built site
```

- `index.html` holds all the content.
- `src/style.css` is the styling (dark background, mint accent `#8ce7bd`).
- `src/main.js` sets the footer year and redirects old `#/section` links.

The previous 3D arcade version lives in git history (before this change).

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`, adding the `CNAME` for gawi.no. In the repository settings, Pages must use **Source: GitHub Actions**.

`.github/workflows/preview.yml` builds every `claude/**` branch with `BASE_PATH=/gawi-test/` and pushes it to the separate `GAWI01/gawi-test` repository (needs a `PREVIEW_TOKEN` secret), so work in progress never touches the live site.
