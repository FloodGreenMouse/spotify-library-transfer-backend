const config = require('./config')
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const cacheControl = require('express-cache-controller')
const request = require('request')
const SpotifyWebApi = require('spotify-web-api-node');

const credentials = {
	clientId: config.clientID,
	clientSecret: config.clientSecret,
	redirectUri: config.clientRedirect
}

let access_token = null
let refresh_token = null

const spotifyApi = new SpotifyWebApi(credentials)

const app = express()

app.use(cors())
app.use(bodyParser())
app.use(cacheControl())

const handleError = (err, res) => {
	err.statusCode === 401 ? res.status(401).send('Unauthorized') : res.status(500).send('Internal server error')
}

const refreshAccessToken = () => {
	if (refresh_token) {
		spotifyApi.refreshAccessToken().then(
			function(data) {
				console.log('The access token has been refreshed!');
				access_token = data.body.access_token
				refresh_token = data.body.refresh_token
				spotifyApi.setAccessToken(access_token)
				spotifyApi.setRefreshToken(refresh_token)
			},
			function(err) {
				console.log(`Could not refresh access token [${err.message} ${err.statusCode}]`)
			}
		)
	}
}

app.use('/*', function(req, res, next) {
	refreshAccessToken()
	next()
})

app.use(function(err, req, res, next) {
	handleError(err, res)
	console.log(`Something went wrong! [${err.message} ${err.statusCode}]`)
})

app.get('/', (req, res) => {
	res.send('pong')
})

app.get('/login', (req, res) => {
	const scopes = 'user-read-private user-read-email playlist-modify-private playlist-modify-public user-library-modify user-library-read user-follow-modify'

	const authLink = 'https://accounts.spotify.com/authorize'
		+ '?response_type=code'
		+ '&client_id=' + config.clientID
		+ (scopes ? '&scope=' + encodeURIComponent(scopes) : '')
		+ '&redirect_uri=' + encodeURIComponent(config.clientRedirect)

	res.send(authLink)
})

app.get('/logout', (req, res) => {
	spotifyApi.resetAccessToken()
	console.log('User logout')
})

app.get('/get-access-token', (req, res) => {
	const options = {
		method: 'POST',
		url: 'https://accounts.spotify.com/api/token',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		form: {
			grant_type: 'authorization_code',
			code: req.query.code,
			redirect_uri: config.clientRedirect,
			client_id: config.clientID,
			client_secret: config.clientSecret
		}
	}

	request(options, function (error, response) {
		if (error) throw new Error(error)
		const body = JSON.parse(response.body)
		access_token = body.access_token
		refresh_token = body.refresh_token

		// Set tokens to spotifyApi
		spotifyApi.setAccessToken(access_token)
		spotifyApi.setRefreshToken(refresh_token)

		// Send response with tokens to client
		res.send(response.body)
	})
})

app.get('/refresh', (req, res) => {
	if (req.query.refresh_token) {
		refresh_token = req.query.refresh_token
		spotifyApi.refreshAccessToken().then(
			function(data) {
				console.log('The access token has been refreshed!');
				access_token = data.body.access_token
				refresh_token = data.body.refresh_token
				spotifyApi.setAccessToken(access_token)
				spotifyApi.setRefreshToken(refresh_token)
				res.send({
					access_token,
					refresh_token
				})
			},
			function(err) {
				console.log(`Could not refresh access token [${err.message} ${err.statusCode}]`)
			}
		)
	}
})

app.get('/whoami', (req, res) => {
	spotifyApi.getMe()
		.then(data => {
			data.body.access_token = access_token
			data.body.refresh_token = refresh_token
			res.send(data.body)
		}, err => {
			handleError(err, res)
			console.log(`Something went wrong! [${err.message} ${err.statusCode}]`)
		})
})

app.get('/get-album', (req, res) => {
	const artist = req.query.artist
	const album = req.query.album
	spotifyApi.searchTracks(`${artist} - ${album}`, { limit : 1, offset : 0, type: 'album' }).then(
		function(data) {
			res.send(data.body)
		},
		function(err) {
			handleError(err, res)
			console.log(`Something went wrong! [${err.message} ${err.statusCode}]`)
		}
	);
})

app.get('/add-album', (req, res) => {
	const albumIDs = []
	albumIDs.push(req.query.id)

	spotifyApi.addToMySavedAlbums(albumIDs)
		.then(data => {
			res.send(data)
		}, err => {
			handleError(err, res)
			console.log(`Something went wrong! [${err.message} ${err.statusCode}]`)
		})
})

app.get('/remove-album', (req, res) => {
	const albumIDs = []
	albumIDs.push(req.query.id)

	spotifyApi.removeFromMySavedAlbums(albumIDs)
		.then(data => {
			res.send(data)
		}, err => {
			handleError(err, res)
			console.log(`Something went wrong! [${err.message} ${err.statusCode}]`)
		})
})

app.listen(config.port, () => {
	console.log(`\nAPI app start on port ${config.port}`)
})
