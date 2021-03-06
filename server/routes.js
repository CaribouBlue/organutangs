var express = require('express');
var Meeting = require('../database-mongo/models/meeting.js');
const router = express.Router();
const config = require('./config.js');
var axios = require('axios');
const forecast = require('./weather.js');

// APIs
const gmaps = require('./google-maps.js');
const yelp = require('./yelp.js');

var routerInstance = function(io) {
  router.post('/meetings', function (req, res) {
    const { userId, userLocation, friendId } = req.body;
    Meeting.remove({ userId })
    .then(() => {
      var newMeeting = new Meeting({ userId, userLocation, friendId });
      newMeeting.save((err) => {
        if (err) {
          console.error("unicorn", err);
          res.status(401).send('User already exists!');
        } else {
          console.log('New meeting saved!');
          res.send();
        }
      });
    })
  });

  router.post('/two-locations', function(req, res) {

    const { userId, location1, location2, mode, query} = req.body;
    const catergory = query || 'food';

    var APIKEY = config.google.APIKEY;

    var address1 = encodeURIComponent((location1.address).trim()); // Replaces spaces in path with %20
    var geocodeUrl1 = `https://maps.googleapis.com/maps/api/geocode/json?address=${address1}&key=${APIKEY}`;

    axios.get(geocodeUrl1)
      .then((geocode1) => {
        var lat1 = geocode1.data.results[0].geometry.location.lat;
        var lng1 = geocode1.data.results[0].geometry.location.lng;
        var coordinates1 = [ lat1, lng1 ];

        var address2 = encodeURIComponent((location2.address).trim()); // Replaces spaces in path with %20
        var geocodeUrl2 = `https://maps.googleapis.com/maps/api/geocode/json?address=${address2}&key=${APIKEY}`;

        axios.get(geocodeUrl2)
          .then((geocode2) => {
            var lat2 = geocode2.data.results[0].geometry.location.lat;
            var lng2 = geocode2.data.results[0].geometry.location.lng;
            var coordinates2 = [ lat2, lng2 ];

            // console.log('coordinates1', coordinates1);
            // console.log('coordinates2', coordinates2);

            // get midpoint
            gmaps.generateMidpoint(coordinates1, coordinates2, mode)
              .then((midpoint) => {
                //console.log('Midpoint generated:', midpoint);
                // Put midpoint in Forecast API
                forecast.forecastRequest(midpoint, (err, weather) => {
                  io.sockets.emit('weather', weather);
                });

                // Put midpoint in Yelp API
                yelp.yelpRequest(midpoint,catergory)
                  .then((yelpLocations) => {
                    // Re-render client
                    io.sockets.emit('midpoint', { lat: midpoint.latitude, lng: midpoint.longitude });
                    io.sockets.emit('meeting locations', yelpLocations);

                    // formatted as { location1: [lat,lng], location2: [lat, lng] }
                    io.sockets.emit('user locations', {
                      location1: { lat: coordinates1[0], lng: coordinates1[1] },
                      location2: { lat: coordinates2[0], lng: coordinates2[1] }
                    });
                  });
              });

            res.send('Results found.');
          })
          .catch((err) => console.log("Err getting geocode from Google API"), err);
      })
      .catch((err) => console.log("Err getting geocode from Google API", err));

  });

  // TODO Getting the results of the match
  // router.get('/matches', function (req, res) {
  // });
  router.post('/autoComplete' , (req , res) =>{
      yelp.yelpAutoComplete(req.body)
        .then((words) => {
          res.send(words);
        });
  });

  router.post('/friends',(req ,res) => {
    console.log('here');
    Meeting.find(req.body.userId)
      .then((meetings)=>{
        var friends = [...new Set(meetings.map(meeting=>meeting.friendId))];
        res.send(friends);
      });
  });
  return router;
};




module.exports = routerInstance;
