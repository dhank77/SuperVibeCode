# SuperVibeCode landing page

A static site: `index.html`, `style.css`, `main.js` and `assets/`. No build step.

## Preview

```bash
cd landingpage
python3 -m http.server 8080   # or: npx serve .
```

Then open http://localhost:8080.

## Publish

- **Vercel:** import the repository, set **Root Directory** to `landingpage`, framework preset **Other**, no build command.
- **Netlify:** base directory `landingpage`, no build command, publish directory `landingpage`.
- **GitHub Pages:** publish the `landingpage` folder, for example with the `actions/deploy-pages` workflow.

## Download links

The download buttons point at the latest GitHub release of the repository named in `REPO` at the top of `main.js`.
Change it if releases are published from another repository, such as a fork that builds them.

Fonts (Schibsted Grotesk, JetBrains Mono) are served from `assets/fonts` under the SIL Open Font License.
