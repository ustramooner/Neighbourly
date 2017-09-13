var makeMap = function(stateColors) {
  var map = L.map('map');

  var mesh_layer; //Rendered map
  var last_update_bounds;
  var last_update_centroid;

  var tileLayer = L.tileLayer('http://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  $('#address_search_form').submit(function(event) {
    event.preventDefault();
    FitPcode($('#address_search').val());
  });

  var FitPcode = function(pcode) {
    $.getJSON('/pcode_get_bounds?pcode=' + pcode, function(json) {
      if (json) {
      map.fitBounds([[json.swlat,json.swlng],[json.nelat,json.nelng]])
    }
    else {alert("Postcode not found");}
    });
  };

  var FindLocation = function() {
    var lat = Cookies.get("lat");
    var lng = Cookies.get("lng");
    var pcode = Cookies.get("postcode");
    if (lat && lng) {
      var zoom = Cookies.set("zoom");
        if (zoom) {
        map.setView([lat,lng],zoom)
        }
        else {
          map.setView([lat,lng],15)
        }
    }
    else if (pcode) {
      FitPcode(pcode)
    }
    else {
      var australia_coord = [-29.8650, 131.2094];
      map.setView(australia_coord, 5);
    }
  };

  FindLocation();

  function addGeoJsonProperties(json) {

  var layer = L.geoJson(json,{
    style: function(feature) {
        switch (feature.properties.claim_status) {
        case 'claimed_by_you': return stateColors.claimed_by_you
        case 'claimed': return stateColors.claimed
        case 'quarantine': return stateColors.quarantine
        default: return stateColors.unclaimed
        }
      },
    onEachFeature: function(feature, featureLayer) {
      featureLayer._leaflet_id = feature.properties.slug;

      function downloadmesh (mesh_id) {
        var base64str = $.get('https://4oqtu02x7f.execute-api.ap-southeast-2.amazonaws.com/prod/map?slug=' + mesh_id, function(base64str) {
          //TODO - potentially hit the AWS endpoint directly

          //decode base64 string
          var binary = atob(base64str.base64.replace(/\s/g, ''));
          var len = binary.length;
          var buffer = new ArrayBuffer(len);
          var view = new Uint8Array(buffer);
          for (var i = 0; i < len; i++) {
            view[i] = binary.charCodeAt(i);
          }

          //create the blob object
          var blob = new Blob([view], {type: "application/pdf"});

          //create clickable URL for download
          var url = window.URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = mesh_id + '.pdf';
          a.click();
          $('#load').addClass('hidden');
        })
      };

      this.btnClaim = function (featureLayer) {
        var leaflet_id = this._leaflet_id;
        $.post("/claim_meshblock/" + leaflet_id);
        $('.unclaim').removeClass('hidden');
        $('.download').removeClass('hidden');
        $('.claim').addClass('hidden');
        this.setStyle(stateColors.claimed_by_you)
        $('#load').removeClass('hidden');
        downloadmesh(leaflet_id);
      }

      this.btnUnclaim = function (featureLayer) {
        $.post("/unclaim_meshblock/" + this._leaflet_id);
        this.setStyle(stateColors.unclaimed)
          $('.unclaim').addClass('hidden');
          $('.download').addClass('hidden');
          $('.claim').removeClass('hidden');
      }

      this.btnDownload = function (featureLayer) {
        var leaflet_id = this._leaflet_id;
        $('#load').removeClass('hidden');
        downloadmesh(leaflet_id);
      }

      function create_popup_btn(container, div_class, btn_text_inner, faq_text_inner) {
          var grpdiv = L.DomUtil.create('div', 'popupgrp hidden ' + div_class, container)
          var txtdiv = L.DomUtil.create('div', 'popuptxt txt' + div_class, grpdiv)
            txtdiv.innerHTML = faq_text_inner
          var btndiv = L.DomUtil.create('div', 'popupbutton btn' + div_class, grpdiv)
          var btn = L.DomUtil.create('button', '', btndiv)
            btn.setAttribute('type', 'button')
            btn.innerHTML = btn_text_inner
          var btndom = L.DomEvent
            btndom.addListener(btn, 'click', L.DomEvent.stopPropagation)
            btndom.addListener(btn, 'click', L.DomEvent.preventDefault)
            return { grpdiv, btn, btndom }
        };

      var container = L.DomUtil.create('div')
      var claimout = create_popup_btn(container, 'claim','Claim + Download',
        'Click to claim area and download PDF of addresses to doorknock.<br>');
        claimout.btndom.addListener(claimout.btn, 'click', this.btnClaim, featureLayer);
      var unclaimout = create_popup_btn(container, 'unclaim','Unclaim',
        'Click to remove your claim on this area.<br>');
        unclaimout.btndom.addListener(unclaimout.btn, 'click', this.btnUnclaim, featureLayer);
      var downloadout = create_popup_btn(container, 'download','Download',
        'Click to download your claimed area.<br>')
        downloadout.btndom.addListener(downloadout.btn, 'click', this.btnDownload, featureLayer);
      var otherstxtcontainer = L.DomUtil.create('div', 'popuptxt hidden otherstext', container)
        otherstxtcontainer.innerHTML = 'This area is claimed by someone else and is unable to be claimed.'
      var quarantinetxtcontainer = L.DomUtil.create('div', 'popuptxt hidden quarantinetext', container)
        quarantinetxtcontainer.innerHTML = 'This area is coordinated by a central event. ' +
        '<a href="http://www.yes.org.au/centrally_coordinated_door_knocking_events">Click here</a> to go to it.';
      if (feature.properties.claim_status === 'claimed_by_you') {
        L.DomUtil.removeClass(unclaimout.grpdiv, 'hidden');
        L.DomUtil.removeClass(downloadout.grpdiv, 'hidden');
        var popup = L.popup({},featureLayer).setContent(container);
      }
      else if (feature.properties.claim_status === 'claimed') {
        L.DomUtil.removeClass(otherstxtcontainer, 'hidden');
        var popup = L.popup({},featureLayer).setContent(container);
      }
      else {
        L.DomUtil.removeClass(claimout.grpdiv, 'hidden');
        var popup = L.popup({},featureLayer).setContent(container);
      }
      featureLayer.bindPopup(popup)

    }
  });

    return layer;
  };

  function getMeshblockCallback(json) {
    if (mesh_layer) {map.removeLayer(mesh_layer)};
    mesh_layer = addGeoJsonProperties(json);
    mesh_layer.addTo(map);
    $('#load').addClass('hidden');
  };

  var instruct = L.control();
  instruct.onAdd = function(map) {
    this._div = L.DomUtil.create('div', 'instruct'); // create a div with a class "instruct"
    this._div.innerHTML = "Zoom in further to load doorknockable areas.";
    this.update();
    return this._div;
  }

  instruct.update = function() {
    $(".instruct").toggleClass('hidden', map.getZoom() > 14)
  }

  instruct.addTo(map);

  function updateMap() {
    var lat_lng_bnd = map.getBounds();
    var lat_lng_centroid = map.getCenter();
    Cookies.set("lat",lat_lng_centroid.lat);
    Cookies.set("lng",lat_lng_centroid.lng);
    if (last_update_centroid) {
      var distance_moved = lat_lng_centroid.distanceTo(last_update_centroid);
    }
    else {var distance_moved = 201};
    var zoom = map.getZoom();
    if (zoom > 14) {
      var reload_dist = 1000/(zoom-14);
      }
      else {
        var reload_dist = 0;
      };
    Cookies.set("zoom",zoom);
    var swlat = lat_lng_bnd.getSouthWest().lat;
    var swlng = lat_lng_bnd.getSouthWest().lng;
    var nelat = lat_lng_bnd.getNorthEast().lat;
    var nelng = lat_lng_bnd.getNorthEast().lng;
    //Reload map if zoom not too high
    //and
    //there is no last_update or the current map bounds are not within the last update's
    if(zoom > 14 && (!last_update_bounds || distance_moved > reload_dist) &&
      (!last_update_bounds || !last_update_bounds.contains(lat_lng_bnd))) {
      $('#load').removeClass('hidden');
      var url = '/meshblocks_bounds?swlat=' + swlat + '&swlng=' + swlng
      + '&nelat=' + nelat + '&nelng=' + nelng;
      $.getJSON(url, function(json) {
        getMeshblockCallback(json);
        last_update_bounds = map.getBounds();
        last_update_centroid = map.getCenter();
      });
    }
    instruct.update();
  };

  map.on('moveend', function() {
    updateMap();
  });

  var legend = L.control({position: 'bottomright'});

  legend.onAdd = function(map) {
    var div = L.DomUtil.create('div', 'legend');
    div.innerHTML = [
      '<div><b>This block is claimed by</b></div>',
      '<i style="background:' + stateColors.claimed_by_you.fillColor + '"></i><div>Me</div>',
      '<i style="background:' + stateColors.claimed.fillColor + '"></i><div>Someone else</div>',
      '<i style="background:' + stateColors.quarantine.fillColor + '"></i><div>A doorknocking event</div>',
      '<i style="background:' + stateColors.unclaimed.fillColor + '"></i><div>No one</div>'
    ].join('');
    return div;
  }

  legend.addTo(map);
  map.whenReady(updateMap);
}

var windowHeight = function(){
    if(window.innerHeight != undefined){
        return window.innerHeight;
    }
    else{
        var B= document.body, D= document.documentElement;
        return Math.max(D.clientHeight, B.clientHeight);
    }
}

$('#map').height(windowHeight() - $('.header').height());
$('#map').width("100%");

var stateColors =  {
  claimed_by_you: {"fillColor": "#9d5fa7", "color": "#111111",
    "weight": 1, "opacity": 0.65, "fillOpacity": 0.8}, //Purple
  unclaimed: {"fillColor": "#059ad6", "color": "#111111",
    "weight": 1, "opacity": 0.65, "fillOpacity": 0.2}, //Red
  claimed: {"fillColor": "#ffc746", "color": "#111111",
    "weight": 1, "opacity": 0.65, "fillOpacity": 0.8}, //Blue
  quarantine: {"fillColor": "#6dbd4b", "color": "#111111",
    "weight": 1, "opacity": 0.65, "fillOpacity": 0.8}, //Yellow
};

var map = makeMap(stateColors);
