# Installing Gori.Lab on another computer

Step-by-step guide to run Gori.Lab on a new Windows, macOS or Linux computer. No programming
knowledge is needed: copy each command into a terminal and press Enter.

Gori.Lab runs entirely on the computer it is installed on. All data (accounts, orders, clients, stock,
documents, uploaded photos and files) stays in the app folder on that computer.

Time needed: about 15 minutes, most of it downloads.

---

## 1. What you need

- A computer with Windows 10/11, macOS 13+ or a recent Linux.
- About 1 GB of free disk space.
- An internet connection during installation (not needed afterwards).
- The app's code: either access to the GitHub repository, or a ZIP of the project folder from the
  current owner (see step 3).

## 2. Install Node.js (once)

Gori.Lab needs **Node.js 24 or 26** (both are LTS versions). If you ever switch Node.js version after
installing, read section 10 first.

**Windows** – open *PowerShell* (Start menu → type "PowerShell") and run:

```powershell
winget install --id OpenJS.NodeJS.LTS
```

If `winget` is not available, download the **LTS** installer from <https://nodejs.org> and run it with
the default options.

**macOS** – download the **LTS** installer from <https://nodejs.org>, or with Homebrew: `brew install node@24`.

**Linux** – use the instructions for your distribution at <https://nodejs.org/en/download>.

**Close the terminal and open a new one**, then check that it worked:

```powershell
node --version
npm --version
```

The first command must print `v24...` or `v26...`. If it says "not recognized", restart the
computer and try again.

## 3. Get the app's code

Choose one.

**Option A – from GitHub** (needs Git: `winget install --id Git.Git` on Windows, then a new terminal):

```powershell
cd $HOME\Documents
git clone https://github.com/bernas-estevam97/3d-print-cost-calculator.git gorilab
cd gorilab
```

If the repository is private, the owner must first add your GitHub account as a collaborator.

**Option B – from a ZIP the owner sends you.** Unzip it, for example to `Documents\gorilab`, then open a
terminal in that folder:

```powershell
cd $HOME\Documents\gorilab
```

> **For the owner preparing the ZIP:** zip the project folder **without** `node_modules`, `.next`,
> `.env`, `prisma\dev.db*`, `uploads`, `backup`, `logs` and `NOTES.local.md`. Those are either
> rebuilt during installation or contain your private data and secrets.
> The quickest way, if the folder is a git repository: `git archive -o gorilab.zip HEAD`
> (this zips the last commit, so commit your changes first).

All the following commands are run **inside this folder**.

## 4. Create the settings file (`.env`)

The app reads its settings from a file called `.env`. Create it from the template:

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Now generate a secret key used to protect logins:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Open `.env` in a text editor (Windows: `notepad .env`) and replace the whole `SESSION_SECRET` line with
the key you just generated, in quotes. The file should then look like this (with your own key):

```
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="3f9c...64 characters in total...a1b2"
UPLOAD_DIR="./uploads"
MAX_UPLOAD_MB=50
```

Save and close. Never share this file: anyone with the key could forge a login.

| Setting | Meaning |
| --- | --- |
| `DATABASE_URL` | Where the database file is created. Leave as is. |
| `SESSION_SECRET` | Secret key for logins. Must be at least 32 characters. |
| `UPLOAD_DIR` | Folder for uploaded photos and slicer files. |
| `MAX_UPLOAD_MB` | Largest file that can be uploaded, in MB. |

## 5. Install and build

Run these three commands, one at a time:

```powershell
npm install
npx prisma migrate deploy
npm run build
```

What they do:

1. `npm install` downloads the libraries the app uses (a few minutes). Warnings are normal; it is fine
   as long as it does not end with `npm error`.
2. `npx prisma migrate deploy` creates the empty database at `prisma/dev.db`. It should end with
   *All migrations have been successfully applied.*
3. `npm run build` prepares the app for daily use (about a minute). It should end with a list of pages
   and no errors.

## 6. Start the app

```powershell
npm start
```

Open <http://localhost:3000> in a browser. On the login page click **"No account yet? Create a
workshop"**, enter a name, email and password, and you are in. A new workshop starts empty, with default
settings, tax rates and catalogs.

Suggested first steps: **Settings** (electricity tariff, markup, currency) → **Printers** → **Stocks →
Filaments** → **Calculator** (drop a `.gcode` or `.3mf` file) → save the order.

The terminal window must stay open while you use the app. To stop it, click the terminal and press
**Ctrl+C**. To start it again later:

```powershell
cd $HOME\Documents\gorilab
npm start
```

## 7. Use it from a phone or another device (optional)

On the same Wi-Fi network, open `http://<this-computer's-IP>:3000` on the phone. To find the IP on
Windows run `ipconfig` and look for *IPv4 Address* (for example `192.168.1.20`).

Windows blocks this until the port is allowed once. Open PowerShell **as administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "Gori.Lab" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

This only opens the port on private (home/office) networks, not on public Wi-Fi.

## 8. Back up your data

All data is in two places inside the app folder:

- `prisma/dev.db` – the database (accounts, orders, clients, stock, documents, settings)
- `uploads/` – uploaded photos, slicer files and logos

Make a backup at any time (the app can keep running):

```powershell
npm run backup
```

It writes a copy to `backup/<date-time>/` and keeps the 7 most recent. Copy that folder to a USB drive
or cloud storage now and then.

Other ways to get data out:

- **Settings → Backups → Download full backup**: one JSON file with everything in your workshop
  (photos not included). It can be restored on another Gori.Lab installation from the same screen.
- **Export / Import** buttons on Clients, Orders, Filaments and each Stocks shelf: CSV files that open
  in Excel and can be imported into another installation or app.

**Restoring a backup** (stop the app first with Ctrl+C):

```powershell
Copy-Item backup\<date-time>\dev.db prisma\dev.db -Force
Remove-Item prisma\dev.db-wal, prisma\dev.db-shm -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force uploads
Copy-Item -Recurse backup\<date-time>\uploads uploads
npm start
```

**Moving to a new computer:** install the app there (steps 2–5), then copy `prisma/dev.db` and the
`uploads/` folder from the old computer into the same places, and start it.

## 9. Updating to a new version

Stop the app (Ctrl+C), back up (`npm run backup`), then get the new code:

- From GitHub: `git pull`
- From a ZIP: unzip the new version **over** the existing folder, so that `.env`, `prisma/dev.db` and
  `uploads/` are kept.

Then:

```powershell
npm install
npx prisma migrate deploy
npm run build
npm start
```

`migrate deploy` updates the database structure and keeps your data.

## 10. Changing the Node.js version

Updating within the same major version (for example 24.16 to 24.20) needs nothing extra.

Changing the major version (24 to 26, or back) breaks the database driver. `better-sqlite3` is
compiled for one specific Node.js version, and the copy in `node_modules` does not load under another
one. The app then fails as soon as it opens the database, with an error like *Could not locate the
bindings file* or *was compiled against a different Node.js version*.

`npm run build` still succeeds in that state, because the build never opens the database. Only
`npm start` shows the problem.

After every major version switch, stop the app (Ctrl+C) and run:

```powershell
node --version                # check that the version you want is active
npm rebuild better-sqlite3    # fetch the driver for this Node.js version
npm run build
npm start
```

If `npm rebuild` fails, or prints a message that install scripts were blocked or skipped, allow
them and run it again. If it still fails, do a clean reinstall with `npm ci` and then `npm run build`.

**Using nvm (several Node.js versions on one computer).** On Windows, `nvm use 24` / `nvm use 26`
switches Node.js for the whole computer, not just one terminal, and the choice stays after a restart.
Check with `node --version` before starting the app, and rebuild as above whenever you switch.
To avoid rebuilding, keep one copy of the app folder per Node.js version (each has its own
`node_modules`). Run only one copy at a time, because both use port 3000.

If `npm` stops working after installing nvm (*node is not recognized* from a file under
`AppData\Roaming\npm`), an old global npm from the previous Node.js install is in the way. Close all
terminals, open a new one, and run `nvm use 24`. If it persists, delete the `npm`, `npm.cmd`,
`npm.ps1`, `npx`, `npx.cmd` and `npx.ps1` files in `%AppData%\npm`.

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` or `npm` "is not recognized" | Close and reopen the terminal, or restart the computer after installing Node.js. |
| `npm install` fails while building `better-sqlite3` | Your Node.js version is too old or too new. Install Node.js 24 or 26 and run `npm install` again. |
| App starts, then fails with *Could not locate the bindings file* or *compiled against a different Node.js version* | Node.js version changed since installation. Run `npm rebuild better-sqlite3`, then `npm run build` (section 10). |
| *Port 3000 is already in use* / `EADDRINUSE` | The app (or another program) is already running. Close the other terminal, or on Windows run `Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { taskkill /PID $_.OwningProcess /T /F }`. |
| Error mentioning `SESSION_SECRET` or *password must be at least 32 characters* | `.env` is missing or the key is too short. Redo step 4. |
| *The table ... does not exist* | The database was not created. Run `npx prisma migrate deploy`. |
| Changes to the code do not show up | `npm start` serves the last build. Run `npm run build` again, then `npm start`. |
| The page looks broken after an update | Hard-refresh the browser (Ctrl+F5). If it persists: delete the `.next` folder and run `npm run build`. |
| Phone cannot connect | Check that both devices are on the same Wi-Fi, use the computer's IP (not `localhost`), and add the firewall rule from step 7. |
| Forgot the password | There is no email reset in the local version. Another account cannot reset it either; restore a backup or ask the owner of the installation for help. |

## Command summary

```powershell
npm install                 # install / update libraries
npx prisma migrate deploy   # create or update the database
npm run build               # prepare the app (after every update)
npm start                   # run the app at http://localhost:3000
npm run backup              # back up database and uploads
```



## Recommended commands for other users (non-developers)

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev                 # for running dev environment
npm run build               # prepare production app
npm start
