var express = require('express');
var http = require('http');
var path = require('path');
var cookieParser = require('cookie-parser');
var cookieVerifier = require('cookie-signature');

var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var io = new Server(server);

const cookieSecret = '7878gf5fvhjbhuyttycrtdxersedgiug778gy';

function correctPassword(username, password){
	return true;
}

function getUserId(username){
	return username;
}

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(cookieSecret));

app.get('/', (req, res) => {
	res.render('index');
});

app.get('/favicon.ico', (req, res) => {
	res.sendFile(path.join(__dirname, '/images/favicon.ico'));
});

app.get('/login', (req, res) => {
	res.render('login');
});

app.post('/login', (req, res) => {
	var username = req.body.username;
	var password = req.body.password;

	if(correctPassword(username, password)){
		res.cookie('user_id', getUserId(username), { signed: true, encode: String });
		res.redirect('/');
	}else{
		res.render(login, { message: "Invalid username or password." });
	}
});

io.on('connection', (socket) => {
	console.log("New agent (" + socket.id + ") connected!");
	socket.on('chat message', (msg, sender) => {
		var senderHandle = cookieVerifier.unsign(sender.slice(2), cookieSecret);
		socket.emit('ack', msg);
		socket.broadcast.emit('msg', msg, senderHandle);
	});
});

server.listen(80);
