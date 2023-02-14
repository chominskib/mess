var express = require('express');
var http = require('http');
var path = require('path');
var cookieParser = require('cookie-parser');
var cookieVerifier = require('cookie-signature');
var crypto = require('crypto');
var pg = require('pg');
var fs = require('fs');
var randomstring = require("randomstring")

var app = express();
var server = http.createServer(app);
var { Server } = require('socket.io');
var io = new Server(server, {maxHttpBufferSize: 1e8});

const cookieSecret = 'TGuCOHg66xgbFvHMBtHJnsuiSgrTQi9e10C87VFGrPC1MBzNv9QB5Y5ZMGl4G1Co';

const pool = new pg.Pool({
	host: 'localhost',
	database: 'mess',
	user: 'postgres',
	password: '12345678'
});

function random_salt(){
	return crypto.randomBytes(32).toString('hex');
}

function hash(s){
	return crypto.createHash('sha256').update(s).digest('hex');
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

async function sendMessage(senderUsername, receiverUsername, content, messagetime, attachment_name, attachment_real_name){
	var result = await pool.query("insert into messages (id_sender, id_receiver, content, messagetime, attachment, attachment_name) values ($1, $2, $3, $4, $5, $6);", 
		     [await getUserId(senderUsername), await getUserId(receiverUsername), content, messagetime, attachment_name, attachment_real_name]);

	return result;
}

async function getMessages(senderUsername, receiverUsername, lastUpdate){
	var result = await pool.query("select * from messages where id_sender=$1 and id_receiver=$2 and messagetime > $3;", [await getUserId(senderUsername), await getUserId(receiverUsername), lastUpdate]);

	return result.rows;
}

async function verifyAttachment(username, attachment, lastUpdate){
	return true;
	var result = await pool.query("select * from messages where (id_sender=$1 or id_receiver=$1) and attachment=$2;", [await getUserId(username), attachment]);

	return result.rows!=0;
}

async function getListOfUsers(){
	var result = await pool.query("select * from users;");

	return result.rows;
}

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(cookieSecret));
app.use(express.static('scripts/'));
app.use(express.static('styles/'));
app.use(express.static('attachments/'));

app.get('/attachments/:name', async (req, res) => {
	var result = req.params.name;
	if (verifyAttachment(req, result.substring(0, 32)))
		res.sendFile(path.join(__dirname, '/attachments/' + result));
});

app.get('/styles/bg.png', (req, res) => {
	res.sendFile(path.join(__dirname, '/styles/bg.png'));
});

app.get('/styles/style.css', (req, res) => {
	res.sendFile(path.join(__dirname, '/styles/style.css'));
});

app.get('/scripts/chat.js', (req, res) => {
	res.sendFile(path.join(__dirname, '/scripts/chat.js'));
});

app.get('/', authorize, async (req, res) => {
	res.render('welcome', { contacts: await getListOfUsers() } );
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

app.get('*', (req, res) => { res.redirect('/'); });

io.on('connection', (socket) => {
	console.log("New agent (" + socket.id + ") connected!");
	socket.on('chat message', async (msg, att, att_real_name, senderCookie, receiverHandle) => {
		senderHandle = unsign(senderCookie);
		if(senderHandle === undefined) return;

		var att_name = '';
		if (att) att_name = randomstring.generate();

		var result = await sendMessage(senderHandle, receiverHandle, msg, Date.now(), att_name, att_real_name);

		if(result){
			socket.emit('ack', msg, senderHandle, receiverHandle);
		}else{
			socket.emit('nak', msg, senderHandle, receiverHandle);
		}
		if (att) fs.writeFile(path.join(__dirname, '/attachments/') + att_name + "-" + att_real_name, att, (err) => {
			if (err)	console.log(err);
			else		console.log("Wrote file " + att_real_name + " as " + att_name + "-" + att_real_name);
		});
	});

	socket.on('refresh messages', async (askerCookie, targetHandle, lastUpdate) => {
		askerHandle = unsign(askerCookie);
		if(askerHandle === undefined) return;
		var result_from = await getMessages(targetHandle, askerHandle, lastUpdate);
		var result_to = await getMessages(askerHandle, targetHandle, lastUpdate);

		var askerId = await getUserId(askerHandle);
		var targetId = await getUserId(targetHandle);

		result = result_from.concat(result_to).sort((a, b) => (a.messagetime < b.messagetime ? -1 : 1));
		var messages = [];
		for (var r of result){
			if (r.id_sender == askerId) {
				messages.push({mine: true, msg: r.content, att: r.attachment, att_name: r.attachment_name, senderHandle: askerHandle, time: r.messagetime})
			} else {
				messages.push({mine: false, msg: r.content, att: r.attachment, att_name: r.attachment_name, senderHandle: targetHandle, time: r.messagetime})
			}
		}
		socket.emit("load plenty", messages);
		/*
		result.forEach(r => {
			if (r.attachment) {
				if(r.id_sender == askerId) socket.emit('msg from me', r.content, r.attachment, r.attachment_name, askerHandle, targetHandle, r.messagetime);
				else if(r.id_sender == targetId) socket.emit('msg', r.content, r.attachment, r.attachment_name, targetHandle, askerHandle, r.messagetime);
			} else {
				if(r.id_sender == askerId) socket.emit('msg from me', r.content, null, "", askerHandle, targetHandle, r.messagetime);
				else if(r.id_sender == targetId) socket.emit('msg', r.content, null, "", targetHandle, askerHandle, r.messagetime);

			}
		});
		*/
	});
});

server.listen(80);

