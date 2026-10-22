# Cyclefest route map

A small static website for the Cyclefest bike party in Umeå. Each participant picks
their group (G1–G27) and sees:

- where to go in each of the three rounds (19:30, 20:45, 22:00), and whether they host
- which round is on **now** and where to go **next**, based on the clock
- entry details (door code, floor) and the host's phone number
- who else will be at each party, with their dietary notes
- a map of Umeå with the night's stops and the bike route between them

It uses only free and open-source services: [Leaflet](https://leafletjs.com/) for the
map, [OpenStreetMap](https://www.openstreetmap.org/) tiles, and the
[FOSSGIS OSRM](https://routing.openstreetmap.de/) bike router. No API keys and nothing to pay for.

## Usage

Start the local server:

```bash
make up
```

Open http://127.0.0.1:8080/ and pick a group. Link straight to a group with `#G5`,
e.g. http://127.0.0.1:8080/#G5. The choice is also remembered in the browser.

On the page:

- **Route me there / Where am I?** uses the phone's location to draw a bike route to the next stop.
- **Bike directions** opens turn-by-turn on openstreetmap.org (bike profile).
- **Map app** opens a `geo:` link, which works with Android map apps such as Organic Maps or OsmAnd.
- **All parties** lists every party in a round.

Stop the server:

```bash
make down
```

Other commands: `make help`.

Prerequisites: `make`, plus PHP (preferred, matches the server) or Python 3 for the local server.

## Deploy to people.cs.umu.se

```bash
make deploy CS_USER=<your-cs-username>
```

This copies the site to `~/public_html/<project>/` on itchy and serves it at
`https://people.cs.umu.se/<cs-username>/<project>/`. The `.docx` and `guidelines/`
are not copied. `.htaccess` blocks `README.md`, `Makefile`, `router.php` and any `.docx`.

**Privacy:** the page contains participants' names, phone numbers, door codes and
allergies, and anyone with the URL can read it. Only share the link with participants,
and take the site down after the event.

## Data

- `assets/data.js` is generated from `Cyclefest_Final_Schedule.docx`. If the schedule
  changes, edit this file directly.
- Coordinates come from OpenStreetMap. A few addresses were only found at street level and
  show an **approx. pin**: Storgatan 110A, Magistervägen 10 and Orienteringsstigen 6B.
- In the source document, G19's location is just "3F". The schedule puts G19's party at
  Pedagoggränd 3F, so that address is used.
- The source schedule lists some groups as both host and guest in the same round, and
  leaves some groups out of a round. The page shows a warning, or "not listed in this
  round", instead of guessing:
  - Round 1: G3–G9 host and are also guests; G21–G27 are not listed.
  - Round 2: G10–G15, G17 and G18 host and are also guests; G20–G27 are not listed.
  - Round 3: G20 hosts and is also a guest at G27; G14 is not listed.
