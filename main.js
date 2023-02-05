var express = require('express');
var http = require('http');
var path = require('path');
var cookieParser = require('cookie-parser');
var cookieVerifier = require('cookie-signature');
var pg = require('pg');

var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var io = new Server(server);

const cookieSecret = '7878gf5fvhjbhuyttycrtdxersedgiug778gy';

const pool = new pg.Pool({
	host: 'localhost',
	database: 'mess',
	user: 'postgres',
	password: '12345678'
});

function random_salt(){
	return "1234567890popiuytrewqasdfghjklkmnbvcxz";
}

function hash(s){
	return s;
}

async function correctPassword(username, password){
	var result = await pool.query("select * from users where username=$1;", [username]);
	if(!result) return false;
	var row = result.rows[0];
	if(!row) return false;
	return (row.password === hash(password + row.salt));
}

function addUser(username, password, city){
	var salt = random_salt();
	var hashedPassword = hash(password + salt);
	pool.query("insert into users (username, salt, password, city) values ($1, $2, $3, $4);", [username, salt, hashedPassword, city]);
}

async function getUserId(username){
	var result = await pool.query("select * from users where username=$1;", [username]);
	if(result.rows[0] === undefined) return undefined;
	return result.rows[0].id;
}

async function getUsername(userId){
	var result = await pool.query("select * from users where id=$1;", [userId]);
	if(result.rows[0] === undefined) return undefined;
	return result.rows[0].username;
}

function authorize(req, res, next){
	if(!req.signedCookies.signed_user_id){
		res.redirect('/login');
	}else{
		next();
	}
}

function unsign(cookie){
	if(cookie === undefined || cookie.substr(0, 2) !== "s:") return;
	var unsigned = cookieVerifier.unsign(cookie.slice(2), cookieSecret);
	if(!unsigned) return undefined;
	return unsigned;
}

async function sendMessage(senderUsername, receiverUsername, content, messagetime){
	var result = await pool.query("insert into messages (id_sender, id_receiver, content, messagetime) values ($1, $2, $3, $4);", 
		     [await getUserId(senderUsername), await getUserId(receiverUsername), content, messagetime]);

	return result;
}

async function getMessages(senderUsername, receiverUsername){
	var result = await pool.query("select * from messages where id_sender=$1 and id_receiver=$2;", [await getUserId(senderUsername), await getUserId(receiverUsername)]);

	return result;
}

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(cookieSecret));

app.get('/', (req, res) => {
	res.render('login', { message: "" });
});

app.get('/chat/:receiverHandle', authorize, async (req, res) => {
	var result = await getUserId(req.params.receiverHandle);
	if(result === undefined){
		res.redirect('/');
		return;
	}
	res.render('chat', { receiverHandle: req.params.receiverHandle });
});

app.get('/favicon.ico', (req, res) => {
	res.sendFile(path.join(__dirname, '/images/favicon.ico'));
});

app.get('/login', (req, res) => {
	res.render('login', { message: "" });
});

app.post('/login', (req, res) => {
	var username = req.body.username;
	var password = req.body.password;

	correctPassword(username, password).then(ans => {
	if(ans){
		res.cookie('signed_user_id', username, { signed: true, encode: String });
		res.redirect('/');
	}else{
		res.render('login', { message: "Invalid username or password." });
	}});
});

app.get('/register', (req, res) => {
	res.render('register');
});

app.post('/register', (req, res) => {
	var username = req.body.username;
	var password = req.body.password;
	var city = req.body.city;

	addUser(username, password, city);
	res.redirect('/login');

});

app.get('/logout', authorize, (req, res) => {
	res.cookie('signed_user_id', '', { maxAge: -1 });
	res.redirect('/');
});

io.on('connection', (socket) => {
	console.log("New agent (" + socket.id + ") connected!");
	socket.on('chat message', async (msg, senderCookie, receiverHandle) => {
		senderHandle = unsign(senderCookie);
		if(senderHandle === undefined) return;
		var result = await sendMessage(senderHandle, receiverHandle, msg, Date.now());
		if(result){
			socket.emit('ack', msg, senderHandle, receiverHandle);
		}else{
			socket.emit('nak', msg, senderHandle, receiverHandle);
		}
		
	});

	socket.on('refresh messages', async (senderCookie, receiverHandle) => {
		senderHandle = unsign(senderCookie);
		if(senderHandle === undefined) return;
		var result = await getMessages(receiverHandle, senderHandle);
		result.rows.forEach(r => {
			socket.emit('msg', r.content, receiverHandle, senderHandle);
		});
	});
});

server.listen(80);
