# Water Tower Map

A project to easily locate Water Towers in the UK.

[Website](https://digitalight.github.io/wtmap/)

## Features

- [x] Get a dataset of Water Towers and overlay it on an interactive map.
- [x] Compass feature showing nearest tower.
- [x] Get directions using Waze - send location to Waze.
- [x] Easier way to update the data. Automated with Github Actions. Every week.

To Do:

- [ ] Incorporate a database so users can add missing water towers
- [ ] Add pictures in the popup
- [ ] Track which towers a user has visited. Will need to incorporate profile management.

Uses Leaflet.js to generate the Map.

Version 1 dataset is OpenstreetMap using the tool
Overpass Turbo

Query used:

```
/*
This query looks for nodes, ways and relations
with the given key/value combination.
Choose your region and hit the Run button above!
*/
[out:json][timeout:25];
// gather results
nwr["man_made"="water_tower"]({{bbox}});
// print results
out geom;
```
