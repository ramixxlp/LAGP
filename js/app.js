/*
    =====================================================================
    APP.JS — what the page does
    =====================================================================

    This file loads the fieldwork data, draws it on the map, and reacts
    to everything you click: filters, the list, the map buttons and so on.

    It's split into numbered sections:

         1. Settings                    you'll change these most often
         2. The app's memory            what is selected, filtered, open…
         3. Small helper functions
         4. Preparing the data
         5. Creating the map
         6. Starting the app            load data → set up map → show points
         7. Map layers                  terrain, aerial, contours, points
         8. Filters                     material buttons, search, dropdowns
         9. The list of entries in view
        10. Selecting an entry          dashed ring + popup
        11. The entry detail panel
        12. Map / Grid / Timeline tabs
        13. Map control buttons         3D, zoom, fullscreen, compass…
        14. Status bar                  elevation, coordinates, scale
        15. About / Add fieldwork windows
        16. Mountain peak labels

    ---------------------------------------------------------------------
    A FEW JAVASCRIPT BASICS, to help you read the code below
    ---------------------------------------------------------------------

    // text after two slashes is a comment (ignored by the browser)

    const name = value;     → stores a value under a name. "const" = it won't be replaced.
    let name = value;       → the same, but the value can be replaced later.

    'text'  or  "text"      → a piece of text (a "string").
    [a, b, c]               → a list (an "array"). The first item is number 0.
    { key: value }          → a group of named values (an "object").
                              Read one value with a dot:  entry.title

    function doSomething(input) { … }
                            → a reusable set of steps. Run it with doSomething(x).

    if (condition) { … } else { … }
                            → only run the steps if the condition is true.

    ===   !==               → "is equal to" / "is not equal to"
    &&    ||    !           → "and" / "or" / "not"

    `Hello ${name}`         → text written between backticks can include values:
                              ${…} is replaced by the value inside it.

    document.querySelector('#search')
                            → finds an element on the page, using the same
                              selectors as CSS (#id or .class).

    element.addEventListener('click', function () { … })
                            → "when this element is clicked, run these steps".
                              This is how the page reacts to the user.

    map.on('load', function () { … })
                            → the same idea for the map: "when the map has
                              loaded, run these steps".
    =====================================================================
*/


/* =====================================================================
   1. SETTINGS
   ===================================================================== */

// Your Mapbox key. It gives the page permission to use Mapbox maps.
const MAPBOX_TOKEN = 'pk.eyJ1Ijoicm1zYWxsYW0iLCJhIjoiY21zdm9xOTRhMHp3YzJ6czc5dTJ4bWQ3NCJ9.-tA38K6Tr3SR-b61rV5-_A';

// Your map style, made in Mapbox Studio
const MAP_STYLE = 'mapbox://styles/rmsallam/cmuzo24t1000p01s06njrca9h';

// The file that holds the fieldwork entries
const DATA_FILE = 'data/fielddata01.geojson';

// The material types and their colours, in the order the buttons appear.
// "darkText: true" means the button uses black text, because the colour is light.
// To add a new material, add a line here. It will then appear as a button automatically.
// "edge" gives the button an outline in another colour, for colours that would disappear on the black sidebar.
// The "Type" in the data is matched without caring about capitals: "3d model" → "3D model".
// Colours from the project palette (coolors.co/4560a6-fecd24-3c281f-006d4f-c78b88-000000-afb8c9-143796-c42e2d-834c3d).
// The palette has 10 colours for 12 types, so Sample and Map use lighter tints of palette colours.
const MATERIALS = {
    Photography: { color: '#006d4f' },
    Video:       { color: '#fecd24', darkText: true },
    Audio:       { color: '#c42e2d' },
    Drawing:     { color: '#834c3d' },
    Fieldnotes:  { color: '#143796' },
    '3D model':  { color: '#4560a6' },   // quotes because the name starts with a number and has a space
    Sketch:      { color: '#c78b88', darkText: true },
    Archival:    { color: '#000000', edge: '#8a8a8a' },
    Material:    { color: '#afb8c9', darkText: true },
    Sample:      { color: '#66a795', darkText: true },   // a lighter tint of the Photography green
    Map:         { color: '#fee592', darkText: true },   // a lighter tint of the Video yellow
    Other:       { color: '#3c281f', edge: '#5a4a42' }
};

// The style for anything coloured by its material (buttons, cards): "--c:#006d4f; --edge:#006d4f"
function materialStyle(name) {
    const material = MATERIALS[name];
    return '--c:' + material.color + '; --edge:' + (material.edge || material.color);
}

// The columns of the data file, and the short names the code uses for them.
// The data comes from a spreadsheet whose column headers also contain instructions, like
//   "Title\nShort, descriptive\t\ne.g. Fungal growth on fallen beech"
// so we only look at the FIRST LINE of each header ("Title"), ignoring capitals and spaces.
// If a column is renamed in the spreadsheet, change its first line here.
const COLUMNS = {
    title:       'Title',
    author:      'Author',
    type:        'Type',
    date:        'Date',
    time:        'Capture time',
    place:       'Place',
    accuracy:    'Location accuracy',
    topic:       'Topic',
    tags:        'Tags',
    scale:       'Scale',
    fileName:    'File Name',
    url:         'URL',
    description: 'Description',
    reflection:  'Critical Reflection',
    conditions:  'Conditions'
};

// The dropdown menus under the material buttons. Each one filters on one field of the entries.
// To add a dropdown, add a line here AND a <select> with the same id in index.html.
const DROPDOWNS = [
    { selector: '#f-site',   field: 'place' },
    { selector: '#f-year',   field: 'year' },
    { selector: '#f-topic',  field: 'topic' },
    { selector: '#f-author', field: 'author' },
    { selector: '#f-scale',  field: 'scale' }
];

// The list of material names only: ['Photography', 'Drawing', …]
const ALL_MATERIAL_NAMES = Object.keys(MATERIALS);


/* =====================================================================
   2. THE APP'S MEMORY
   Everything the app needs to remember while you use it.
   When something changes (for example you click a filter), we update
   these values and then redraw the parts of the page that depend on them.
   ===================================================================== */

const app = {
    allEntries: [],           // every entry from the data file
    visibleEntries: [],       // only the entries that pass the current filters

    // The current filters
    activeMaterials: new Set(ALL_MATERIAL_NAMES),  // the materials switched on (a "Set" is a list without duplicates)
    searchText: '',           // what's typed in the search box
    chosen: {},               // the value chosen in each dropdown, e.g. { place: 'St. Luc' } (missing or '' = nothing chosen)

    selectedId: null,         // the ID of the entry with the dashed ring (null = none)
    openDetailId: null,       // the ID of the entry open in the detail panel (null = panel closed)
    hoveredId: null,          // the ID of the point under the mouse
    currentView: 'map',       // 'map', 'grid' or 'timeline'
    is3D: false               // is the map tilted?
};

// A quick way to find an entry from its ID: entriesById.get(5) gives entry number 5
const entriesById = new Map();


/* =====================================================================
   3. SMALL HELPER FUNCTIONS
   Little tools used in several places further down.
   ===================================================================== */

// Makes text safe to put inside the page.
// Without this, a note containing characters like < or > could break the page layout.
function escapeHtml(text) {
    if (text === null || text === undefined) {
        return '';
    }
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Turns [longitude, latitude] into readable text: "46.2205° N  7.5775° E"
// "decimals" is how many digits to show after the dot.
function formatCoordinates(coordinates, decimals) {
    const longitude = coordinates[0];
    const latitude = coordinates[1];

    let northOrSouth = 'N';
    if (latitude < 0) {
        northOrSouth = 'S';
    }
    let eastOrWest = 'E';
    if (longitude < 0) {
        eastOrWest = 'W';
    }

    // Math.abs removes the minus sign; toFixed rounds to the number of decimals
    const latitudeText = Math.abs(latitude).toFixed(decimals) + '° ' + northOrSouth;
    const longitudeText = Math.abs(longitude).toFixed(decimals) + '° ' + eastOrWest;
    return latitudeText + '&nbsp; ' + longitudeText;
}


/* =====================================================================
   4. PREPARING THE DATA
   ===================================================================== */

// Each point in the data file looks like this (headers shortened):
//   { properties: { "Title\n…": "Water Sample", "Type\n…": "sample", "Date\n…": "29.09.2026", ... },
//     geometry:   { coordinates: [7.577, 46.228] } }
//
// This function reads the spreadsheet columns listed in COLUMNS (section 1) and returns
// { title: "Water Sample", type: "sample", date: "29.09.2026", ... }.
// Empty cells become '' (empty text), so the rest of the code never has to check for null.
function readColumns(properties) {

    // First, index the data by the first line of each header: "title" → "Water Sample"
    const valuesByHeader = {};
    for (const header of Object.keys(properties)) {
        const firstLine = header.split('\n')[0].trim().toLowerCase();
        valuesByHeader[firstLine] = properties[header];
    }

    // Then pick out the columns we know
    const result = {};
    for (const shortName of Object.keys(COLUMNS)) {
        const value = valuesByHeader[COLUMNS[shortName].toLowerCase()];
        if (value === null || value === undefined) {
            result[shortName] = '';
        } else {
            result[shortName] = String(value).trim();
        }
    }
    return result;
}

// Finds the material for a "Type" written in the data, ignoring capitals:
// "sample" → "Sample", "3d model" → "3D model". Unknown types become "Other".
function findMaterial(type) {
    for (const name of ALL_MATERIAL_NAMES) {
        if (name.toLowerCase() === type.toLowerCase()) {
            return name;
        }
    }
    return 'Other';
}

// The media files are stored on Google Drive. Links come in two shapes:
//   https://lh3.googleusercontent.com/d/FILE_ID                 (a direct image)
//   https://drive.google.com/file/d/FILE_ID/view?usp=sharing    (Drive's page for the file)
// This finds the FILE_ID in either shape, or returns '' if the link is something else.
function findDriveFileId(url) {
    const match = url.match(/(?:googleusercontent\.com\/d\/|drive\.google\.com\/file\/d\/)([\w-]+)/)
               || url.match(/drive\.google\.com\/.*[?&]id=([\w-]+)/);
    if (match) {
        return match[1];
    }
    return '';
}

// Materials that are pictures, so their file can be shown with an <img>
const IMAGE_MATERIALS = ['Photography', 'Sample', 'Drawing', 'Fieldnotes'];

// Works out how to show an entry's media file:
//   image   → web address of a picture, for <img>  (or '' if there isn't one)
//   player  → web address of Drive's built-in viewer, for audio, video and 3D files (or '')
//   link    → web address to open the original file in a new tab (or '')
function findMedia(url, material) {
    if (!url) {
        return { image: '', player: '', link: '' };
    }
    const fileId = findDriveFileId(url);
    if (!fileId) {
        // Not a Drive link: treat it as a plain picture address if it's a picture material
        return { image: IMAGE_MATERIALS.includes(material) ? url : '', player: '', link: url };
    }
    if (IMAGE_MATERIALS.includes(material)) {
        return {
            image: 'https://lh3.googleusercontent.com/d/' + fileId,
            player: '',
            link: 'https://drive.google.com/file/d/' + fileId + '/view'
        };
    }
    return {
        image: '',
        player: 'https://drive.google.com/file/d/' + fileId + '/preview',
        link: 'https://drive.google.com/file/d/' + fileId + '/view'
    };
}

// This function turns one point into a tidier entry the rest of the code can use.
// "number" is the point's position in the file (1, 2, 3…), used as its ID.
function cleanUpEntry(feature, number) {
    const data = readColumns(feature.properties);
    const material = findMaterial(data.type);

    // Split the date "29.09.2026" into day, month and year.
    // The spreadsheet asks for dd.mm.yy, so a 2-digit year like "26" becomes "2026".
    const dateParts = data.date.split('.');      // → ['29', '09', '2026']
    const day = Number(dateParts[0]);
    const month = Number(dateParts[1]);
    let year = dateParts[2] || '';
    if (year.length === 2) {
        year = '20' + year;
    }

    // Split the time "13:30" into hours and minutes (00:00 if there's no time)
    const timeParts = data.time.split(':');
    const hours = Number(timeParts[0]) || 0;
    const minutes = Number(timeParts[1]) || 0;

    // A number we can sort by (newest first). Months start at 0 in JavaScript, hence "month - 1".
    let sortableDate = 0;
    if (year) {
        sortableDate = new Date(Number(year), month - 1, day, hours, minutes).getTime();
    }

    // If there's no title, build one: "Hydrology Sample"
    let title = data.title;
    if (!title) {
        title = (data.topic + ' ' + material).trim();
    }

    const media = findMedia(data.url, material);

    return {
        id: number,
        material: material,
        title: title,
        author: data.author,
        date: data.date,
        time: data.time,
        year: year,
        sortableDate: sortableDate,
        place: data.place,
        accuracy: data.accuracy,
        topic: data.topic,
        tags: data.tags,
        scale: data.scale,
        fileName: data.fileName,
        description: data.description,
        reflection: data.reflection,
        conditions: data.conditions,
        image: media.image,                  // picture to show, if there is one
        player: media.player,                // audio / video / 3D viewer, if there is one
        mediaLink: media.link,               // the original file, if there is one

        // Shown under the title in the detail panel: the file name, or "29.09.2026_ID3" if there isn't one
        reference: data.fileName || (data.date + '_ID' + number),

        // Shown under the title in lists: "29.09.2026 · Lac de Moiry"
        summary: [data.date, data.place].filter(Boolean).join(' · '),

        coordinates: feature.geometry.coordinates
    };
}

// Checks whether one entry passes all the current filters.
// Returns true (show it) or false (hide it).
// "ignoreMaterial" skips the material filter. We use that to count how many
// entries each material button would show.
function entryPassesFilters(entry, ignoreMaterial) {
    if (!ignoreMaterial && !app.activeMaterials.has(entry.material)) {
        return false;
    }
    for (const dropdown of DROPDOWNS) {
        const chosenValue = app.chosen[dropdown.field];
        if (chosenValue && entry[dropdown.field] !== chosenValue) {
            return false;
        }
    }
    if (app.searchText) {
        // Put all the entry's text together and look for the search words in it
        const allText = [
            entry.title, entry.material, entry.topic, entry.place, entry.tags,
            entry.author, entry.scale, entry.date, entry.reference,
            entry.description, entry.reflection, entry.conditions
        ].join(' ').toLowerCase();

        if (!allText.includes(app.searchText)) {
            return false;
        }
    }
    return true;
}

// Turns a list of entries into the format Mapbox needs to draw points (GeoJSON).
// Each point carries its ID, material and colour, so the map knows how to colour it.
function makeMapPoints(entries) {
    const points = [];
    for (const entry of entries) {
        points.push({
            type: 'Feature',
            id: entry.id,
            properties: {
                id: entry.id,
                material: entry.material,
                color: MATERIALS[entry.material].color
            },
            geometry: { type: 'Point', coordinates: entry.coordinates }
        });
    }
    return { type: 'FeatureCollection', features: points };
}


/* =====================================================================
   5. CREATING THE MAP
   ===================================================================== */

const map = new mapboxgl.Map({
    accessToken: MAPBOX_TOKEN,
    container: 'map',              // the id of the box in index.html where the map goes
    style: MAP_STYLE,
    center: [7.5775, 46.2205],     // [longitude, latitude] where the map starts
    zoom: 13,                      // higher number = closer in
    pitch: 0,                      // tilt: 0 = looking straight down
    attributionControl: false      // we add our own, smaller version on the next line
});

// The small "ⓘ" button with the Mapbox and OpenStreetMap credits, bottom-left
map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

// When the sidebar is swapped for the wider detail panel, the map area changes size.
// This tells the map to redraw itself at the new size whenever that happens.
const mapResizeWatcher = new ResizeObserver(function () {
    map.resize();
});
mapResizeWatcher.observe(document.querySelector('#map'));

// The dashed circle shown around the selected point
const ringElement = document.createElement('div');
ringElement.className = 'ring';
const selectionRing = new mapboxgl.Marker({
    element: ringElement,
    pitchAlignment: 'map',          // lies flat on the map when it's tilted
    rotationAlignment: 'map'
});

// The black info box shown on the map when you click a point
const popup = new mapboxgl.Popup({
    closeButton: false,             // we make our own × button
    closeOnClick: false,            // we decide ourselves when to close it
    focusAfterOpen: false,
    offset: 22,                     // distance in pixels from the point
    maxWidth: 'none',
    className: 'fw-popup'           // the class used in style.css to restyle it
});

// A "promise" is a value that will be ready later.
// This one becomes ready when the map has finished loading its style.
const mapIsReady = new Promise(function (resolve) {
    map.on('load', resolve);
});


/* =====================================================================
   6. STARTING THE APP
   ===================================================================== */

// "async" lets us use "await", which means: wait here until this is finished.
async function startApp() {

    // --- Step 1: load the data file ---
    let geojson;
    try {
        const response = await fetch(DATA_FILE);
        if (!response.ok) {
            throw new Error(response.statusText);
        }
        geojson = await response.json();
    } catch (error) {
        // "catch" runs if anything inside "try" went wrong
        console.error(error);
        document.querySelector('#entries-count').textContent = 'Data could not be loaded';
        document.querySelector('#entries').innerHTML =
            '<li class="empty">Couldn\'t load ' + escapeHtml(DATA_FILE) +
            '. Open the page through a local server (not file://).</li>';
        return;   // stop here
    }

    // --- Step 2: tidy up every entry ---
    // The data has no ID column, so each entry is numbered by its position in the file (1, 2, 3…)
    geojson.features.forEach(function (feature, index) {
        // Only keep points (skip lines or areas, in case the file ever contains them)
        if (feature.geometry && feature.geometry.type === 'Point') {
            app.allEntries.push(cleanUpEntry(feature, index + 1));
        }
    });

    // Sort: newest date and time first. If two are the same, the lowest ID goes first.
    app.allEntries.sort(function (a, b) {
        if (a.sortableDate !== b.sortableDate) {
            return b.sortableDate - a.sortableDate;
        }
        return a.id - b.id;
    });

    for (const entry of app.allEntries) {
        entriesById.set(entry.id, entry);
    }

    // --- Step 3: wait for the map, then add everything to it ---
    await mapIsReady;

    addTerrain();
    addAerialAndContourLayers();
    addFieldworkPoints();
    fillDropdowns();
    applyFilters();
    zoomToAllEntries();

    // The peak labels load separately. If they fail, the rest of the app still works.
    addPeakLabels().catch(function (error) {
        console.warn('Peak labels not loaded:', error);
    });
}

// Moves the map so that every entry fits on screen
function zoomToAllEntries() {
    const area = new mapboxgl.LngLatBounds();
    for (const entry of app.allEntries) {
        area.extend(entry.coordinates);
    }
    if (!area.isEmpty()) {
        map.fitBounds(area, {
            padding: 120,     // leave 120 pixels of space around the edges
            maxZoom: 14,      // don't zoom in closer than this
            duration: 0       // jump straight there, no animation
        });
    }
}

startApp();


/* =====================================================================
   7. MAP LAYERS
   A map is built from "layers" stacked on top of each other, like
   sheets of tracing paper. Each layer gets its information from a
   "source" (a data file or a Mapbox map service).
   ===================================================================== */

// 3D terrain: the mountains. Also needed to read the elevation under the mouse.
function addTerrain() {
    // If your map style already has terrain, there's nothing to do
    if (map.getTerrain()) {
        return;
    }
    map.addSource('dem', {
        type: 'raster-dem',                              // DEM = digital elevation model (height data)
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512
    });
    map.setTerrain({ source: 'dem', exaggeration: 1 });  // 1 = real height, 2 = twice as tall
}

// Satellite imagery ("Aerial" button) and contour lines ("Contours" button).
// Both are added hidden ("visibility: none") and switched on by the buttons.
function addAerialAndContourLayers() {

    // Find the first layer of text labels in your style, so we can slide these
    // layers underneath it. That way place names stay readable on top.
    let firstLabelLayer;
    for (const layer of map.getStyle().layers) {
        if (layer.type === 'symbol') {
            firstLabelLayer = layer.id;
            break;   // stop at the first one we find
        }
    }

    // --- Satellite imagery ---
    map.addSource('aerial', {
        type: 'raster',
        url: 'mapbox://mapbox.satellite',
        tileSize: 256
    });
    map.addLayer({
        id: 'aerial',
        type: 'raster',
        source: 'aerial',
        layout: { visibility: 'none' }
    }, firstLabelLayer);

    // --- Contour lines ---
    map.addSource('contours', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2'
    });

    // The lines. Every 5th and 10th contour (index 5 or 10) is drawn brighter and thicker.
    // The ['match', …] lists are Mapbox "expressions": small rules that work like
    //   "if the index is 5 or 10, use 0.6, otherwise use 0.28".
    map.addLayer({
        id: 'contour-lines',
        type: 'line',
        source: 'contours',
        'source-layer': 'contour',
        layout: { visibility: 'none' },
        paint: {
            'line-color': '#ffffff',
            'line-opacity': ['match', ['get', 'index'], [5, 10], 0.6, 0.28],
            'line-width': ['match', ['get', 'index'], [5, 10], 1, 0.5]
        }
    }, firstLabelLayer);

    // The height labels ("1500 m") along the brighter lines
    map.addLayer({
        id: 'contour-labels',
        type: 'symbol',
        source: 'contours',
        'source-layer': 'contour',
        filter: ['match', ['get', 'index'], [5, 10], true, false],
        layout: {
            visibility: 'none',
            'symbol-placement': 'line',                                // write the text along the line
            'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],   // "ele" = elevation
            'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-size': 10
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#000000',   // black outline around the text
            'text-halo-width': 1
        }
    });
}

// The coloured fieldwork points
function addFieldworkPoints() {

    // The source starts empty. applyFilters() fills it with the filtered entries.
    map.addSource('fieldwork', {
        type: 'geojson',
        data: makeMapPoints([]),
        promoteId: 'id'       // use our "id" to recognise each point (needed for the hover effect)
    });

    // "isHovered" is true for the point under the mouse (see setHoveredPoint below)
    const isHovered = ['boolean', ['feature-state', 'hover'], false];

    map.addLayer({
        id: 'fw-points',
        type: 'circle',
        source: 'fieldwork',
        paint: {
            'circle-color': ['get', 'color'],     // each point's colour, from makeMapPoints()

            // Size: grows as you zoom in, and is bigger when hovered.
            //   At zoom 9:  4.5px (7 when hovered)
            //   At zoom 15: 11px  (14 when hovered)
            'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                9,  ['case', isHovered, 7, 4.5],
                15, ['case', isHovered, 14, 11]
            ],

            'circle-stroke-color': '#ffffff',     // white outline
            'circle-stroke-width': ['case', isHovered, 2, 1],
            'circle-stroke-opacity': 0.75
        }
    });

    // Mouse moves over a point → hand cursor + highlight
    map.on('mousemove', 'fw-points', function (event) {
        map.getCanvas().style.cursor = 'pointer';
        setHoveredPoint(event.features[0].id);
    });

    // Mouse leaves the points → normal cursor, no highlight
    map.on('mouseleave', 'fw-points', function () {
        map.getCanvas().style.cursor = '';
        setHoveredPoint(null);
    });

    // A click anywhere on the map
    map.on('click', function (event) {
        // Was there a point under the click?
        const pointsUnderClick = map.queryRenderedFeatures(event.point, { layers: ['fw-points'] });

        if (pointsUnderClick.length > 0) {
            const clickedId = pointsUnderClick[0].id;
            if (app.openDetailId !== null) {
                openDetailPanel(clickedId);              // detail panel is open → show this entry in it
            } else {
                selectEntry(clickedId, { flyTo: false }); // otherwise → ring + popup
            }
        } else if (app.openDetailId === null) {
            clearSelection();                            // clicked on empty map → close the popup
        }
    });

    // Update the "entries in view" list after the map moves.
    // 'idle' also catches small shifts while the terrain is still loading.
    map.on('moveend', function () {
        updateEntryList(false);
    });
    map.on('idle', function () {
        updateEntryList(false);
    });
}

// Highlights one point on the map (or none, if id is null)
function setHoveredPoint(id) {
    if (app.hoveredId === id) {
        return;   // already highlighted, nothing to change
    }
    // Remove the highlight from the previous point
    if (app.hoveredId !== null) {
        map.setFeatureState({ source: 'fieldwork', id: app.hoveredId }, { hover: false });
    }
    app.hoveredId = id;
    // Highlight the new point
    if (id !== null) {
        map.setFeatureState({ source: 'fieldwork', id: id }, { hover: true });
    }
}


/* =====================================================================
   8. FILTERS
   ===================================================================== */

// Runs every time a filter changes: works out which entries to show,
// then redraws the map points, the buttons and the lists.
function applyFilters() {
    app.visibleEntries = app.allEntries.filter(function (entry) {
        return entryPassesFilters(entry, false);
    });

    // Send the filtered points to the map
    const source = map.getSource('fieldwork');
    if (source) {
        source.setData(makeMapPoints(app.visibleEntries));
    }

    // If the selected entry was just filtered out, remove its ring and popup
    // (unless its detail panel is open)
    if (app.selectedId !== null && app.openDetailId === null) {
        const selectedIsStillVisible = app.visibleEntries.some(function (entry) {
            return entry.id === app.selectedId;
        });
        if (!selectedIsStillVisible) {
            clearSelection();
        }
    }

    drawMaterialButtons();
    updateEntryList(true);
    if (app.currentView === 'grid') {
        drawGrid();
    }
    if (app.currentView === 'timeline') {
        drawTimeline();
    }
}

// Fills the dropdowns (Site, Year, Topic, Author, Scale) with the values found in the data
function fillDropdowns() {
    for (const dropdown of DROPDOWNS) {
        fillOneDropdown(dropdown.selector, app.allEntries.map(function (entry) { return entry[dropdown.field]; }));
    }
}

function fillOneDropdown(selector, values) {
    const dropdown = document.querySelector(selector);

    // Remove empty values and duplicates, then sort alphabetically
    const uniqueValues = [...new Set(values.filter(Boolean))].sort();

    for (const value of uniqueValues) {
        dropdown.append(new Option(value, value));   // new Option(text shown, value stored)
    }

    // If the data has no values for this field yet (like Site), grey out the dropdown
    if (uniqueValues.length === 0) {
        dropdown.disabled = true;
        dropdown.title = 'No values in the data yet';
    }
}

// Draws the coloured material buttons, each with its count
function drawMaterialButtons() {

    // Count how many entries each material has, using every filter EXCEPT the material one.
    // That way a switched-off button still shows how many entries it would add.
    const counts = {};
    for (const entry of app.allEntries) {
        if (entryPassesFilters(entry, true)) {
            counts[entry.material] = (counts[entry.material] || 0) + 1;
        }
    }

    // Build the HTML for each button
    let html = '';
    for (const name of ALL_MATERIAL_NAMES) {
        const material = MATERIALS[name];
        const isOn = app.activeMaterials.has(name);

        let classes = 'chip';
        if (material.darkText) {
            classes += ' is-dark';
        }
        if (!isOn) {
            classes += ' is-off';
        }

        html += `
            <button type="button" class="${classes}" style="${materialStyle(name)}"
                    data-material="${name}" aria-pressed="${isOn}">
                ${name}<span class="count">${counts[name] || 0}</span>
            </button>`;
    }
    document.querySelector('#chips').innerHTML = html;
}

// Clicking a material button.
// We listen on the box around all the buttons, then check which button was clicked.
// (The buttons are re-created on every redraw, so listening on each one wouldn't last.)
document.querySelector('#chips').addEventListener('click', function (event) {
    const button = event.target.closest('.chip');   // the button that was clicked (or that contains the click)
    if (!button) {
        return;
    }
    const name = button.dataset.material;           // reads data-material="…"

    if (app.activeMaterials.size === ALL_MATERIAL_NAMES.length) {
        // Everything is on → the first click shows ONLY this material
        app.activeMaterials = new Set([name]);
    } else if (app.activeMaterials.has(name)) {
        app.activeMaterials.delete(name);           // it's on → switch it off
    } else {
        app.activeMaterials.add(name);              // it's off → switch it on
    }

    // If everything has been switched off, switch everything back on
    if (app.activeMaterials.size === 0) {
        app.activeMaterials = new Set(ALL_MATERIAL_NAMES);
    }

    applyFilters();
});

// "show all" resets every filter
document.querySelector('#show-all').addEventListener('click', function () {
    app.activeMaterials = new Set(ALL_MATERIAL_NAMES);
    app.searchText = '';
    app.chosen = {};

    document.querySelector('#search').value = '';
    for (const dropdown of document.querySelectorAll('.selects select')) {
        dropdown.value = '';
        dropdown.classList.remove('has-value');
    }

    applyFilters();
});

// Typing in the search box.
// We wait until typing pauses for 0.12 seconds before filtering,
// so the page doesn't redraw on every single key press.
let searchTimer;
document.querySelector('#search').addEventListener('input', function (event) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
        app.searchText = event.target.value.trim().toLowerCase();
        applyFilters();
    }, 120);   // 120 milliseconds
});

// Choosing a value in one of the dropdowns
for (const dropdown of DROPDOWNS) {
    document.querySelector(dropdown.selector).addEventListener('change', function (event) {
        app.chosen[dropdown.field] = event.target.value;
        dropdownChanged(event.target);
    });
}

function dropdownChanged(dropdown) {
    // Turn the dropdown white while a value is chosen (see .has-value in style.css)
    if (dropdown.value) {
        dropdown.classList.add('has-value');
    } else {
        dropdown.classList.remove('has-value');
    }
    applyFilters();
}


/* =====================================================================
   9. THE LIST OF ENTRIES IN VIEW
   ===================================================================== */

// The HTML for one row in a list: coloured dot, title and reference.
// Used by the sidebar list and by the timeline.
function makeEntryRow(entry) {
    let classes = 'entry';
    if (entry.id === app.selectedId) {
        classes += ' is-selected';
    }
    return `
        <li class="${classes}" data-id="${entry.id}">
            <span class="dot" style="--c:${MATERIALS[entry.material].color}"></span>
            <div>
                <div class="entry-title">${escapeHtml(entry.title)}</div>
                <div class="entry-meta">${escapeHtml(entry.summary)}</div>
            </div>
        </li>`;
}

// Remembers which entries the list showed last time, to avoid redrawing it for nothing
let lastListedIds = '';

// Redraws the sidebar list with the filtered entries that are inside the visible part of the map.
// "alwaysRedraw = false" skips the redraw if the same entries are already listed.
function updateEntryList(alwaysRedraw) {
    if (app.allEntries.length === 0) {
        return;   // the data hasn't loaded yet
    }

    // The area currently visible on the map
    const visibleArea = map.getBounds();

    const entriesInView = app.visibleEntries.filter(function (entry) {
        return visibleArea.contains(entry.coordinates);
    });

    const idsInView = entriesInView.map(function (entry) { return entry.id; }).join(',');
    if (!alwaysRedraw && idsInView === lastListedIds) {
        return;
    }
    lastListedIds = idsInView;

    // The count above the list: "15 entries in view" (or "1 entry")
    let word = 'entries';
    if (entriesInView.length === 1) {
        word = 'entry';
    }
    document.querySelector('#entries-count').textContent = entriesInView.length + ' ' + word + ' in view';

    // The list itself, or a message if it's empty
    const list = document.querySelector('#entries');
    if (entriesInView.length > 0) {
        list.innerHTML = entriesInView.map(makeEntryRow).join('');
    } else if (app.visibleEntries.length > 0) {
        list.innerHTML = '<li class="empty">No entries in this part of the map.</li>';
    } else {
        list.innerHTML = '<li class="empty">No entries match these filters.</li>';
    }
}

// Makes a list react to the mouse. Used for the sidebar list, the grid and the timeline.
function connectListToMap(listElement) {

    // Click on a row or card
    listElement.addEventListener('click', function (event) {
        const row = event.target.closest('[data-id]');
        if (!row) {
            return;
        }
        const id = Number(row.dataset.id);   // data-id is text, so turn it into a number

        if (listElement.closest('.view-panel')) {
            // In Grid or Timeline: go back to the map and open the entry
            switchView('map');
            openDetailPanel(id);
        } else {
            // In the sidebar: select it on the map
            selectEntry(id, { flyTo: true });
        }
    });

    // Hovering a row highlights its point on the map
    listElement.addEventListener('mouseover', function (event) {
        const row = event.target.closest('[data-id]');
        if (row) {
            setHoveredPoint(Number(row.dataset.id));
        } else {
            setHoveredPoint(null);
        }
    });

    listElement.addEventListener('mouseleave', function () {
        setHoveredPoint(null);
    });
}

connectListToMap(document.querySelector('#entries'));
connectListToMap(document.querySelector('#grid-view'));
connectListToMap(document.querySelector('#timeline-view'));


/* =====================================================================
   10. SELECTING AN ENTRY (dashed ring + popup)
   ===================================================================== */

// Selects an entry: puts the dashed ring around it, and (optionally) shows the popup
// and flies the map to it.
//   options.flyTo     → true to move the map to the entry
//   options.showPopup → false to skip the popup (used when the detail panel is open)
function selectEntry(id, options) {
    const entry = entriesById.get(id);
    if (!entry) {
        return;
    }
    app.selectedId = id;

    // The dashed ring
    selectionRing.setLngLat(entry.coordinates).addTo(map);

    // The popup
    if (options.showPopup === false) {
        popup.remove();
    } else {
        const material = MATERIALS[entry.material];
        let chipClasses = 'chip chip-static';
        if (material.darkText) {
            chipClasses += ' is-dark';
        }

        popup.setLngLat(entry.coordinates).setHTML(`
            <div class="pop">
                <div class="pop-body">
                    <button type="button" class="pop-close" aria-label="Close">&times;</button>
                    <span class="${chipClasses}" style="${materialStyle(entry.material)}">${entry.material}</span>
                    <div class="pop-title">${escapeHtml(entry.title)}</div>
                    <div class="meta">${escapeHtml(entry.summary)}</div>
                </div>
                <div class="pop-foot">
                    <span>${escapeHtml(entry.author) || '—'}</span>
                    <button type="button" class="pop-open">Open entry &rarr;</button>
                </div>
            </div>`).addTo(map);

        // Connect the popup's two buttons
        const popupElement = popup.getElement();
        popupElement.querySelector('.pop-close').addEventListener('click', clearSelection);
        popupElement.querySelector('.pop-open').addEventListener('click', function () {
            openDetailPanel(id);
        });
    }

    // Fly the map to the entry (zooming in to at least level 14)
    if (options.flyTo !== false) {
        map.flyTo({
            center: entry.coordinates,
            zoom: Math.max(map.getZoom(), 14),
            essential: true
        });
    }

    // Underline the matching row in the sidebar list, and scroll it into view
    for (const row of document.querySelectorAll('#entries .entry')) {
        if (Number(row.dataset.id) === id) {
            row.classList.add('is-selected');
            row.scrollIntoView({ block: 'nearest' });
        } else {
            row.classList.remove('is-selected');
        }
    }
}

// Removes the ring, the popup and the underline
function clearSelection() {
    app.selectedId = null;
    selectionRing.remove();
    popup.remove();
    for (const row of document.querySelectorAll('#entries .is-selected')) {
        row.classList.remove('is-selected');
    }
}


/* =====================================================================
   11. THE ENTRY DETAIL PANEL
   ===================================================================== */

// The entries the ◀ ▶ buttons step through: the filtered entries
// (or all of them, if the filters leave nothing)
function getEntriesForPaging() {
    if (app.visibleEntries.length > 0) {
        return app.visibleEntries;
    }
    return app.allEntries;
}

// Opens the detail panel for one entry (replacing the sidebar)
function openDetailPanel(id) {
    const entry = entriesById.get(id);
    if (!entry) {
        return;
    }
    app.openDetailId = id;

    // This class hides the sidebar and the tabs (see "body.detail-open" in style.css)
    document.body.classList.add('detail-open');

    // Position in the list, for the "3/15" counter.
    // findIndex starts counting at 0, so we add 1 when displaying it.
    const pagingList = getEntriesForPaging();
    const position = pagingList.findIndex(function (other) { return other.id === id; });

    const material = MATERIALS[entry.material];
    let chipClasses = 'chip chip-static';
    if (material.darkText) {
        chipClasses += ' is-dark';
    }

    // The image, Drive's audio / video / 3D viewer, or a placeholder if there isn't any media.
    // referrerpolicy="no-referrer" helps Google serve the file to pages on other websites.
    let mediaHtml = 'No media yet';
    if (entry.image) {
        mediaHtml = `<img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}" referrerpolicy="no-referrer">`;
    } else if (entry.player) {
        mediaHtml = `<iframe src="${escapeHtml(entry.player)}" title="${escapeHtml(entry.title)}" allow="autoplay; fullscreen" loading="lazy"></iframe>`;
    }

    // A link under the media to open the original file in a new tab
    let mediaLinkHtml = '';
    if (entry.mediaLink) {
        mediaLinkHtml = `<a class="media-link" href="${escapeHtml(entry.mediaLink)}" target="_blank" rel="noopener">Open original file &nearr;</a>`;
    }

    // One label + value in the two-column grid. Shows a dash when the value is empty.
    function field(label, value) {
        return `<div class="field"><dt>${label}</dt><dd>${escapeHtml(value) || '—'}</dd></div>`;
    }

    // One block of longer text (Description, Conditions…)
    function textBlock(label, value) {
        return `
            <section class="notes">
                <h3>${label}</h3>
                <p>${escapeHtml(value) || '—'}</p>
            </section>`;
    }

    // Build the panel. "data-action" labels each button so the click handler below knows what to do.
    const panel = document.querySelector('#detail');
    panel.innerHTML = `
        <div class="detail-top">
            <button type="button" class="back" data-action="close">&larr;&nbsp;back to map</button>
            <div class="pager">
                <span>${position + 1}/${pagingList.length}</span>
                <button type="button" data-action="previous" aria-label="Previous entry">
                    <svg width="14" height="16" viewBox="0 0 14 16"><path d="M13 1v14L1 8z" fill="currentColor"/></svg>
                </button>
                <button type="button" data-action="next" aria-label="Next entry">
                    <svg width="14" height="16" viewBox="0 0 14 16"><path d="M1 1v14l12-7z" fill="currentColor"/></svg>
                </button>
            </div>
        </div>

        <span class="${chipClasses}" style="${materialStyle(entry.material)}">${entry.material}</span>
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="meta">${escapeHtml(entry.reference)}</div>

        <div class="media">${mediaHtml}</div>
        ${mediaLinkHtml}

        <dl class="fields">
            <div class="field"><dt>Coordinates</dt><dd>${formatCoordinates(entry.coordinates, 5)}</dd></div>
            ${field('Location accuracy', entry.accuracy)}
            ${field('Place', entry.place)}
            ${field('Scale', entry.scale)}
            ${field('Date', entry.date)}
            ${field('Time', entry.time)}
            ${field('Type', entry.material)}
            ${field('Topic', entry.topic)}
            ${field('Author', entry.author)}
            ${field('Tags', entry.tags)}
        </dl>

        ${textBlock('Description', entry.description)}
        ${textBlock('Conditions', entry.conditions)}
        ${textBlock('Critical reflection', entry.reflection)}`;

    panel.hidden = false;
    panel.scrollTop = 0;   // start at the top of the panel

    // Move the map to the entry and draw the ring, without the popup
    selectEntry(id, { flyTo: true, showPopup: false });
}

// Goes to the previous (step = -1) or next (step = 1) entry
function showNeighbouringEntry(step) {
    const pagingList = getEntriesForPaging();
    const position = pagingList.findIndex(function (entry) { return entry.id === app.openDetailId; });

    // "%" (remainder) wraps around: after the last entry comes the first one again
    const newPosition = (position + step + pagingList.length) % pagingList.length;
    openDetailPanel(pagingList[newPosition].id);
}

// Closes the detail panel and brings the sidebar back
function closeDetailPanel() {
    const id = app.openDetailId;
    app.openDetailId = null;
    document.body.classList.remove('detail-open');
    document.querySelector('#detail').hidden = true;

    // Keep the entry selected (with its popup) if it still passes the filters
    const stillVisible = app.visibleEntries.some(function (entry) { return entry.id === id; });
    if (stillVisible) {
        selectEntry(id, { flyTo: false });
    } else {
        clearSelection();
    }
}

// Clicks inside the detail panel: back, previous, next
document.querySelector('#detail').addEventListener('click', function (event) {
    const button = event.target.closest('[data-action]');
    if (!button) {
        return;
    }
    const action = button.dataset.action;
    if (action === 'close') {
        closeDetailPanel();
    } else if (action === 'previous') {
        showNeighbouringEntry(-1);
    } else if (action === 'next') {
        showNeighbouringEntry(1);
    }
});

// Keyboard shortcuts:
//   Esc          → close the detail panel, or the popup
//   ← and →      → previous / next entry while the detail panel is open
document.addEventListener('keydown', function (event) {
    // Ignore keys while typing in the search box or a dropdown, or while a pop-up window is open
    if (event.target.matches('input, select, textarea')) {
        return;
    }
    if (document.querySelector('#dialog').open) {
        return;
    }

    if (event.key === 'Escape') {
        if (app.openDetailId !== null) {
            closeDetailPanel();
        } else {
            clearSelection();
        }
    }
    if (app.openDetailId !== null && event.key === 'ArrowLeft') {
        showNeighbouringEntry(-1);
    }
    if (app.openDetailId !== null && event.key === 'ArrowRight') {
        showNeighbouringEntry(1);
    }
});


/* =====================================================================
   12. MAP / GRID / TIMELINE TABS
   ===================================================================== */

function switchView(view) {
    app.currentView = view;

    // Make the clicked tab white
    for (const tab of document.querySelectorAll('#view-tabs button')) {
        if (tab.dataset.view === view) {
            tab.classList.add('is-active');
        } else {
            tab.classList.remove('is-active');
        }
    }

    // Show the right panel. The map controls and status bar only make sense on the map.
    document.querySelector('#grid-view').hidden = (view !== 'grid');
    document.querySelector('#timeline-view').hidden = (view !== 'timeline');
    document.querySelector('.map-controls').hidden = (view !== 'map');
    document.querySelector('.statusbar').hidden = (view !== 'map');

    if (view === 'grid') {
        drawGrid();
    }
    if (view === 'timeline') {
        drawTimeline();
    }
}

document.querySelector('#view-tabs').addEventListener('click', function (event) {
    const tab = event.target.closest('[data-view]');
    if (tab) {
        switchView(tab.dataset.view);
    }
});

// Grid view: one card per filtered entry
function drawGrid() {
    const gridView = document.querySelector('#grid-view');

    if (app.visibleEntries.length === 0) {
        gridView.innerHTML = '<p class="empty">No entries match these filters.</p>';
        return;
    }

    let cards = '';
    for (const entry of app.visibleEntries) {
        // The image, or the material name as a placeholder
        let mediaHtml = escapeHtml(entry.material);
        if (entry.image) {
            mediaHtml = `<img src="${escapeHtml(entry.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
        }

        cards += `
            <button type="button" class="card" data-id="${entry.id}" style="${materialStyle(entry.material)}">
                <div class="media">${mediaHtml}</div>
                <div class="entry-title">${escapeHtml(entry.title)}</div>
                <div class="entry-meta">${escapeHtml(entry.summary)}</div>
            </button>`;
    }
    gridView.innerHTML = '<div class="grid">' + cards + '</div>';
}

// Timeline view: entries grouped by date (newest first, as they're already sorted)
function drawTimeline() {
    const timelineView = document.querySelector('#timeline-view');

    if (app.visibleEntries.length === 0) {
        timelineView.innerHTML = '<p class="empty">No entries match these filters.</p>';
        return;
    }

    // Group the entries: { '24.09.2026': [entry, entry], '23.09.2026': [entry], … }
    const groups = new Map();
    for (const entry of app.visibleEntries) {
        if (!groups.has(entry.date)) {
            groups.set(entry.date, []);
        }
        groups.get(entry.date).push(entry);
    }

    let html = '';
    for (const [date, entries] of groups) {
        html += `
            <div class="tl-group">
                <div class="tl-date">${escapeHtml(date) || 'Undated'}</div>
                <ul class="entry-list">${entries.map(makeEntryRow).join('')}</ul>
            </div>`;
    }
    timelineView.innerHTML = html;
}


/* =====================================================================
   13. MAP CONTROL BUTTONS (top right)
   ===================================================================== */

// Relief / Aerial: only one can be active at a time.
// Relief is your own map style; Aerial shows the satellite layer on top of it.
for (const button of document.querySelectorAll('[data-base]')) {
    button.addEventListener('click', function () {

        // Make only the clicked button white
        for (const other of document.querySelectorAll('[data-base]')) {
            other.classList.remove('is-active');
        }
        button.classList.add('is-active');

        if (map.getLayer('aerial')) {
            if (button.dataset.base === 'aerial') {
                map.setLayoutProperty('aerial', 'visibility', 'visible');
            } else {
                map.setLayoutProperty('aerial', 'visibility', 'none');
            }
        }
    });
}

// Contours: switches the contour lines and their labels on and off
document.querySelector('#toggle-contours').addEventListener('click', function (event) {
    const button = event.currentTarget;
    const isOn = button.classList.toggle('is-active');   // toggle adds or removes the class, and tells us which

    let visibility = 'none';
    if (isOn) {
        visibility = 'visible';
    }
    for (const layerId of ['contour-lines', 'contour-labels']) {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visibility);
        }
    }
});

// 3D: tilts the map to 65°, or back to flat (and facing north)
document.querySelector('#toggle-3d').addEventListener('click', function (event) {
    app.is3D = !app.is3D;   // flip true ↔ false
    event.currentTarget.classList.toggle('is-active', app.is3D);

    if (app.is3D) {
        map.easeTo({ pitch: 65, duration: 900 });              // 900 milliseconds animation
    } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 900 });  // bearing 0 = north at the top
    }
});

// Zoom buttons
document.querySelector('#zoom-in').addEventListener('click', function () {
    map.zoomIn();
});
document.querySelector('#zoom-out').addEventListener('click', function () {
    map.zoomOut();
});

// Compass: turns the map back to north (and flattens it, unless 3D is on)
document.querySelector('#compass').addEventListener('click', function () {
    if (app.is3D) {
        map.easeTo({ bearing: 0 });
    } else {
        map.easeTo({ bearing: 0, pitch: 0 });
    }
});

// Fullscreen: on and off
document.querySelector('#fullscreen').addEventListener('click', function () {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
});

// Keep the fullscreen button white while in fullscreen (also when leaving with the Esc key)
document.addEventListener('fullscreenchange', function () {
    const isFullscreen = Boolean(document.fullscreenElement);
    document.querySelector('#fullscreen').classList.toggle('is-active', isFullscreen);
});

// Turn the compass needle as the map rotates
map.on('rotate', function () {
    const compassIcon = document.querySelector('#compass svg');
    compassIcon.style.transform = 'rotate(' + (-map.getBearing()) + 'deg)';
});

// If the map is tilted with the mouse (right-click drag or Ctrl + drag),
// keep the 3D button in sync with it
map.on('pitchend', function () {
    app.is3D = map.getPitch() > 5;
    document.querySelector('#toggle-3d').classList.toggle('is-active', app.is3D);
});


/* =====================================================================
   14. STATUS BAR (bottom right): elevation, coordinates and scale
   ===================================================================== */

// Is the mouse over the map? If not, the status bar shows the centre of the map instead.
let mouseIsOverMap = false;

// Shows the elevation and coordinates of one spot on the map
function updateStatusBar(location) {
    let elevation = null;
    if (map.getTerrain()) {
        elevation = map.queryTerrainElevation(location, { exaggerated: false });
    }

    if (elevation === null || elevation === undefined) {
        document.querySelector('#st-elev').textContent = '— m';
    } else {
        document.querySelector('#st-elev').textContent = Math.round(elevation) + ' m';
    }

    document.querySelector('#st-coords').innerHTML = formatCoordinates([location.lng, location.lat], 4);
}

// Sizes the scale bar so it shows a round distance (like 200 m or 1 km)
// at a length of at most 150 pixels
function updateScaleBar() {
    const maxBarWidth = 150;

    // How many metres one pixel covers at the centre of the map.
    // 40,075,016 m is the Earth's circumference; the map shrinks it by half at every zoom level.
    const latitude = map.getCenter().lat;
    const metresPerPixel = (40075016.686 * Math.cos(latitude * Math.PI / 180)) / (512 * Math.pow(2, map.getZoom()));

    // The longest distance the bar could show
    const maxMetres = metresPerPixel * maxBarWidth;

    // Pick the largest "round" number that fits: 5, 2 or 1 × a power of ten
    // For example, if maxMetres is 340 → try 500 (too big), then 200 ✓
    const powerOfTen = Math.pow(10, Math.floor(Math.log10(maxMetres)));
    let roundDistance = powerOfTen;
    if (5 * powerOfTen <= maxMetres) {
        roundDistance = 5 * powerOfTen;
    } else if (2 * powerOfTen <= maxMetres) {
        roundDistance = 2 * powerOfTen;
    }

    document.querySelector('#scale-bar').style.width = Math.round(roundDistance / metresPerPixel) + 'px';

    if (roundDistance >= 1000) {
        document.querySelector('#scale-label').textContent = (roundDistance / 1000) + ' km';
    } else {
        document.querySelector('#scale-label').textContent = roundDistance + ' m';
    }
}

// The mouse moves over the map → show that spot
map.on('mousemove', function (event) {
    mouseIsOverMap = true;
    updateStatusBar(event.lngLat);
});

// The mouse leaves the map → show the centre of the map
map.getCanvasContainer().addEventListener('mouseleave', function () {
    mouseIsOverMap = false;
    updateStatusBar(map.getCenter());
});

// The map moves → update the scale (and the centre values if the mouse isn't on the map)
map.on('move', function () {
    if (!mouseIsOverMap) {
        updateStatusBar(map.getCenter());
    }
    updateScaleBar();
});

// The map has finished loading tiles → elevation data may now be available
map.on('idle', function () {
    if (!mouseIsOverMap) {
        updateStatusBar(map.getCenter());
    }
});

// Fill in the status bar as soon as the map is ready
map.on('load', function () {
    updateStatusBar(map.getCenter());
    updateScaleBar();
});


/* =====================================================================
   15. ABOUT / ADD FIELDWORK WINDOWS
   Both are placeholders for now. Edit the text below to change them.
   ===================================================================== */

function openWindow(html) {
    document.querySelector('#dialog-body').innerHTML = html;
    document.querySelector('#dialog').showModal();
}

// Close the window with the × button, or by clicking the dark area around it
document.querySelector('#dialog').addEventListener('click', function (event) {
    const clickedCloseButton = event.target.matches('[data-close]');
    const clickedOutside = (event.target === event.currentTarget);
    if (clickedCloseButton || clickedOutside) {
        document.querySelector('#dialog').close();
    }
});

document.querySelector('#about').addEventListener('click', function () {
    openWindow(`
        <h2>Fieldarchives 0.1</h2>
        <p>A web map of fieldwork material — photography, audio, samples, 3D models, drawings, video and fieldnotes — collected across the valley.</p>`);
});

document.querySelector('#add-fieldwork').addEventListener('click', function () {
    openWindow(`
        <h2>Add fieldwork</h2>
        <p>Uploading new entries isn't available yet.</p>`);
});


/* =====================================================================
   16. MOUNTAIN PEAK LABELS
   Your map style doesn't include peak names, so we borrow the peak label
   design from a Mapbox example style ("mapbox-map-design") and add it to
   your map. When the map is tilted steeply (60° or more), the labels are
   raised up on thin vertical "leader lines" so they stay readable.

   This is the most technical part of the file. You shouldn't need to change it.
   ===================================================================== */

const LABEL_SOURCE_STYLE = 'mapbox-map-design/claitl3i0002715qm9990tl95';   // the style we borrow from
const LABEL_LAYER_ID = 'natural-point-label';                              // its label layer
const IMAGE_PREFIX = 'peak-';                                              // added to the borrowed icon names, so they never clash with your own icons
const NEEDED_ICONS = ['leader_line', 'mountain-15', 'volcano-15'];         // the icons the labels use

async function addPeakLabels() {

    // --- 1. Download the example style and find its label layer ---
    const styleResponse = await fetch(
        'https://api.mapbox.com/styles/v1/' + LABEL_SOURCE_STYLE + '?access_token=' + MAPBOX_TOKEN
    );
    const borrowedStyle = await styleResponse.json();
    const labelLayer = borrowedStyle.layers.find(function (layer) {
        return layer.id === LABEL_LAYER_ID;
    });

    // --- 2. Download the style's icons ---
    // A style keeps all its icons in one big image (a "sprite"), plus a list
    // saying where each icon sits inside it. Here we turn the style's sprite
    // address into a normal web address:
    //   mapbox://sprites/owner/id/code  →  https://api.mapbox.com/styles/v1/owner/id/code/sprite@2x
    const spriteAddress = borrowedStyle.sprite.replace('mapbox://sprites/', 'https://api.mapbox.com/styles/v1/') + '/sprite@2x';

    const iconListResponse = await fetch(spriteAddress + '.json?access_token=' + MAPBOX_TOKEN);
    const iconPositions = await iconListResponse.json();
    const spriteImage = await loadImage(spriteAddress + '.png?access_token=' + MAPBOX_TOKEN);

    // --- 3. Cut out the icons we need and add them to the map ---
    // We draw the big image on an invisible canvas, then copy out each icon's rectangle.
    const canvas = document.createElement('canvas');
    canvas.width = spriteImage.width;
    canvas.height = spriteImage.height;
    const drawing = canvas.getContext('2d', { willReadFrequently: true });
    drawing.drawImage(spriteImage, 0, 0);

    for (const iconName of NEEDED_ICONS) {
        const position = iconPositions[iconName];
        if (!position) {
            continue;   // skip icons that don't exist in the sprite
        }
        if (map.hasImage(IMAGE_PREFIX + iconName)) {
            continue;   // already added
        }
        const pixels = drawing.getImageData(position.x, position.y, position.width, position.height);
        map.addImage(IMAGE_PREFIX + iconName, pixels, { pixelRatio: position.pixelRatio });
    }

    // --- 4. Add the place names data ---
    // The labels come from Mapbox Streets, which contains named natural features
    map.addSource('peak-labels', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8'
    });

    // Keep only mountain peaks and volcanoes (not lakes, glaciers etc.)
    const onlyPeaks = ['all', labelLayer.filter, ['match', ['get', 'maki'], ['mountain', 'volcano'], true, false]];

    // --- 5. Flat labels, shown while the map is tilted less than 60° ---
    // structuredClone makes a full copy, so we can change it without touching the original
    const flatLabels = structuredClone(labelLayer);
    flatLabels.id = 'peak-label';
    flatLabels.source = 'peak-labels';
    // The label: the mountain icon, a line break, then the English name (or the local name)
    flatLabels.layout['text-field'] = [
        'format',
        ['image', ['concat', IMAGE_PREFIX, ['get', 'maki'], '-15']], {},
        '\n', {},
        ['coalesce', ['get', 'name_en'], ['get', 'name']], {}
    ];
    flatLabels.filter = ['all', onlyPeaks, ['<', ['pitch'], 60]];

    // --- 6. Raised labels with a leader line, shown when tilted 60° or more ---
    const raisedLabels = structuredClone(flatLabels);
    raisedLabels.id = 'peak-label-elevated';
    raisedLabels.layout['icon-image'] = IMAGE_PREFIX + 'leader_line';   // the thin vertical line
    raisedLabels.layout['icon-anchor'] = 'bottom';                      // the line stands on the peak
    raisedLabels.layout['text-offset'] = [0, -12.5];                    // lift the text to the top of the line
    raisedLabels.filter = ['all', onlyPeaks, ['>=', ['pitch'], 60]];

    // --- 7. Add both layers underneath the fieldwork points ---
    map.addLayer(flatLabels, 'fw-points');
    map.addLayer(raisedLabels, 'peak-label');
}

// Loads an image from a web address, and waits until it has finished downloading
function loadImage(address) {
    return new Promise(function (resolve, reject) {
        const image = new Image();
        image.crossOrigin = 'anonymous';   // needed so we're allowed to read the image's pixels
        image.onload = function () {
            resolve(image);
        };
        image.onerror = reject;
        image.src = address;
    });
}
