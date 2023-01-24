var express = require('express');
var http = require('http');

var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', './views');

app.get('/', (req, res) => {
	res.render('index');
})

io.on('connection', (socket) => {
	console.log("xivlo to rzal");
	socket.on('chat message', (msg) => {
		console.log(socket.id);
		socket.emit('xd', msg);
	});
});

server.listen(80);
