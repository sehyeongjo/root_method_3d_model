# How to Run on macOS with Node.js

This project is a static browser-based demo. It does not require a build step, but it must be opened through a local web server because the app loads CSV/XLSX files with `fetch()` and uses JavaScript modules.

## 1. Install Node.js

If Node.js is not installed, install it with Homebrew:

```bash
brew install node
```

Check that Node.js and npm are available:

```bash
node -v
npm -v
```

Node.js 18 or newer is recommended.

## 2. Open the Project Folder

Move into the folder that contains `index.html`, `app.js`, and the data files. Replace the path below with the location where you saved this project:

```bash
cd path/to/root_method_3d_model
```

## 3. Start a Local Node Server

Run a static file server with `npx`:

```bash
npx http-server . -a 127.0.0.1 -p 8000 -c-1
```

If npm asks whether to install `http-server`, type `y` and press Enter.

## 4. Open the Main Demo

In another Terminal window, open the local URL:

```bash
open http://127.0.0.1:8000/
```

Or paste this URL into a browser:

```text
http://127.0.0.1:8000/
```

## 5. Open the Minimal Version

The minimal version is kept in a separate folder. The main demo is also CSV/data driven; this version differs by using a smaller subset of the cleaned Rhizovision CSV variables and a reduced parameter file instead of the full visual model.

With the same local server still running, open:

```bash
open http://127.0.0.1:8000/minimal-version/index.html
```

Or paste this URL into a browser:

```text
http://127.0.0.1:8000/minimal-version/index.html
```

## 6. Stop the Server

Return to the Terminal window running `http-server` and press:

```text
Control + C
```

## If Port 8000 Is Already in Use

Use another port, for example:

```bash
npx http-server . -a 127.0.0.1 -p 8001 -c-1
open http://127.0.0.1:8001/
open http://127.0.0.1:8001/minimal-version/index.html
```

## Notes

- Do not open `index.html` or `minimal-version/index.html` directly with `file://`; the CSV/XLSX data loading may fail.
- No `npm install` step is needed for this project because the required browser libraries are included in the `vendor/` folder.
- Minimal version parameters, including gravity sag, are in `minimal-version/parameters.js`.
- Keep `clean roots rhizovision output.csv`, `cleaned_root_data_april.xlsx`, `app.js`, `root-visual-parameters.js`, `index.html`, `minimal-version/`, and `vendor/` in the same project folder structure.
