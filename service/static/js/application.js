var server = ''

var ajaxPromise = function (url, data, dataType) {
  return new Promise((resolve, reject) => {
   	$.ajax(url, {
   		data: data,
   		dataType: dataType,
   		success: response => resolve(response),
   		error: (jqXHR, status, err) => reject(err)
   	})
  });
}


var getLayer = function(url,attrib) {
	return L.tileLayer(url, { maxZoom: 18, attribution: attrib });
};


var Layers = {
	stamen: {
		toner:  'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',   
		terrain: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png',
		watercolor: 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.png',
		attrib: 'Map data &copy;2013 OpenStreetMap contributors, Tiles &copy;2013 Stamen Design'
	},
	mapBox: {
		azavea:     'https://{s}.tiles.mapbox.com/v3/azavea.map-zbompf85/{z}/{x}/{y}.png',
		worldLight: 'https://c.tiles.mapbox.com/v3/mapbox.world-light/{z}/{x}/{y}.png',
		attrib: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://mapbox.com">MapBox</a>'
	}
};


var map = (function() {
	var selected = getLayer(Layers.mapBox.azavea,Layers.mapBox.attrib);
	var baseLayers = {
	"Default" : selected,
		"World Light" : getLayer(Layers.mapBox.worldLight,Layers.mapBox.attrib),
		"Terrain" : getLayer(Layers.stamen.terrain,Layers.stamen.attrib),
		"Watercolor" : getLayer(Layers.stamen.watercolor,Layers.stamen.attrib),
		"Toner" : getLayer(Layers.stamen.toner,Layers.stamen.attrib),
	};

	var m = L.map('map');

	m.setView([32.623530, -81.107941], 9);

	selected.addTo(m);

	m.lc = L.control.layers(baseLayers).addTo(m);
	return m;
})()


var Model = function (config) {
	var m = new Backbone.Model()
	m.set("groups", config.groups)
	m.set("layers", config.layers)
	m.set("numBreaks", config.numBreaks)
	m.set("opacity", config.opacity)
	m.set("ramp", config.ramp)
	m.set("polygons", [])
	return m
}


var weightedOverlay = (function() {

	var layers = [];

	var layersToWeights = {}

	var breaks = null;
	var WOLayer = null;
	var opacity = 0.5;
	var colorRamp = "blue-to-red";
	var numBreaks = 10;

	getLayers   = function() {
		var notZeros = _.filter(layers, function(l) { return l.weight != 0 });
		return _.map(notZeros, function(l) { return l.name; }).join(",");
	};

	getWeights   = function() {
		var notZeros = _.filter(layers, function(l) { return l.weight != 0 });
		return _.map(notZeros, function(l) { return l.weight; }).join(",");
	};

	update = function() {        
		if(getLayers().length == 0) { 
			if (WOLayer) {
				map.lc.removeLayer(WOLayer);
				map.removeLayer(WOLayer);
				WOLayer = null;
			}
			return; 
		};

		$.ajax({
			url: server + 'gt/breaks',
			data: { 'layers' : getLayers(), 
					'weights' : getWeights(),
					'numBreaks': numBreaks },
			dataType: "json",
			success: function(r) {
				breaks = r.classBreaks;

				if (WOLayer) {
					map.lc.removeLayer(WOLayer);
					map.removeLayer(WOLayer);
				}

				var layerNames = getLayers();
				if(layerNames == "") return;

				WOLayer = new L.tileLayer(server + 
					'gt/tms/{z}/{x}/{y}?layers={layers}' +
					 '&weights={weights}&breaks={breaks}&colorRamp={colorRamp}', {
					format: 'image/png',
					breaks: breaks,
					transparent: true,
					layers: layerNames,
					weights: getWeights(),
					colorRamp: colorRamp,
					attribution: 'NEMAC'
				});

				WOLayer.setOpacity(opacity);
				WOLayer.addTo(map);
				map.lc.addOverlay(WOLayer, "Weighted Overlay");
			}
		})
	}

	var initView = function (model) {

		var View = Backbone.View.extend({

			model: model,

			 events: {
				"click .param-layer-checkbox" : "_toggleParam"
			},

			template: _.template(
				$("script#param-group-template").html(),
				{variable: "data"}
			),

			initialize: function () {
				this.render(),
				this._initListeners()
			},

			_initListeners: function () {
				this.delegateEvents()
				this.listenTo(this.model, "change", this.render)
			},

			render: function () {
				this.$el.html(this.template(this.model.attributes))
				return this
			},

			_toggleParam: function (e) {
				var el = e.target
				var layers = this.model.get("layers")
				var _layer
				_.each(layers, function (layer) {
					if (layer.name === el.id) {
						_layer = layer
						var weight = Number(el.checked)
						layer.weight = weight
					}
				})
				this.model.trigger("layerchange", _layer)
			}

		})

		return new View()

	}

	// Opacity
	var opacitySlider = $("#opacity-slider").slider({
		value: opacity,
		min: 0,
		max: 1,
		step: .02,
		slide: function( event, ui ) {
			opacity = ui.value;
			WOLayer.setOpacity(opacity);
		}
	});

	return {

		activeLayers: getLayers,
		activeWeights: getWeights,
		
		setLayers: function(title, ls) { 
			layers = ls;
			update(); 
		},
		setNumBreaks: function(nb) {
			numBreaks = nb;
			update();
		},
		setOpacity: function(o) {
			opacity = o;
			opacitySlider.slider('value', o);
		},
		setColorRamp: function(key) { 
			colorRamp = key;
			update();
		},
		getColorRamp: function() { return colorRamp; },

		update: update,

		getMapLayer: function() { return WOLayer; },

		init: function (m) {
			model = m
			this.setLayers(model.get("groups"), model.get("layers"));
			this.setNumBreaks(model.get("numBreaks"));
			this.setOpacity(model.get("opacity"));
			this.setColorRamp(model.get("ramp"))
			this.view = initView(model)
		}

	};

})();


var summary = (function() {
	var model
	var weights = {};

	var updateSummaryGroups = function (switchTab) {

		var groups = _.map(model.get("groups"), g => {
			g.layers = model.get("layers").filter(layer => {
				return layer.group === g.id && layer.weight !== 0
			})
			g.layerIds = g.layers.map(layer => layer.name).join(",")
			g.weights = g.layers.map(layer => layer.weight).join(",")
			return g
		})

		var proms = []

		var polys = model.get("polygons")

		_.each(polys, poly => {

			var geoJson = GJ.fromPolygon(poly.layer)

			_.each(groups, g => {
				var p = ajaxPromise('gt/sum', {
					polygon: geoJson,
					layers: g.layerIds,
					weights: g.weights
				})
				proms.push(p)
			})

		})

		Promise.all(proms).then(responses => {

			var polygons = model.get("polygons")

			var i = 0
			while (i < responses.length) {
				_.each(polygons, poly => {
					poly.scores = []
					_.each(groups, g => {
						poly.scores.push({
							id: g.id,
							total: responses[i].total,
							layers: responses[i].layerSummaries
						})
						i += 1
					})					
				})
			}

			model.set("polygons", polygons)
			model.trigger("change")

			if(switchTab) { $('a[href=#summary]').tab('show'); };

		})


	}

	var initView = function (model) {

		var View = Backbone.View.extend({

			model: model,

			template: _.template(
				$("script#summary-group-template").html(),
				{variable: "data"}
			),

			initialize: function () {
				this.render(),
				this._initListeners()
			},

			_initListeners: function () {
				this.delegateEvents()
				this.listenTo(this.model, "change", this.render)
			},

			render: function () {
				this.$el.html(this.template(this.model.attributes))
				var exposureScoreTableRow = $("#exposure-summary tr.warning")
				exposureScoreTableRow.empty()
				exposureScoreTableRow.append('<td class="bold">Score:</td>')

				_.each(model.get("polygons"), poly => {
					var exposureScore = _.reduce(poly.scores, (a, b) => (Number(a.total) * Number(b.total)).toFixed(2))
					exposureScore = String(exposureScore)
					classString = "bold score"
					if (poly.layer.active) {
						classString += " active"
					}
					exposureScoreTableRow.append(
							`<td class="${classString}" style="text-align:right;">${exposureScore}</td>`
					)
				})

				return this
			}

		})

		return new View()

	}

	var update = function(switchTab) {
		
		if(model.get("polygons").length) {
			if(weightedOverlay.activeLayers().length == 0) {
				$(".summary-data").empty();
				return;
			};
		}

		updateSummaryGroups(switchTab)
	}

	return {
		init: function (m) {
			model = m
			this.view = initView(model)
		},
		updateSummaryGroups: updateSummaryGroups,
		getPolygon: function() { return polygon; },
		setPolygon: function(p) {
			var polygons = model.get("polygons")
			polygons.push({
				layer: p,
				scores: _.map(_.pluck(model.get("groups"), "id"), groupId => {
					return {
						id: groupId,
						layers: _.map(
							_.filter(model.get("layers"), layer => {
								return layer.group === groupId
							}),
							layer => {
								return {
									id: layer.name
								}
							}
						)
					}
				})
			})
			model.set("polygons", polygons)
			//weightedOverlay.update();
			update(true);
		},
		setLayers: function(ls) {
			_.map(ls, function(l) {
				layers[l.name] = l.display;
				weights[l.name] = l.weight;
			});
		},
		setLayerWeight: function(layerId, weight) {
			var layer = model.get("layers").filter(layer => layer.name === layerId)[0]
			layer.weight = weight
		},
		update: update,
		clear: function() {
			if(polygon) {
				drawing.clear(polygon);
				polygon = null;
				weightedOverlay.update();
				$('a[href=#parameters]').tab('show');
				$(".summary-data").empty();
			}
		}
	}

})();


var drawing = (function() {
	var drawnItems = new L.FeatureGroup();
	map.addLayer(drawnItems);

	var drawOptions = {
		draw: {
		position: 'topleft',
			marker: false,
			polyline: false,
			rectangle: false,
			circle: false,
		polygon: {
			title: 'Draw a polygon for summary information.',
			allowIntersection: false,
			drawError: {
			color: '#b00b00',
			timeout: 1000
			},
			shapeOptions: {
			color: '#338FF2'
			}
		},
		},
		edit: false
	};

	var drawControl = new L.Control.Draw(drawOptions);
	map.addControl(drawControl);

	map.on('draw:created', function (e) {
		if (e.layerType === 'polygon') {
			drawnItems.addLayer(e.layer)
			summary.setPolygon(e.layer);
			e.layer.on("mouseover", function (e) {
				e.layer.active = true
				summary.updateSummaryGroups(true)
			})
			e.layer.on("mouseout", function (e) {
				e.layer.active = false
				summary.updateSummaryGroups(true)
			})
		}
	})

	map.on('draw:edited', function(e) {
		/*
		var polygon = summary.getPolygon();
		if(polygon != null) { 
			summary.update();
			weightedOverlay.update();
		}
		*/
	});

	map.on('draw:drawstart', function(e) {

	});

	map.on('draw:drawstop', function(e) {

	});

	map.on('draw', function (e) {
		console.log('hi')
		console.log(e)
	})

	return {
		clear: function(polygon) {
			drawnItems.removeLayer(polygon);
		}
	}
})();


var colorRamps = (function() {
	var makeColorRamp = function(colorDef) {
		var ramps = $("#color-ramp-menu");
		var p = $("#colorRampTemplate").clone();
		p.find('img').attr("src",colorDef.image);
		p.click(function() {
			$("#activeRamp").attr("src",colorDef.image);
			weightedOverlay.setColorRamp(colorDef.key);
		});
		if(colorDef.key == weightedOverlay.getColorRamp()) {
			$("#activeRamp").attr("src",colorDef.image);
		}
		p.show();
		ramps.append(p);
	}

	return { 
		bindColorRamps: function() {
			$.ajax({
				url: 'gt/colors',
				dataType: 'json',
				success: function(data) {
					_.map(data.colors, makeColorRamp)
				}
			});
		}
	}
})();


var setupSize = function() {
	var bottomPadding = 10;

	var resize = function(){
		var pane = $('#main');
		var height = $(window).height() - pane.offset().top - bottomPadding;
		pane.css({'height': height +'px'});

		var sidebar = $('#tabBody');
		var height = $(window).height() - sidebar.offset().top - bottomPadding;
		sidebar.css({'height': height +'px'});

		var mapDiv = $('#map');
		var wrapDiv = $('#wrap');
		var height = $(window).height() - mapDiv.offset().top - bottomPadding - wrapDiv.height();
		mapDiv.css({'height': height +'px'});
		map.invalidateSize();
	};
	resize();
	$(window).resize(resize);
};


var getConfig = function (cb) {
	$.ajax({
		dataType: "json",
		url: "config.json",
		data: {},
		statusCode: {
			200: cb
		}
	})
}


var init = function (data) {

	var model = Model(data.weightedOverlay)

	summary.init(model)
	weightedOverlay.init(model)

	model.on("layerchange", function (layer) {
		weightedOverlay.update()
		summary.setLayerWeight(layer.name, layer.weight);
		summary.update(false);
	})

	$("#parameters").append(weightedOverlay.view.el)
	$("#summary").append(summary.view.el)

	colorRamps.bindColorRamps();

	$('#clearButton').click( function() {
		summary.clear();
		return false;
	});

	setupSize();
}

$(document).ready(function () {
	getConfig(init)
})

