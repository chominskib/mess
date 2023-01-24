var express = require('express');
var http = require('http');
var path = require('path');

var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', './views');

app.get('/', (req, res) => {
	res.render('index');
});

app.get('/favicon.ico', (req, res) => {
	res.sendFile(path.join(__dirname, '/images/favicon.ico'));
});

io.on('connection', (socket) => {
	console.log("xivlo to rzal");
	socket.on('chat message', (msg) => {
		socket.emit('ack', msg);
	});
});

server.listen(80);
