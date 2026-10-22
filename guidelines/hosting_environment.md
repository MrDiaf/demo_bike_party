# Hosting Environment Rules (people.cs.umu.se)

These rules describe the environment that projects in this profile are built for: personal websites hosted on Umeå University's Computing Science web server, `people.cs.umu.se`.

They override the other guidelines wherever those assume Docker, a long-running application server, or root access.

## 1. What the target environment looks like

The project is deployed by placing its files in the user's `public_html` directory on the department's Linux system.

```text
Login host:   itchy.cs.umu.se   (shared login machine, reached with ssh)
User:         <cs-username>     (for example c23rwr)
Web root:     ~/public_html/
Project dir:  ~/public_html/<project>/
Public URL:   https://people.cs.umu.se/<cs-username>/<project>/
```

Example from a working project:

```text
c23rwr@itchy:~$ cd public_html/
c23rwr@itchy:~/public_html$ ls
crime_radar/  java_gruppprojekt/  ou2_robot/

c23rwr@itchy:~/public_html/crime_radar$ ls
Dockerfile  Makefile  README.md  api/  apache/  assets/  compose.yaml
data/  includes/  index.php  router.php  schema.sql  scripts/  tests/
```

served at:

```text
https://people.cs.umu.se/c23rwr/crime_radar/
```

Several unrelated projects live side by side in the same `public_html`. Each project owns only its own subdirectory.

## 2. The department web server is the only server

The department runs the web server (Apache). It serves files from `public_html` and executes PHP on each request.

The project must not need any server process of its own.

This means the project must **not** depend on:

* a Node, Python, Java, Go, or other application server that has to be started
* `npm run start`, `php -S`, `flask run`, `uvicorn`, or similar in production
* a separate frontend dev server or build server
* Docker or Docker Compose
* a database server (PostgreSQL, MySQL, Redis, …)
* background workers, daemons, or processes that must stay running
* opening or listening on ports
* `sudo`, Apache configuration changes, or VirtualHost files

If a feature seems to need one of these, find a design that fits the environment or ask before proceeding.

## 3. Allowed building blocks

A project may use:

* static files: HTML, CSS, JavaScript, images, fonts, JSON
* plain browser JavaScript, without a required build step
* PHP for server-side logic, executed per request by Apache
* SQLite through PHP's PDO for persistent data
* `.htaccess` files for directory indexes, access control, and headers
* JavaScript and CSS libraries loaded from a public CDN or committed as files
* PHP command-line scripts run manually over ssh for imports or maintenance

Prefer static files alone when the project does not need server-side logic.

Use PHP only where something must happen on the server: storing data, hiding a secret, proxying an external API that blocks browser requests, and similar.

## 4. No mandatory build step

The files in the repository must be the files that are served.

Do not require `npm install`, bundlers, transpilers, or compilers before the site works.

If a build step is ever genuinely needed, its output must be committed so that copying the repository to the server is still enough to deploy it.

## 5. The project must work from any subdirectory

The site is served under a path such as `/c23rwr/crime_radar/`, not at the domain root. The directory name and username can change.

Therefore:

* use relative URLs for the project's own files: `assets/app.js`, `api/events.php`
* never use root-absolute URLs for project files: `/assets/app.js`, `/api/events.php`
* never hardcode the host name, username, or project directory name
* never hardcode absolute filesystem paths; in PHP build paths from `__DIR__`

Correct:

```js
fetch('api/events.php')
```

```php
$databasePath = dirname(__DIR__) . '/data/app.sqlite';
```

Incorrect:

```js
fetch('/api/events.php')
fetch('https://people.cs.umu.se/c23rwr/crime_radar/api/events.php')
```

```php
$databasePath = '/home/c23rwr/public_html/crime_radar/data/app.sqlite';
```

Renaming or moving the project directory must not break the site.

## 6. Everything in the project directory is public by default

Any file under `public_html` can be requested from the internet unless it is blocked.

Protect files that must not be downloaded:

* the SQLite database and its `-wal`/`-shm` files
* PHP include files, import scripts, and tests
* `schema.sql`, `Makefile`, `README.md`, and similar project files
* any configuration containing secrets

Use `.htaccess`:

```apache
# project root .htaccess
Options -Indexes
DirectoryIndex index.php index.html

<FilesMatch "^(schema\.sql|README\.md|Makefile|router\.php)$">
    Require all denied
</FilesMatch>
```

```apache
# data/.htaccess, includes/.htaccess, scripts/.htaccess, tests/.htaccess
Require all denied
```

Do not commit secrets. If an API key is required, keep it in a file that is denied by `.htaccess` and listed in `.gitignore`, and provide an example file.

## 7. Persistent data

Use SQLite stored inside the project, for example `data/app.sqlite`, with `data/.htaccess` denying web access.

* create the schema automatically on first use (`CREATE TABLE IF NOT EXISTS`)
* keep the database file out of Git
* the web server process must be able to write to the `data/` directory; document the required permissions in the README and verify them on the server

Do not use a database server.

## 8. Scheduled or recurring work

There is no guaranteed background process.

Prefer designs that do not need one, for example:

* fetch fresh external data on request and cache it in SQLite for a short time
* provide a PHP CLI script that is run manually over ssh

If a project truly needs periodic jobs, state that as an external requirement and ask before relying on cron on the department machines.

## 9. External resources

The site is opened by ordinary browsers on the public internet.

* load external libraries over `https`
* pin library versions in CDN URLs
* call external APIs from the browser only if they allow cross-origin requests; otherwise proxy them through a small PHP script
* do not assume any software beyond Apache and PHP exists on the server; verify a PHP extension (such as `pdo_sqlite`) is available before depending on it

## 10. Local development mirrors the server

Local development should imitate the server without installing system-wide software.

The standard local setup is PHP's built-in server, started by the Makefile:

```bash
php -S 127.0.0.1:8080 -t . router.php
```

`php -S` ignores `.htaccess`, so a small `router.php` must block the same private paths that `.htaccess` blocks. This router is for local development only.

To catch subdirectory bugs (rule 5), test locally under a subpath when practical, for example by serving the parent directory and opening `http://127.0.0.1:8080/<project>/`.

Docker files may exist as an optional alternative, but the project must never require them.

Do not add Makefile targets that install system packages or configure the host's Apache with `sudo`.

## 11. Deployment

Deployment is copying files. The normal options are:

```bash
# from the developer's machine
rsync -av --delete \
  --exclude .git --exclude .runtime --exclude 'data/*.sqlite*' \
  ./ <cs-username>@itchy.cs.umu.se:public_html/<project>/
```

or cloning/pulling the repository directly inside `~/public_html/<project>/` on itchy.

If the project provides a deploy target, it should be:

```bash
make deploy
```

with the username and project directory as overridable variables, never hardcoded.

Deployment must not overwrite or delete the server's SQLite database.

After deploying, verify in a browser at `https://people.cs.umu.se/<cs-username>/<project>/` that:

* the page loads with styles and scripts
* API/PHP endpoints respond (check the browser's network tab)
* private files such as `data/app.sqlite` and `schema.sql` return 403 or 404

## 12. How this changes the Make interface

The Make commands from `deployment.md` still apply, with these meanings:

```text
make up       Start the local PHP development server (and initialize local data)
make down     Stop the local development server; keep data
make help     List commands
make test     Syntax checks (php -l, node --check if available) and endpoint checks
make deploy   Optional: copy the project to ~/public_html/<project>/ on itchy
```

`make up` is for local development only. On the server nothing needs to be started; the site is live as soon as the files are in place.

## Summary

A project in this profile is a folder of static files and PHP scripts, optionally with a SQLite file, that:

* works when copied into any `~/public_html/<name>/`
* needs no running process, container, database server, or build step on the server
* blocks its private files with `.htaccess`
* can be developed locally with `make up` using PHP's built-in server
