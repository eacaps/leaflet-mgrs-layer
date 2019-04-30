import LeafletMgrsLayer from './leaflet-mgrs-layer.js';

console.log('starting script');

var mymap = L.map('mapid').setView([51.505, -0.09], 13);
L.tileLayer('https://c.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    id: 'osm_map',
}).addTo(mymap);

const layer = new LeafletMgrsLayer();
layer.addTo(mymap);