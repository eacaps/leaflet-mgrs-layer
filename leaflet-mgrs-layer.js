import geodesy, {LatLon} from 'https://cdn.jsdelivr.net/gh/chrisveness/geodesy@2.0.1/mgrs.js';
/**
 * ES6 version of https://www.simplegrg.com/
 */

export default class LeafletMgrsLayer extends L.LayerGroup {
	constructor(options) {
		super([], options);
		this.nw_latlon = new LatLon(1, 1);
		this.sw_latlon = new LatLon(1, 1);
		this.ne_latlon = new LatLon(1, 1);
		this.se_latlon = new LatLon(1, 1);
		this.sw_grid_latlon = new LatLon(1, 1);
		this.ne_grid_latlon = new LatLon(1, 1);

		this.westernmost_lon = 0;
		this.easternmost_lon = 0;
		this.northernmost_lat = 0;
		this.southernmost_lat = 0;
		this.grid_width = 0;
		this.grid_height = 0;

		this.sw_grid_utm = {};
		this.ne_grid_utm = {};

		this.grid_south_row = [];
		this.grid_north_row = [];
		this.grid_west_column = [];
		this.grid_east_column = [];

		this.line_style_map = {
			default: {
				color: '#F00',
				weight: 1,
				opacity: 0.5
			},
			10000: {
				color: '#F00',
				weight: 2,
				opacity: 0.5
			},
			100000: {
				color: '#F00',
				weight: 2,
				opacity: 0.5
			}
		};
		this.font_style_map = {
			default: {
				fill: '#F00',
				'font-size': '14',
			},
			100000: {
				fill: '#F00',
				'font-size': '14',
			}
		};
	}

	getEvents() {
		return {
			'moveend': this._moveEndHandler
		};
	}

	_moveEndHandler() {
		this.clearLayers(true);
		this._update();
	}

	setBounds(map_bounds) {
		this.nw_latlng = map_bounds.getNorthWest();
		this.sw_latlng = map_bounds.getSouthWest();
		this.ne_latlng = map_bounds.getNorthEast();
		this.se_latlng = map_bounds.getSouthEast();

		//update geodesy LatLon objects from Leaflet LagLng objects
		this.nw_latlon.lat = this.nw_latlng.lat;
		this.nw_latlon.lon = this.nw_latlng.lng;
		this.sw_latlon.lat = this.sw_latlng.lat;
		this.sw_latlon.lon = this.sw_latlng.lng;
		this.ne_latlon.lat = this.ne_latlng.lat;
		this.ne_latlon.lon = this.ne_latlng.lng;
		this.se_latlon.lat = this.se_latlng.lat;
		this.se_latlon.lon = this.se_latlng.lng;

		//These comparison protect against warped/rotated map regions.
		//The corners are used to identify the extreme eastings/northings.
		this.easternmost_lon = this.ne_latlon.lon;
		if (this.se_latlon.lon > this.easternmost_lon) {
			this.easternmost_lon = this.se_latlon.lon;
		}
		this.westernmost_lon = this.nw_latlon.lon;
		if (this.sw_latlon.lon < this.westernmost_lon) {
			this.westernmost_lon = this.sw_latlon.lon;
		}
		this.southernmost_lat = this.sw_latlon.lat;
		if (this.se_latlon.lat < this.southernmost_lat) {
			this.southernmost_lat = this.se_latlon.lat;
		}
		this.northernmost_lat = this.nw_latlon.lat;
		if (this.ne_latlon.lat > this.northernmost_lat) {
			this.northernmost_lat = this.ne_latlon.lat;
		}

		//Define grid width and height:
		this.grid_width = this.easternmost_lon - this.westernmost_lon;
		this.grid_height = this.northernmost_lat - this.southernmost_lat;

		//Define grid overlay extreme southwest and northeast corners as LatLon objects
		//with an extra 10% buffer beyond rendered area:
		this.sw_grid_latlon.lon = this.westernmost_lon - 0.1 * this.grid_width;
		this.sw_grid_latlon.lat = this.southernmost_lat - 0.1 * this.grid_height;
		this.ne_grid_latlon.lon = this.easternmost_lon + 0.1 * this.grid_width;
		this.ne_grid_latlon.lat = this.northernmost_lat + 0.1 * this.grid_height;

		//Save results to UTM.  Truncate to establish 1m baseline.
		this.sw_grid_utm = this.sw_grid_latlon.toUtm();
		this.sw_grid_utm.easting = Math.floor(this.sw_grid_utm.easting);
		this.sw_grid_utm.northing = Math.floor(this.sw_grid_utm.northing);
		this.sw_grid_latlon = this.sw_grid_utm.toLatLon();

		this.ne_grid_utm = this.ne_grid_latlon.toUtm();
		this.ne_grid_utm.easting = Math.floor(this.ne_grid_utm.easting);
		this.ne_grid_utm.northing = Math.floor(this.ne_grid_utm.northing);
		this.ne_grid_latlon = this.ne_grid_utm.toLatLon();
	}

	_determineScale(zoom) {
		if (this.options.determineScale) {
			return this.options.determineScale(zoom);
		}
		let size = 1000;
		if (zoom > 21.5) {
			size = 1;
		} else if (zoom > 18) {
			size = 10;
		} else if (zoom > 14.5) {
			size = 100;
		} else if (zoom > 11) {
			size = 1000;
		} else if (zoom > 9.5) {
			size = 10000;
		} else if (zoom > 8.5) {
			size = 100000;
		} else {
			size = -1;
		}
		return size;
	}

	_buildGrids() {
		const zoom = this._map.getZoom();

		const size = this._determineScale(zoom);
		if (size < 0)
			return;

		let temp_utm = this.sw_grid_latlon.toUtm();
		let temp = Math.floor(temp_utm.easting);
		temp_utm.easting = temp - (temp % size);
		temp = Math.floor(temp_utm.northing);
		temp_utm.northing = temp - (temp % size);

		this.grid_south_row = [];
		this.grid_south_row.push(temp_utm.toLatLon());

		let x = 0;
		while (this.grid_south_row[x].lon < this.ne_grid_latlon.lon) {
			const line = this._nextGridLine(this.grid_south_row[x].toUtm(), 'east', size);
			this.grid_south_row.push(line);
			x++;
		}

		this.grid_west_column = [];
		this.grid_west_column.push(temp_utm.toLatLon());
		let y = 0;
		while (this.grid_west_column[y].lat < this.ne_grid_latlon.lat) {
			const line = this._nextGridLine(this.grid_west_column[y].toUtm(), 'north', size);
			this.grid_west_column.push(line);
			y++;
		}

		this.grid_north_row = [];
		this.grid_north_row.push(this.grid_west_column[y]);
		let xx = 0;
		while (xx < x) {
			const line = this._nextGridLine(this.grid_north_row[xx].toUtm(), 'east', size);
			this.grid_north_row.push(line);
			xx++;
		}

		this.grid_east_column = [];
		this.grid_east_column.push(this.grid_south_row[x]);
		let yy = 0;
		while (yy < y) {
			const line = this._nextGridLine(this.grid_east_column[yy].toUtm(), 'north', size);
			this.grid_east_column.push(line);
			yy++;
		}

		this._drawLines(size)
    }
    
    _nextGridLine(start_point_utm, dir, grid_distance) {
        let new_point_utm = start_point_utm;
        let vertical = false;
        // if (start_point_utm.hemisphere == 'S') { hemisphere = -1; }
        switch (dir) {
            case "north":
                vertical = true;
                break;
            case "south":
                vertical = true;
                grid_distance *= -1;
                break;
            case "west":
                grid_distance *= -1;
        }

        if (vertical) {
            new_point_utm.northing += grid_distance;
            if (new_point_utm.northing < 0) {
                if (new_point_utm.hemisphere == 'N') { new_point_utm.hemisphere = 'S'; } else { new_point_utm.hemisphere = 'N'; }
                new_point_utm.northing *= -1;
            }
            return new_point_utm.toLatLon();
        } else {
            new_point_utm.easting += grid_distance;
            return new_point_utm.toLatLon();
        }
    }

	_getStyleForScale(size, style_map) {
		const default_style = style_map.default;
		const size_style = style_map[size];
		return size_style ? size_style : default_style;
	}

	_drawLines(size) {
		let x;
		let y;
		// we've got some crazy math to determine the text padding using log10!
		const text_padding = Math.max(1, Math.ceil(5 - Math.log10(size)));
		const line_style = this._getStyleForScale(size, this.line_style_map);
		const font_style = this._getStyleForScale(size, this.font_style_map);

		for (x = 0; x < this.grid_south_row.length; x++) {
			const south_point = this.grid_south_row[x];
			const north_point = this.grid_north_row[x];
			let cur_easting = south_point.toUtm().easting.toFixed(0);
			if (size >= 10000) {
				cur_easting = parseInt(cur_easting) + 999;
				cur_easting = cur_easting - (cur_easting % size);
			}
			if (cur_easting % size == 0) {
				const grid_line = L.polyline([
					south_point, north_point
				], line_style);
				this.addLayer(grid_line);
				if (size > 10000) {
				} else {
					let label = (cur_easting / size) % (100000 / size);
					// grid_line.setText(
					// 	label.toString().padStart(text_padding, '0'), {
					// 		repeat: false,
					// 		attributes: Object.assign({ dx: (this._map.getSize().y * 0.1) }, font_style)
					// 	}
					// );
				}
			}
		}

		for (y = 0; y < this.grid_west_column.length; y++) {
			const west_point = this.grid_west_column[y];
			const east_point = this.grid_east_column[y];
			let cur_northing = west_point.toUtm().northing.toFixed(0);
			if (size >= 10000) {
				cur_northing = parseInt(cur_northing) + 999;
				cur_northing = cur_northing - (cur_northing % size);
			}
			if (cur_northing % size == 0) {
				// label = (cur_northing / size) % (100000 / size);

				const grid_line = L.polyline([
					west_point, east_point
				], line_style);
				this.addLayer(grid_line);
				if (size > 10000) {
				} else {
					let label = (cur_northing / size) % (100000 / size);
					// grid_line.setText(
					// 	label.toString().padStart(text_padding, '0'), {
					// 		repeat: false,
					// 		attributes: Object.assign({ dx: (this._map.getSize().x * 0.1) }, font_style)
					// 	}
					// );
				}
			}
		}
	}

	_update() {
		try {
			const map_bounds = this._map.getBounds();
			this.setBounds(map_bounds);
			this._buildGrids();
		} catch (e) {
            // ignore out of zone grids
            console.log(e);
		}
	}

	onAdd(map) {
		this._update();
	}
}
